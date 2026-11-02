import type { SupabaseClient } from '@supabase/supabase-js'

/** Table -> a column that exists on it (selected so no personal data is ever read). */
const TABLES: Record<string, string> = {
  users: 'id',
  profiles: 'user_id',
  trips: 'id',
  visa_applications: 'id',
  documents: 'id',
  bookings: 'id',
  appointments: 'id',
  expenses: 'id',
  audit_log: 'id',
}

/** Columns added by later migrations: [table, column]. */
const COLUMNS: [string, string][] = [['users', 'disabled_at'], ['profiles', 'retention_days']]

export interface SupabaseProblems {
  missingTables: string[]
  missingColumns: string[]
  /** Set when a table check failed for a reason other than "missing" (bad key, network, ...). */
  otherError: string | null
  bucket: 'ok' | 'missing' | 'public' | 'error'
}

/**
 * Verifies the project is ready. Deliberately avoids HEAD/count requests: those report no error for a missing
 * table, which is how a broken setup once looked healthy. A normal select of a single id column fails loudly.
 */
export async function checkSupabase(client: SupabaseClient, bucketName: string): Promise<SupabaseProblems> {
  const missingTables: string[] = []
  const missingColumns: string[] = []
  let otherError: string | null = null
  for (const [table, column] of Object.entries(TABLES)) {
    const { error } = await client.from(table).select(column).limit(1)
    if (!error) continue
    if (/could not find the table|does not exist|schema cache/i.test(error.message) || error.code === 'PGRST205' || error.code === '42P01') {
      missingTables.push(table)
    } else {
      otherError ??= `${table}: ${error.message}`
    }
  }
  for (const [table, column] of COLUMNS) {
    if (missingTables.includes(table)) continue
    const { error } = await client.from(table).select(column).limit(1)
    if (!error) continue
    if (error.code === '42703' || /column .* does not exist|could not find the .* column/i.test(error.message)) missingColumns.push(`${table}.${column}`)
    else otherError ??= `${table}.${column}: ${error.message}`
  }
  const b = await client.storage.getBucket(bucketName)
  const bucket: SupabaseProblems['bucket'] = b.error ? (/not found/i.test(b.error.message) ? 'missing' : 'error') : b.data.public ? 'public' : 'ok'
  return { missingTables, missingColumns, otherError, bucket }
}

export function describeProblems(p: SupabaseProblems, bucketName: string): { fatal: string[]; warnings: string[] } {
  const fatal: string[] = []
  const warnings: string[] = []
  if (p.otherError) fatal.push(`Supabase rejected a request (${p.otherError}). Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (it must be the service_role key, not the anon key).`)
  if (p.missingTables.length || p.missingColumns.length) {
    // A project set up before a newer migration existed only needs that migration; re-running everything would fail.
    const files = new Set<string>()
    if (p.missingTables.includes('users')) files.add('all.sql')
    else {
      if (p.missingTables.includes('expenses')) files.add('003_expenses.sql')
      if (p.missingTables.includes('audit_log') || p.missingColumns.length) files.add('004_admin_audit_retention.sql')
      if (p.missingTables.some((t) => !['expenses', 'audit_log'].includes(t))) files.add('all.sql')
    }
    const what = [...p.missingTables.map((t) => `table ${t}`), ...p.missingColumns.map((c) => `column ${c}`)].join(', ')
    fatal.push(
      files.has('all.sql')
        ? `These tables are missing: ${p.missingTables.join(', ')}. Open the Supabase SQL editor and run server/migrations/all.sql (or the numbered files 001 to 004 in order).`
        : `Missing in the database: ${what}. Open the Supabase SQL editor and run ${[...files].map((f) => `server/migrations/${f}`).join(' then ')} (only that, in that order).`,
    )
  }
  if (p.bucket === 'public') fatal.push(`Storage bucket "${bucketName}" is PUBLIC. Make it private (Storage > ${bucketName} > Edit bucket) before storing any passports.`)
  if (p.bucket === 'missing') warnings.push(`Storage bucket "${bucketName}" does not exist yet, so document uploads will fail. Running server/migrations/all.sql creates it.`)
  if (p.bucket === 'error') warnings.push(`Could not check the "${bucketName}" storage bucket.`)
  return { fatal, warnings }
}
