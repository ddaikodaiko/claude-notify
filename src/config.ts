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

function configDir(): string {
  return join(homedir(), '.config', 'claude-notify')
}

function configPath(): string {
  return join(configDir(), 'config.json')
}

// Deep merge: recursively merge b into a
function deepMerge<T>(base: T, override: Partial<T>): T {
  const result: T = JSON.parse(JSON.stringify(base))
  for (const key of Object.keys(override) as (keyof T)[]) {
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
    if (typeof current !== 'object' || current === null) return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

export function setConfigValue(config: Config, keyPath: string, value: string): Config {
  const keys = keyPath.split('.')
  const result: Config = JSON.parse(JSON.stringify(config))
  let current: Record<string, unknown> = result as unknown as Record<string, unknown>
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i]
    if (typeof current[k] !== 'object' || current[k] === null) current[k] = {}
    current = current[k] as Record<string, unknown>
  }
  const lastKey = keys[keys.length - 1]
  if (value === 'true') current[lastKey] = true
  else if (value === 'false') current[lastKey] = false
  else if (value !== '' && !isNaN(Number(value))) current[lastKey] = Number(value)
  else current[lastKey] = value
  return result
}
