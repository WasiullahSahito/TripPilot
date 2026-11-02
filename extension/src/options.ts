import { adapters } from './core/adapters'
import { normaliseHost } from './core/safety'
import { exportAdapters, importAdapters, unpin } from './core/user-adapters'
import { FIELD_LABELS, type FieldKey } from './core/payload'
import { clearPayload, getAllowlist, getUserAdapters, setAllowlist, setUserAdapters } from './storage'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

async function renderList() {
  const list = await getAllowlist()
  const ul = $('hosts')
  ul.replaceChildren()
  if (list.length === 0) {
    const li = document.createElement('li')
    li.className = 'muted'
    li.textContent = 'No sites listed: the assistant asks before using any site.'
    ul.append(li)
  }
  for (const host of list) {
    const li = document.createElement('li')
    const name = document.createElement('span')
    name.textContent = host
    const rm = document.createElement('button')
    rm.textContent = 'Remove'
    rm.setAttribute('aria-label', `Remove ${host}`)
    rm.addEventListener('click', async () => {
      await setAllowlist((await getAllowlist()).filter((h) => h !== host))
      void renderList()
    })
    li.append(name, ' ', rm)
    ul.append(li)
  }
}

/** Pins the user taught the extension, grouped by website, each removable. */
async function renderPins() {
  const all = await getUserAdapters()
  const box = $('pins')
  box.replaceChildren()
  const hosts = Object.keys(all).sort()
  if (hosts.length === 0) {
    const p = document.createElement('p')
    p.className = 'muted'
    p.textContent = 'Nothing taught yet. Use "Teach this site" in the popup after a scan.'
    box.append(p)
  }
  for (const host of hosts) {
    const h = document.createElement('h3')
    h.textContent = host
    const rm = document.createElement('button')
    rm.textContent = 'Forget this site'
    rm.addEventListener('click', async () => { await setUserAdapters(unpin(await getUserAdapters(), host)); void renderPins() })
    const ul = document.createElement('ul')
    ul.className = 'hosts'
    for (const [key, selector] of Object.entries(all[host]!)) {
      const li = document.createElement('li')
      li.textContent = `${FIELD_LABELS[key as FieldKey]}: ${selector} `
      const x = document.createElement('button')
      x.textContent = 'Remove'
      x.setAttribute('aria-label', `Remove ${FIELD_LABELS[key as FieldKey]} for ${host}`)
      x.addEventListener('click', async () => { await setUserAdapters(unpin(await getUserAdapters(), host, key as FieldKey)); void renderPins() })
      li.append(x)
      ul.append(li)
    }
    box.append(h, ul, rm)
  }
}

document.addEventListener('DOMContentLoaded', () => {
  void renderList()
  void renderPins()
  $('pins-export').addEventListener('click', async () => {
    const url = URL.createObjectURL(new Blob([exportAdapters(await getUserAdapters())], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'trippilot-site-pins.json'
    a.click()
    URL.revokeObjectURL(url)
  })
  $<HTMLInputElement>('pins-import').addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    const r = importAdapters(await file.text(), await getUserAdapters())
    $('msg').textContent = r.ok ? `Imported. ${r.sitesAdded} new site${r.sitesAdded === 1 ? '' : 's'} added.` : r.error
    if (r.ok) { await setUserAdapters(r.adapters); void renderPins() }
  })
  $('add-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const input = $<HTMLInputElement>('host')
    const msg = $('msg')
    const host = normaliseHost(input.value)
    if (!host) {
      msg.textContent = 'Enter a hostname such as apply.example.gov (no wildcards, paths or schemes).'
      return
    }
    await setAllowlist([...(await getAllowlist()), host])
    input.value = ''
    msg.textContent = `Added ${host}.`
    void renderList()
  })
  $('wipe').addEventListener('click', async () => {
    await clearPayload()
    $('msg').textContent = 'Loaded personal data was removed.'
  })
  const a = $('adapters')
  for (const ad of adapters) {
    const li = document.createElement('li')
    li.textContent = `${ad.name} — hosts: ${ad.hosts.join(', ')}`
    a.append(li)
  }
})
