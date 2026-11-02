import { expireIfNeeded, lockSessionStorage } from './storage'

// The only background job: remove exported personal data as soon as it expires.
chrome.runtime.onInstalled.addListener(() => {
  void lockSessionStorage()
  void chrome.alarms.create('expire-data', { periodInMinutes: 1 })
})

chrome.runtime.onStartup.addListener(() => {
  void lockSessionStorage()
  void chrome.alarms.create('expire-data', { periodInMinutes: 1 })
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'expire-data') void expireIfNeeded()
})
