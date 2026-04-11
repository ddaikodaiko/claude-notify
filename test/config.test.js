import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setConfigValue, getConfigValue } from '../dist/config.js'

// Construct a clean config without touching the filesystem
function baseConfig() {
  return {
    channels: {
      desktop: true,
      ntfy: { enabled: false, topic: '', server: 'https://ntfy.sh' },
      webhook: {
        enabled: false,
        url: '',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        bodyTemplate: '{"text": "{{title}}: {{body}}"}',
      },
    },
    message: { title: 'Claude Code', includeStats: true },
  }
}

// ─── getConfigValue ──────────────────────────────────────────────────────────

test('getConfigValue: reads a top-level key', () => {
  const cfg = baseConfig()
  assert.equal(getConfigValue(cfg, 'message.title'), 'Claude Code')
})

test('getConfigValue: reads a nested key', () => {
  const cfg = baseConfig()
  assert.equal(getConfigValue(cfg, 'channels.ntfy.enabled'), false)
})

test('getConfigValue: returns undefined for unknown key', () => {
  const cfg = baseConfig()
  assert.equal(getConfigValue(cfg, 'channels.doesNotExist'), undefined)
})

test('getConfigValue: blocks __proto__', () => {
  const cfg = baseConfig()
  assert.equal(getConfigValue(cfg, '__proto__.foo'), undefined)
})

// ─── setConfigValue ──────────────────────────────────────────────────────────

test('setConfigValue: sets a boolean true', () => {
  const cfg = setConfigValue(baseConfig(), 'channels.ntfy.enabled', 'true')
  assert.equal(cfg.channels.ntfy.enabled, true)
})

test('setConfigValue: sets a boolean false', () => {
  const cfg = setConfigValue(baseConfig(), 'channels.desktop', 'false')
  assert.equal(cfg.channels.desktop, false)
})

test('setConfigValue: sets a string', () => {
  const cfg = setConfigValue(baseConfig(), 'channels.ntfy.topic', 'my-topic')
  assert.equal(cfg.channels.ntfy.topic, 'my-topic')
})

test('setConfigValue: sets a number', () => {
  const cfg = setConfigValue(baseConfig(), 'message.title', '42')
  assert.equal(getConfigValue(cfg, 'message.title'), 42)
})

test('setConfigValue: rejects NaN', () => {
  // "NaN" should be stored as a string, not a number
  const cfg = setConfigValue(baseConfig(), 'message.title', 'NaN')
  assert.equal(typeof getConfigValue(cfg, 'message.title'), 'string')
})

test('setConfigValue: rejects Infinity', () => {
  const cfg = setConfigValue(baseConfig(), 'message.title', 'Infinity')
  assert.equal(typeof getConfigValue(cfg, 'message.title'), 'string')
})

test('setConfigValue: rejects webhook.method values other than POST/GET', () => {
  assert.throws(
    () => setConfigValue(baseConfig(), 'channels.webhook.method', 'DELETE'),
    /must be "POST" or "GET"/,
  )
})

test('setConfigValue: accepts POST and GET for webhook.method', () => {
  const cfg = setConfigValue(baseConfig(), 'channels.webhook.method', 'GET')
  assert.equal(cfg.channels.webhook.method, 'GET')
})

test('setConfigValue: blocks __proto__ pollution', () => {
  assert.throws(
    () => setConfigValue(baseConfig(), '__proto__.admin', 'true'),
    /Invalid config key/,
  )
})

test('setConfigValue: blocks constructor pollution', () => {
  assert.throws(
    () => setConfigValue(baseConfig(), 'constructor.prototype.admin', 'true'),
    /Invalid config key/,
  )
})

test('setConfigValue: does not mutate the original config', () => {
  const original = baseConfig()
  const originalTopic = original.channels.ntfy.topic
  setConfigValue(original, 'channels.ntfy.topic', 'changed')
  assert.equal(original.channels.ntfy.topic, originalTopic)
})
