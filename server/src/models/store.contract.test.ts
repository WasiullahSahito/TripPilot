// @vitest-environment node
import { createClient } from '@supabase/supabase-js'
import { SupabaseStore } from './supabase-store.ts'
import { JsonStore } from './store.ts'
import { storeContract } from './store-contract.ts'

storeContract('JsonStore (in memory)', () => new JsonStore())

// Runs only against a DEDICATED, empty Supabase test project (never production):
//   SUPABASE_TEST_URL=... SUPABASE_TEST_SERVICE_KEY=... npm test
const url = process.env.SUPABASE_TEST_URL
const key = process.env.SUPABASE_TEST_SERVICE_KEY
storeContract(
  'SupabaseStore (live test project)',
  () => new SupabaseStore(createClient(url!, key!, { auth: { persistSession: false } })),
  { skip: !url || !key },
)
