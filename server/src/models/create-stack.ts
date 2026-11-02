import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from '../config/env.ts'
import { DiskBlobStore, SupabaseBlobStore, type BlobStore } from '../services/blobs.ts'
import { SupabaseStore } from './supabase-store.ts'
import { JsonStore, type Store } from './store.ts'

export interface Stack {
  store: Store
  blobs: BlobStore
  mode: 'supabase' | 'local-files'
  supabase?: SupabaseClient
}

/**
 * Supabase (Postgres + private Storage bucket) whenever it is configured; local JSON/disk only in development.
 * Production never falls back to local files: serverless filesystems are read-only/ephemeral and files would be lost.
 */
export function createStack(): Stack {
  if (env.isProd && env.storageMode === 'local') throw new Error('STORAGE_MODE=local is not allowed in production')
  if (env.storageMode !== 'local' && env.supabaseUrl && env.supabaseServiceKey) {
    const client = createClient(env.supabaseUrl, env.supabaseServiceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    return { store: new SupabaseStore(client), blobs: new SupabaseBlobStore(client, env.supabaseBucket), mode: 'supabase', supabase: client }
  }
  if (env.isProd) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in production')
  return { store: new JsonStore(env.dataFile), blobs: new DiskBlobStore(env.uploadDir), mode: 'local-files' }
}
