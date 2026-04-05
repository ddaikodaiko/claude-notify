/**
 * Called by the Claude Code Stop hook.
 * Reads JSON context from stdin, builds the notification message,
 * and dispatches to all enabled channels.
 *
 * Claude Code Stop hook stdin schema:
 * {
 *   session_id: string
 *   stop_hook_active: boolean
 *   transcript_path?: string
 * }
 */

import { readFileSync, existsSync } from 'fs'
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
  type?: string
  toolName?: string
}

// Read stdin with a 2s timeout — works cross-platform (no /dev/stdin)
async function readStdin(): Promise<string> {
  return new Promise(resolve_ => {
    let data = ''
    const timer = setTimeout(() => resolve_(''), 2000)

    if (!process.stdin.readable || process.stdin.readableEnded) {
      clearTimeout(timer)
      resolve_('')
      return
    }

    process.stdin.setEncoding('utf8')
    process.stdin.on('data', chunk => { data += chunk })
    process.stdin.on('end', () => { clearTimeout(timer); resolve_(data) })
    process.stdin.on('error', () => { clearTimeout(timer); resolve_(data) })
  })
}

// Only read transcript files inside the user's home directory
function isSafePath(p: string): boolean {
  const resolved = resolve(p)
  return resolved.startsWith(homedir())
}

function parseStats(transcriptPath?: string): string | null {
  if (!transcriptPath) return null

  // Path traversal guard — only allow files within home dir
  if (!isSafePath(transcriptPath)) return null
  if (!existsSync(transcriptPath)) return null

  try {
    const lines = readFileSync(transcriptPath, 'utf8').trim().split('\n')
    const toolNames: string[] = lines
      .map(l => { try { return JSON.parse(l) as TranscriptEntry } catch { return null } })
      .filter((e): e is TranscriptEntry => e !== null && typeof e.toolName === 'string')
      .map(e => e.toolName as string)

    const writes = toolNames.filter(n => n === 'Write' || n === 'Edit').length
    const reads = toolNames.filter(n => n === 'Read').length
    const bashes = toolNames.filter(n => n === 'Bash').length

    const parts: string[] = []
    if (writes > 0) parts.push(`${writes} archivo${writes !== 1 ? 's' : ''} editado${writes !== 1 ? 's' : ''}`)
    if (reads > 0) parts.push(`${reads} lectura${reads !== 1 ? 's' : ''}`)
    if (bashes > 0) parts.push(`${bashes} comando${bashes !== 1 ? 's' : ''}`)

    return parts.length > 0 ? parts.join(' · ') : null
  } catch {
    return null
  }
}

export async function send(): Promise<void> {
  const config = loadConfig()

  let hookInput: HookInput = {}
  try {
    const raw = (await readStdin()).trim()
    if (raw) hookInput = JSON.parse(raw) as HookInput
  } catch {
    // Malformed or empty stdin — proceed with generic message
  }

  const title = config.message.title
  let body = 'Tarea completada.'

  if (config.message.includeStats) {
    const stats = parseStats(hookInput.transcript_path)
    if (stats) body = stats
  }

  const promises: Promise<void>[] = []

  if (config.channels.desktop) {
    sendDesktop(title, body)
  }

  if (config.channels.ntfy.enabled && config.channels.ntfy.topic) {
    promises.push(
      sendNtfy(config.channels.ntfy.server, config.channels.ntfy.topic, title, body).catch(() => {}),
    )
  }

  if (config.channels.webhook.enabled && config.channels.webhook.url) {
    const wh = config.channels.webhook
    promises.push(
      sendWebhook(wh.url, wh.method, wh.headers, wh.bodyTemplate, title, body).catch(() => {}),
    )
  }

  await Promise.all(promises)
}
