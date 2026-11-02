import { createApp } from './app.ts'
import { env } from './config/env.ts'
import { checkSupabase, describeProblems } from './models/check-supabase.ts'
import { createStack } from './models/create-stack.ts'

const stack = createStack()

// Verify the Supabase project is ready before accepting requests, and say exactly what to fix if it is not.
if (stack.mode === 'supabase' && stack.supabase) {
  let problems
  try {
    problems = await checkSupabase(stack.supabase, env.supabaseBucket)
  } catch (e) {
    console.error(`\nCould not reach Supabase: ${e instanceof Error ? e.message : String(e)}`)
    console.error('Check your internet connection and SUPABASE_URL.\n')
    process.exit(1)
  }
  const { fatal, warnings } = describeProblems(problems, env.supabaseBucket)
  for (const w of warnings) console.warn(`\nWarning: ${w}`)
  if (fatal.length) {
    console.error('\nSupabase is not ready:')
    for (const f of fatal) console.error(`  - ${f}`)
    console.error('\nTo keep developing without Supabase for now, add STORAGE_MODE=local to .env and restart.\n')
    process.exit(1)
  }
}

const app = createApp(stack.store, { blobs: stack.blobs })
app.listen(env.port, () => {
  console.log(`TripPilot API listening on http://localhost:${env.port} (storage: ${stack.mode})`)
})
