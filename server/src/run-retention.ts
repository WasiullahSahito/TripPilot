import { createStack } from './models/create-stack.ts'
import { runRetention } from './services/retention.ts'

// Manual / self-hosted scheduling (Windows Task Scheduler, cron): `npm run retention:run`
const { store, blobs, mode } = createStack()
const report = await runRetention(store, blobs)
console.log(`Retention run (${mode}): ${report.documentsDeleted} file(s) deleted for ${report.users} user(s), ${report.failures} failure(s).`)
process.exit(report.failures > 0 ? 1 : 0)
