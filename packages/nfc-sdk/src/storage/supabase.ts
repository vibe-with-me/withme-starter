import type { SupabaseClient } from '@supabase/supabase-js';
import type { StorageAdapter } from './adapter.js';
import type {
  CreateTagInput,
  ListScansFilter,
  ListTagsFilter,
  Scan,
  ScanInsert,
  Tag,
  UpdateTagInput,
} from '../types.js';

export interface SupabaseStorageAdapterOptions {
  tagsTable?: string;
  scansTable?: string;
}

/**
 * StorageAdapter backed by Supabase, against the schema in sql/ (0001 and 0002).
 * Takes an already-constructed SupabaseClient — this SDK never creates clients
 * or manages keys/auth. The tables are server-only (0002), so pass a
 * server-side client holding the secret key, never a browser client.
 */
export class SupabaseStorageAdapter implements StorageAdapter {
  private readonly client: SupabaseClient;
  private readonly tagsTable: string;
  private readonly scansTable: string;

  constructor(client: SupabaseClient, options: SupabaseStorageAdapterOptions = {}) {
    this.client = client;
    this.tagsTable = options.tagsTable ?? 'tags';
    this.scansTable = options.scansTable ?? 'scans';
  }

  async getTagByUid(uid: string): Promise<Tag | null> {
    const { data, error } = await this.client
      .from(this.tagsTable)
      .select('*')
      .eq('nfc_uid', uid)
      .maybeSingle();
    if (error) throw new Error(`getTagByUid(${uid}) failed: ${error.message}`);
    return (data as Tag | null) ?? null;
  }

  async createTag(input: CreateTagInput): Promise<Tag> {
    const row = {
      nfc_uid: input.nfc_uid,
      destination_url: input.destination_url,
      label: input.label ?? null,
      destination_type: input.destination_type ?? 'redirect',
      is_active: input.is_active ?? true,
      metadata: input.metadata ?? {},
    };
    const { data, error } = await this.client.from(this.tagsTable).insert(row).select().single();
    if (error) throw new Error(`createTag(${input.nfc_uid}) failed: ${error.message}`);
    return data as Tag;
  }

  async updateTag(uid: string, patch: UpdateTagInput): Promise<Tag> {
    const { data, error } = await this.client
      .from(this.tagsTable)
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('nfc_uid', uid)
      .select()
      .single();
    if (error) throw new Error(`updateTag(${uid}) failed: ${error.message}`);
    return data as Tag;
  }

  deactivateTag(uid: string): Promise<Tag> {
    return this.updateTag(uid, { is_active: false });
  }

  async listTags(filter: ListTagsFilter = {}): Promise<Tag[]> {
    let query = this.client.from(this.tagsTable).select('*');
    if (filter.is_active !== undefined) query = query.eq('is_active', filter.is_active);
    query = query.order('created_at', { ascending: true });
    if (filter.limit !== undefined) query = query.limit(filter.limit);
    const { data, error } = await query;
    if (error) throw new Error(`listTags failed: ${error.message}`);
    return (data ?? []) as Tag[];
  }

  async insertScan(scan: ScanInsert): Promise<void> {
    const { error } = await this.client.from(this.scansTable).insert(scan);
    if (error) throw new Error(`insertScan failed: ${error.message}`);
  }

  async listScans(filter: ListScansFilter): Promise<Scan[]> {
    let query = this.client.from(this.scansTable).select('*');
    if (filter.tag_id !== undefined) query = query.eq('tag_id', filter.tag_id);
    if (filter.since !== undefined) query = query.gte('scanned_at', filter.since);
    if (filter.until !== undefined) query = query.lte('scanned_at', filter.until);
    query = query.order('scanned_at', { ascending: false });
    if (filter.limit !== undefined) query = query.limit(filter.limit);
    const { data, error } = await query;
    if (error) throw new Error(`listScans failed: ${error.message}`);
    return (data ?? []) as Scan[];
  }
}
