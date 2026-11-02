// Builds the extension and zips it for upload to the Chrome Web Store.  Run: npm run package:extension
import { execFileSync } from 'node:child_process'
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { zipSync } from 'fflate'

const dist = 'extension/dist'
execFileSync(process.execPath, ['scripts/build-extension.mjs'], { stdio: 'inherit' })

const manifest = JSON.parse(await readFile(`${dist}/manifest.json`, 'utf8'))

// Refuse to package something the store will reject or that would weaken the privacy promises.
const problems = []
for (const size of ['16', '48', '128']) if (!manifest.icons?.[size]) problems.push(`manifest.icons.${size} is missing`)
if (manifest.manifest_version !== 3) problems.push('manifest_version must be 3')
if (manifest.host_permissions?.length || manifest.content_scripts) problems.push('the extension must not request host permissions or auto-run content scripts')
const allowed = new Set(['activeTab', 'scripting', 'storage', 'alarms'])
for (const p of manifest.permissions ?? []) if (!allowed.has(p)) problems.push(`unexpected permission "${p}"`)

async function walk(dir) {
  const out = []
  for (const name of await readdir(dir)) {
    const p = join(dir, name)
    if ((await stat(p)).isDirectory()) out.push(...(await walk(p)))
    else out.push(p)
  }
  return out
}
const files = await walk(dist)
for (const f of files) if (/\.map$/.test(f)) problems.push(`source map in package: ${f}`)
if (problems.length) {
  console.error('\nNot packaging:\n - ' + problems.join('\n - '))
  process.exit(1)
}

const entries = {}
for (const f of files) entries[relative(dist, f).split('\\').join('/')] = new Uint8Array(await readFile(f))
const zip = zipSync(entries, { level: 9 })
const out = `extension/trippilot-assistant-${manifest.version}.zip`
await writeFile(out, zip)
console.log(`\n${out}  (${(zip.length / 1024).toFixed(1)} KB, ${files.length} files, permissions: ${manifest.permissions.join(', ')})`)
