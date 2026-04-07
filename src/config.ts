import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

export interface Config {
  channels: {
    desktop: boolean
    ntfy: {
      enabled: boolean
      topic: string
      server: string
    }
    webhook: {
      enabled: boolean
      url: string
      method: 'POST' | 'GET'
      headers: Record<string, string>
      bodyTemplate: string
    }
  }
  message: {
    title: string
    includeStats: boolean
  }
}

const DEFAULT_CONFIG: Config = {
  channels: {
    desktop: true,
    ntfy: {
      enabled: false,
      topic: '',
      server: 'https://ntfy.sh',
    },
    webhook: {
      enabled: false,
      url: '',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      bodyTemplate: '{"text": "{{title}}: {{body}}"}',
    },
  },
  message: {
    title: 'Claude Code',
    includeStats: true,
  },
}

// Keys that must never be traversed — would pollute Object.prototype
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function configDir(): string {
  return join(homedir(), '.config', 'claude-notify')
}

function configPath(): string {
  return join(configDir(), 'config.json')
}

// Deep merge: recursively merge override into base (both plain objects)
function deepMerge<T>(base: T, override: Partial<T>): T {
  const result: T = JSON.parse(JSON.stringify(base))
  for (const key of Object.keys(override) as (keyof T)[]) {
    if (DANGEROUS_KEYS.has(String(key))) continue
    const v = override[key]
    if (v !== null && typeof v === 'object' && !Array.isArray(v) &&
        typeof result[key] === 'object' && result[key] !== null) {
      result[key] = deepMerge(result[key], v as Partial<T[keyof T]>)
    } else if (v !== undefined) {
      result[key] = v as T[keyof T]
    }
  }
  return result
}

export function loadConfig(): Config {
  const path = configPath()
  if (!existsSync(path)) return DEFAULT_CONFIG
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<Config>
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return DEFAULT_CONFIG
    }
    return deepMerge(DEFAULT_CONFIG, parsed)
  } catch {
    return DEFAULT_CONFIG
  }
}

export function saveConfig(config: Config): void {
  const dir = configDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  // mode 0o600 — only owner can read/write (protects ntfy topic + webhook URLs)
  writeFileSync(configPath(), JSON.stringify(config, null, 2), { mode: 0o600 })
}

export function getConfigValue(config: Config, keyPath: string): unknown {
  const keys = keyPath.split('.')
  let current: unknown = config
  for (const key of keys) {
    if (DANGEROUS_KEYS.has(key)) return undefined
    if (typeof current !== 'object' || current === null) return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

export function setConfigValue(config: Config, keyPath: string, value: string): Config {
  const keys = keyPath.split('.')

  // Prototype pollution guard
  if (keys.some(k => DANGEROUS_KEYS.has(k))) {
    throw new Error(`Invalid config key: ${keyPath}`)
  }

  const result: Config = JSON.parse(JSON.stringify(config))
  let current = result as unknown as Record<string, unknown>

  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i]
    if (typeof current[k] !== 'object' || current[k] === null) current[k] = {}
    current = current[k] as Record<string, unknown>
  }

  const lastKey = keys[keys.length - 1]
  if (value === 'true') {
    current[lastKey] = true
  } else if (value === 'false') {
    current[lastKey] = false
  } else {
    const num = Number(value)
    // Reject Infinity and NaN — they are not valid JSON numbers
    if (value !== '' && !isNaN(num) && isFinite(num)) {
      current[lastKey] = num
    } else {
      current[lastKey] = value
    }
  }

  // Post-assignment validation for known enum fields
  if (keyPath === 'channels.webhook.method') {
    const method = current[lastKey]
    if (method !== 'POST' && method !== 'GET') {
      throw new Error(`channels.webhook.method must be "POST" or "GET", got "${method}"`)
    }
  }

  return result
}
