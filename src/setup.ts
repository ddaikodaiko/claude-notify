import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const CLAUDE_CONFIG_DIR = join(homedir(), '.claude')
const SETTINGS_PATH = join(CLAUDE_CONFIG_DIR, 'settings.json')
const HOOK_COMMAND = 'claude-notify send'

interface ClaudeSettings {
  hooks?: {
    Stop?: HookEntry[]
    [key: string]: unknown
  }
  [key: string]: unknown
}

interface HookEntry {
  matcher?: string
  hooks: { type: string; command: string }[]
}

function loadSettings(): ClaudeSettings {
  if (!existsSync(SETTINGS_PATH)) return {}
  try {
    return JSON.parse(readFileSync(SETTINGS_PATH, 'utf8')) as ClaudeSettings
  } catch {
    return {}
  }
}

function saveSettings(settings: ClaudeSettings): void {
  if (!existsSync(CLAUDE_CONFIG_DIR)) mkdirSync(CLAUDE_CONFIG_DIR, { recursive: true })
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2))
}

function isAlreadyInstalled(settings: ClaudeSettings): boolean {
  return settings.hooks?.Stop?.some(entry =>
    entry.hooks?.some(h => h.command === HOOK_COMMAND),
  ) ?? false
}

export function install(): { alreadyInstalled: boolean } {
  const settings = loadSettings()

  if (isAlreadyInstalled(settings)) {
    return { alreadyInstalled: true }
  }

  if (!settings.hooks) settings.hooks = {}
  if (!settings.hooks.Stop) settings.hooks.Stop = []

  settings.hooks.Stop.push({
    hooks: [{ type: 'command', command: HOOK_COMMAND }],
  })

  saveSettings(settings)
  return { alreadyInstalled: false }
}

export function uninstall(): { wasInstalled: boolean } {
  const settings = loadSettings()

  if (!isAlreadyInstalled(settings)) {
    return { wasInstalled: false }
  }

  if (settings.hooks?.Stop) {
    settings.hooks.Stop = settings.hooks.Stop
      .map(entry => ({
        ...entry,
        hooks: entry.hooks.filter(h => h.command !== HOOK_COMMAND),
      }))
      .filter(entry => entry.hooks.length > 0)

    if (settings.hooks.Stop.length === 0) delete settings.hooks.Stop
    if (Object.keys(settings.hooks).length === 0) delete settings.hooks
  }

  saveSettings(settings)
  return { wasInstalled: true }
}

export function isInstalled(): boolean {
  return isAlreadyInstalled(loadSettings())
}
