// Bundles server/src/vercel-entry.ts into api/index.js (the Vercel function). npm packages stay external
// and are installed/traced by Vercel; only our own TypeScript is bundled, so no `.ts` import survives at runtime.
import { build } from 'esbuild'

await build({
  entryPoints: ['server/src/vercel-entry.ts'],
  outfile: 'api/index.js',
  bundle: true,
  packages: 'external',
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: false,
  logLevel: 'info',
})
