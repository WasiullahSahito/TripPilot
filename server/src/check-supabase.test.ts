// @vitest-environment node
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { checkSupabase, describeProblems } from './models/check-supabase.ts'

type Err = { message: string; code?: string } | null

function fakeClient(opts: { missing?: string[]; missingColumns?: string[]; failWith?: string; bucket?: { error?: string; public?: boolean } }): SupabaseClient {
  return {
    from: (table: string) => ({
      select: (col?: string) => ({
        limit: async () => {
          if (opts.missingColumns?.includes(`${table}.${col}`)) return { error: { message: `column ${table}.${col} does not exist`, code: '42703' } as Err }
          if (opts.failWith) return { error: { message: opts.failWith } as Err }
          if (opts.missing?.includes(table)) return { error: { message: `Could not find the table 'public.${table}' in the schema cache`, code: 'PGRST205' } as Err }
          return { error: null as Err }
        },
      }),
    }),
    storage: {
      getBucket: async () =>
        opts.bucket?.error ? { data: null, error: { message: opts.bucket.error } } : { data: { public: !!opts.bucket?.public }, error: null },
    },
  } as unknown as SupabaseClient
}

describe('checkSupabase', () => {
  it('reports a healthy project as having no problems', async () => {
    const p = await checkSupabase(fakeClient({}), 'documents')
    expect(p).toEqual({ missingTables: [], missingColumns: [], otherError: null, bucket: 'ok' })
    expect(describeProblems(p, 'documents')).toEqual({ fatal: [], warnings: [] })
  })

  it('lists missing tables as fatal and tells the user which SQL to run', async () => {
    const p = await checkSupabase(fakeClient({ missing: ['users', 'profiles'], bucket: { error: 'Bucket not found' } }), 'documents')
    expect(p.missingTables).toEqual(['users', 'profiles'])
    expect(p.bucket).toBe('missing')
    const d = describeProblems(p, 'documents')
    expect(d.fatal[0]).toMatch(/users, profiles/)
    expect(d.fatal[0]).toMatch(/all\.sql/)
    expect(d.warnings[0]).toMatch(/does not exist/)
  })

  it('treats a public passport bucket as fatal', async () => {
    const p = await checkSupabase(fakeClient({ bucket: { public: true } }), 'documents')
    expect(describeProblems(p, 'documents').fatal.join(' ')).toMatch(/PUBLIC/)
  })

  it('surfaces other errors (bad key) separately from missing tables', async () => {
    const p = await checkSupabase(fakeClient({ failWith: 'Invalid API key' }), 'documents')
    expect(p.missingTables).toEqual([])
    expect(p.otherError).toMatch(/Invalid API key/)
    expect(describeProblems(p, 'documents').fatal[0]).toMatch(/service_role/)
  })

  it('points a project that only lacks the newest migrations at just those files', async () => {
    const onlyExpenses = await checkSupabase(fakeClient({ missing: ['expenses'] }), 'documents')
    expect(describeProblems(onlyExpenses, 'documents').fatal[0]).toMatch(/003_expenses\.sql/)
    expect(describeProblems(onlyExpenses, 'documents').fatal[0]).not.toMatch(/all\.sql/)

    const needs004 = await checkSupabase(fakeClient({ missing: ['audit_log'], missingColumns: ['users.disabled_at'] }), 'documents')
    expect(needs004.missingColumns).toEqual(['users.disabled_at'])
    const msg = describeProblems(needs004, 'documents').fatal[0]!
    expect(msg).toMatch(/004_admin_audit_retention\.sql/)
    expect(msg).toMatch(/column users\.disabled_at/)
    expect(msg).not.toMatch(/all\.sql/)

    const both = await checkSupabase(fakeClient({ missing: ['expenses', 'audit_log'] }), 'documents')
    expect(describeProblems(both, 'documents').fatal[0]).toMatch(/003_expenses\.sql then server\/migrations\/004/)
  })
})
