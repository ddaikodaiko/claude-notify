import { readFileSync, existsSync, statSync, realpathSync } from 'fs'
import { homedir } from 'os'
import { resolve } from 'path'
import { loadConfig } from './config.js'
import { sendDesktop } from './channels/desktop.js'
import { sendNtfy } from './channels/ntfy.js'
import { sendWebhook } from './channels/webhook.js'

interface HookInput {
  session_id?: string
  stop_hook_active?: boolean
  transcript_path?: string
}

interface TranscriptEntry {
  toolName?: string
}

const MAX_STDIN_BYTES = 64 * 1024        // 64 KB — enough for any hook payload
const MAX_TRANSCRIPT_BYTES = 5 * 1024 * 1024  // 5 MB

// Read stdin with 2s timeout — works cross-platform (no /dev/stdin dependency)
async function readStdin(): Promise<string> {
  return new Promise(resolve_ => {
    let data = ''
    let size = 0
    const timer = setTimeout(() => resolve_(''), 2000)

    if (!process.stdin.readable || process.stdin.readableEnded) {
      clearTimeout(timer)
      resolve_('')
      return
    }

    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk: string) => {
      size += Buffer.byteLength(chunk)
      if (size > MAX_STDIN_BYTES) {
        clearTimeout(timer)
        resolve_(data)        // discard rest — payload too large
        return
      }
      data += chunk
    })
    process.stdin.on('end', () => { clearTimeout(timer); resolve_(data) })
    process.stdin.on('error', () => { clearTimeout(timer); resolve_(data) })
  })
}

const HOME = homedir()

// Resolve symlinks and verify the canonical path is within the user's home dir.
// Checking after existsSync — realpathSync throws if path doesn't exist.
function isSafePath(p: string): boolean {
  // Quick pre-check without following symlinks
  if (!resolve(p).startsWith(HOME + '/')) return false
  try {
    // Follow symlinks to get the real path — prevents symlink traversal
    return realpathSync(p).startsWith(HOME + '/')
  } catch {
    return false
  }
}

function parseStats(transcriptPath?: string): string | null {
  if (!transcriptPath) return null
  if (!existsSync(transcriptPath)) return null
  if (!isSafePath(transcriptPath)) return null   // after existsSync so realpathSync is safe

  try {
    const { size } = statSync(transcriptPath)
    if (size > MAX_TRANSCRIPT_BYTES) return null   // skip oversized transcripts

    const lines = readFileSync(transcriptPath, 'utf8').trim().split('\n')
    const toolNames: string[] = lines
      .map(l => { try { return JSON.parse(l) as TranscriptEntry } catch { return null } })
      .filter((e): e is TranscriptEntry => e !== null && typeof e.toolName === 'string')
      .map(e => e.toolName as string)

    const writes = toolNames.filter(n => n === 'Write' || n === 'Edit').length
    const reads  = toolNames.filter(n => n === 'Read').length
    const bashes = toolNames.filter(n => n === 'Bash').length

    const parts: string[] = []
    if (writes > 0) parts.push(`${writes} archivo${writes !== 1 ? 's' : ''} editado${writes !== 1 ? 's' : ''}`)
    if (reads  > 0) parts.push(`${reads} lectura${reads !== 1 ? 's' : ''}`)
    if (bashes > 0) parts.push(`${bashes} comando${bashes !== 1 ? 's' : ''}`)

    return parts.length > 0 ? parts.join(' · ') : null
  } catch {
    return null
  }
}

export async function send(): Promise<void> {
  const config = loadConfig()

  let transcriptPath: string | undefined
  try {
    const raw = (await readStdin()).trim()
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      if (typeof parsed?.transcript_path === 'string') {
        transcriptPath = parsed.transcript_path
      }
    }
  } catch {
    // Malformed or empty stdin — proceed with generic message
  }

  const title = config.message.title
  let body = 'Tarea completada.'

  if (config.message.includeStats) {
    const stats = parseStats(transcriptPath)
    if (stats) body = stats
  }

  const promises: Promise<void>[] = []

  if (config.channels.desktop) {
    sendDesktop(title, body)
  }

  if (config.channels.ntfy.enabled && config.channels.ntfy.topic) {
    promises.push(
      sendNtfy(config.channels.ntfy.server, config.channels.ntfy.topic, title, body)
        .catch(() => {}),
    )
  }

  if (config.channels.webhook.enabled && config.channels.webhook.url) {
    const wh = config.channels.webhook
    promises.push(
      sendWebhook(wh.url, wh.method, wh.headers, wh.bodyTemplate, title, body)
        .catch(() => {}),
    )
  }

  await Promise.all(promises)
}
