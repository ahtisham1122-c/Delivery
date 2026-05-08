import { supabase } from './supabaseClient';
import { SyncPayload } from '../types';

/**
 * DairyPro PK - Relational Data Service
 * Handles granular persistence to Postgres tables.
 */
export const relationalDataService = {
  /**
   * Maps camelCase (JS) to snake_case (Postgres)
   */
  toSnakeCase(obj: any) {
    const snake: any = {};
    if (!obj) return snake;
    for (const key in obj) {
      if (obj[key] !== undefined) {
        const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        snake[snakeKey] = obj[key];
      }
    }
    return snake;
  },

  /**
   * Maps snake_case (Postgres) to camelCase (JS)
   */
  toCamelCase(obj: any) {
    const camel: any = {};
    for (const key in obj) {
      if (key === 'id') {
        camel[key] = obj[key];
        continue;
      }
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      camel[camelKey] = obj[key];
    }
    return camel;
  },

  /**
   * Fetches a single table with pagination and optional revision filter.
   */
  async fetchTable(tableName: string, sinceRevision: number = 0, dateLimit: string | null = null) {
    let allRows: any[] = [];
    let from = 0;
    const step = 1000;
    let hasMore = true;

    while (hasMore) {
      let query = supabase.from(tableName).select('*');
      
      if (sinceRevision > 0) {
        // Step 6: Pagination and Delta Sync
        // Fetch items updated since last sync OR items that were never versioned
        query = query.or(`version.gt.${sinceRevision},version.eq.0,version.is.null`);
      }

      if (dateLimit && (tableName === 'dp_deliveries' || tableName === 'dp_payments')) {
        query = query.gte('date', dateLimit);
      }

      // Use range for pagination
      const { data, error } = await query
        .order('id', { ascending: true }) // Stable ordering for pagination
        .range(from, from + step - 1);

      if (error) {
        if (error.code === 'PGRST205') return [];
        throw error;
      }
      
      if (data && data.length > 0) {
        allRows = [...allRows, ...data.map(item => this.toCamelCase(item))];
        if (data.length < step) {
          hasMore = false;
        } else {
          from += step;
        }
      } else {
        hasMore = false;
      }
    }
    return allRows;
  },

  /**
   * Fetches authoritative customer balances from the Supabase view
   */
  async fetchBalancesFromServer(): Promise<Record<string, number>> {
    try {
      const { data, error } = await supabase
        .from('dp_customer_balances')
        .select('customer_id, balance');
      if (error) throw error;
      const balanceMap: Record<string, number> = {};
      (data || []).forEach(row => {
        balanceMap[row.customer_id] = Math.round((row.balance || 0) * 100) / 100;
      });
      return balanceMap;
    } catch (err) {
      console.error('fetchBalancesFromServer failed:', err);
      return {};
    }
  },

  /**
   * Fetches data from relational tables to populate the app state.
   * Supports delta sync if sinceRevision is provided.
   */
  async fetchAll(sinceRevision: number = 0): Promise<SyncPayload> {
    const today = new Date();
    today.setMonth(today.getMonth() - 1);
    const firstDayStr = new Date(today.getFullYear(), today.getMonth(), 1).toLocaleDateString('en-CA');

    const tables = [
      { key: 'riders', table: 'dp_riders', limit: null },
      { key: 'customers', table: 'dp_customers', limit: null },
      { key: 'prices', table: 'dp_prices', limit: null },
      { key: 'deliveries', table: 'dp_deliveries', limit: firstDayStr },
      { key: 'payments', table: 'dp_payments', limit: firstDayStr },
      { key: 'expenses', table: 'dp_expenses', limit: firstDayStr },
      { key: 'riderLoads', table: 'dp_rider_loads', limit: firstDayStr },
      { key: 'closingRecords', table: 'dp_closing_records', limit: firstDayStr }
    ];

    const results = await Promise.all(
      tables.map(async ({ key, table, limit }) => {
        const data = await this.fetchTable(table, sinceRevision, limit);
        return { key, data };
      })
    );
    
    const serverBalances: Record<string, number> = {};
    try {
      // Pass the firstDayStr to our RPC to get balances exactly as of that cutoff date
      const { data, error } = await supabase.rpc('get_start_of_month_balances', { target_date: firstDayStr });
      if (!error && data) {
        data.forEach((row: any) => {
          serverBalances[row.customer_id] = Math.round((row.balance || 0) * 100) / 100;
        });
      }
    } catch {
      console.warn("Failed to fetch server balances");
    }

    const syncPayload: SyncPayload = {
      customers: [],
      riders: [],
      deliveries: [],
      payments: [],
      prices: [],
      expenses: [],
      riderLoads: [],
      closingRecords: [],
      archives: [],
      auditLogs: [],
      serverBalances,
      revision: sinceRevision
    };

    results.forEach(({ key, data }) => {
      if (key === 'archives') {
        syncPayload[key as keyof SyncPayload] = data.map((arc: any) => {
          if (arc.payload) {
            const { payload: arcPayload, ...rest } = arc;
            const unpackedPayload = typeof arcPayload === 'string' ? JSON.parse(arcPayload) : arcPayload;
            return { ...rest, ...unpackedPayload };
          }
          return arc;
        });
      } else {
        (syncPayload as any)[key] = data;
      }
    });

    return syncPayload;
  },

  /**
   * Fetches the current system revision.
   */
  async getRevision(): Promise<number> {
    try {
      const { data, error } = await supabase
        .from('dp_metadata')
        .select('value')
        .eq('key', 'system_revision')
        .single();
      
      if (error || !data) return 0;
      return Number(data.value) || 0;
    } catch {
      return 0;
    }
  },

  /**
   * Updates the system revision.
   */
  async updateRevision(newRevision: number): Promise<void> {
    const { error } = await supabase
      .from('dp_metadata')
      .upsert(
        { 
          key: 'system_revision', 
          value: newRevision, 
          updated_at: new Date().toISOString() 
        },
        { onConflict: 'key' }
      );
    if (error) {
      console.error('Failed to update revision:', error);
    }
  },

  /**
   * Persists a collection of entities to their respective table.
   */
  async persistCollection(entityType: string, data: any[]) {
    if (!data || data.length === 0) return;

    const tableMap: Record<string, string> = {
      riders: 'dp_riders',
      customers: 'dp_customers',
      prices: 'dp_prices',
      deliveries: 'dp_deliveries',
      payments: 'dp_payments',
      expenses: 'dp_expenses',
      archives: 'dp_archives',
      auditLogs: 'dp_audit_logs',
      riderLoads: 'dp_rider_loads',
      closingRecords: 'dp_closing_records'
    };

    const tableName = tableMap[entityType];
    if (!tableName) return;

    const mappedData = data.map(item => {
      if (entityType === 'archives') {
        const { id, year, month, updatedAt, version, deleted, ...payloadData } = item;
        return this.toSnakeCase({ id, year, month, updatedAt, version, deleted, payload: payloadData });
      }
      return this.toSnakeCase(item);
    });

    const batchSize = 100;
    for (let i = 0; i < mappedData.length; i += batchSize) {
      const batch = mappedData.slice(i, i + batchSize);
      const { error } = await supabase
        .from(tableName)
        .upsert(batch);

      if (error) throw error;
    }
  },

  /**
   * Deletes records from a table within a date range.
   */
  async deleteByDateRange(tableName: string, startDate: string, endDate: string) {
    const { error } = await supabase
      .from(tableName)
      .delete()
      .gte('date', startDate)
      .lte('date', endDate);
    
    if (error) throw error;
  },

  /**
   * Soft-deletes records from a table within a date range (sets deleted=true).
   */
  async softDeleteByDateRange(tableName: string, startDate: string, endDate: string) {
    const { error } = await supabase
      .from(tableName)
      .update({ deleted: true, updated_at: new Date().toISOString() })
      .gte('date', startDate)
      .lte('date', endDate);
    
    if (error) throw error;
  },

  /**
   * Full state sync (Relational version)
   */
  async syncAll(state: any) {
    const keys = [
      'riders', 'customers', 'prices', 'deliveries', 
      'payments', 'expenses', 'archives', 'auditLogs',
      'riderLoads', 'closingRecords'
    ];

    await Promise.all(
      keys.map(key => this.persistCollection(key, state[key]))
    );
  }
};