/**
 * Injected on demand (never automatically) into the active tab when the user presses "Scan this page" in the popup.
 * It can scan and fill form fields and nothing else: no network access, no clicking, no submitting.
 * It accepts messages only from this extension, and never receives the exported personal data except the specific
 * values the user ticked in the preview.
 */
import { fillFields, scanFields, type Assignment } from './core/dom'
import type { FieldKey } from './core/payload'

declare global {
  interface Window {
    __tripPilotAssistant?: boolean
  }
}

type Message =
  | { type: 'scan'; hints?: Partial<Record<FieldKey, string>> }
  | { type: 'fill'; assignments: Assignment[]; overwrite: boolean }
  | { type: 'stop' }

function isAssignments(v: unknown): v is Assignment[] {
  return Array.isArray(v) && v.length <= 200 && v.every((a) => a && typeof a.index === 'number' && typeof a.value === 'string')
}

if (!window.__tripPilotAssistant) {
  window.__tripPilotAssistant = true
  let stopRequested = false

  chrome.runtime.onMessage.addListener((msg: Message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return false
    if (msg.type === 'scan') {
      sendResponse({ fields: scanFields(document, { hints: msg.hints }) })
      return false
    }
    if (msg.type === 'stop') {
      stopRequested = true
      sendResponse({ ok: true })
      return false
    }
    if (msg.type === 'fill' && isAssignments(msg.assignments)) {
      stopRequested = false
      void fillFields(msg.assignments, { overwrite: !!msg.overwrite, shouldStop: () => stopRequested }).then((results) => sendResponse({ results }))
      return true // keep the channel open for the async response
    }
    return false
  })
}
