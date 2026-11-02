// Bundles the extension into extension/dist (load that folder with "Load unpacked" in chrome://extensions).
import { build } from 'esbuild'
import { cp, mkdir, rm } from 'node:fs/promises'

const out = 'extension/dist'
await rm(out, { recursive: true, force: true })
await mkdir(out, { recursive: true })

await build({
  entryPoints: {
    background: 'extension/src/background.ts',
    content: 'extension/src/content.ts',
    popup: 'extension/src/popup.ts',
    options: 'extension/src/options.ts',
  },
  outdir: out,
  bundle: true,
  format: 'iife',
  target: 'chrome110',
  legalComments: 'none',
  logLevel: 'info',
})

for (const f of ['manifest.json', 'popup.html', 'options.html']) await cp(`extension/${f}`, `${out}/${f}`)
await cp('extension/src/styles.css', `${out}/styles.css`)
await cp('extension/icons', `${out}/icons`, { recursive: true })
console.log(`\nBuilt ${out}. In Chrome open chrome://extensions, enable Developer mode, choose "Load unpacked" and pick that folder.`)
