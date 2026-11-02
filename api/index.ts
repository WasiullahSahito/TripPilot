// Vercel serverless entry: every /api/* request is rewritten here (see vercel.json).
// The Express app is stateless; all data lives in Supabase (Postgres + private Storage).
import { createApp } from '../server/src/app.ts'
import { createStack } from '../server/src/models/create-stack.ts'

const stack = createStack()
export default createApp(stack.store, { blobs: stack.blobs })
