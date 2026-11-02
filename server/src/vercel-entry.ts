// Source of the Vercel serverless function. `npm run build:api` bundles this into api/index.js
// (committed, because Vercel cannot run the server's .ts imports directly). vercel.json rewrites /api/* to it.
// The Express app is stateless; all data lives in Supabase (Postgres + private Storage).
import { createApp } from './app.ts'
import { createStack } from './models/create-stack.ts'

const stack = createStack()
export default createApp(stack.store, { blobs: stack.blobs })
