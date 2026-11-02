import { createClient } from '@supabase/supabase-js'
import { env } from './config/env.ts'
import { checkSupabase, describeProblems } from './models/check-supabase.ts'

if (!env.supabaseUrl || !env.supabaseServiceKey) {
  console.log('Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing): the API uses local files.')
  process.exit(0)
}
const client = createClient(env.supabaseUrl, env.supabaseServiceKey, { auth: { persistSession: false } })
const problems = await checkSupabase(client, env.supabaseBucket)
const { fatal, warnings } = describeProblems(problems, env.supabaseBucket)
for (const w of warnings) console.log(`Warning: ${w}`)
if (fatal.length) {
  console.log('NOT READY:')
  for (const f of fatal) console.log(`  - ${f}`)
  process.exit(1)
}
console.log('Supabase is ready: all tables found and the storage bucket is private.')
