// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { inspectPng } from '../../server/src/services/scanner.ts'

const root = join(process.cwd(), 'extension')
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')) as {
  icons: Record<string, string>
  action: { default_icon: Record<string, string> }
  permissions: string[]
  host_permissions?: string[]
  content_scripts?: unknown
}

describe('extension icons', () => {
  it('declares the sizes the Chrome Web Store requires, in both the manifest and the toolbar action', () => {
    for (const size of ['16', '48', '128']) {
      expect(manifest.icons[size], `icons.${size}`).toBeTruthy()
      expect(manifest.action.default_icon[size], `action.default_icon.${size}`).toBeTruthy()
    }
  })

  it('every declared icon exists, is a structurally valid PNG, and has exactly the declared size', () => {
    for (const [size, path] of Object.entries(manifest.icons)) {
      const bytes = readFileSync(join(root, path))
      expect(inspectPng(bytes).status, path).toBe('clean')
      expect(bytes.readUInt32BE(16), `${path} width`).toBe(Number(size))
      expect(bytes.readUInt32BE(20), `${path} height`).toBe(Number(size))
    }
  })

  it('keeps the privacy promises: only four permissions, no host access, nothing runs automatically', () => {
    expect([...manifest.permissions].sort()).toEqual(['activeTab', 'alarms', 'scripting', 'storage'])
    expect(manifest.host_permissions).toBeUndefined()
    expect(manifest.content_scripts).toBeUndefined()
  })
})
