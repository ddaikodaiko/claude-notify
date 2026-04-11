import { spawnSync } from 'child_process'
import { platform } from 'os'
import { resolve } from 'path'

// FNV-1a 32-bit — fast, deterministic, good distribution
function fnv1a(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function getWorktreeRoot(cwd?: string): string | null {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: cwd ?? process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  if (result.status !== 0 || !result.stdout) return null
  return resolve(result.stdout.trim())
}

// Maps a worktree root path to a stable loopback IP in 127.1.0.1–127.254.255.254.
// Avoids 127.0.x.x (where 127.0.0.1 lives) and .0 / .255 for last octet.
// On Linux the entire 127.0.0.0/8 block routes to lo — no setup needed.
// On macOS a loopback alias must be added once (see ensureAlias).
export function worktreeIp(root: string): string {
  const n = fnv1a(root)
  const b2 = (n % 254) + 1           // 1..254  → never 0 (avoids 127.0.x.x)
  const b3 = (n >>> 8) & 0xff        // 0..255  — unsigned shift avoids sign extension
  const b4 = ((n >>> 16) % 254) + 1  // 1..254  — unsigned shift avoids sign extension
  return `127.${b2}.${b3}.${b4}`
}

// On macOS: adds a loopback alias so the IP becomes reachable.
// On Linux: no-op (kernel handles the full 127.0.0.0/8 block automatically).
export function ensureAlias(ip: string): void {
  if (platform() !== 'darwin') return

  const result = spawnSync('sudo', ['ifconfig', 'lo0', 'alias', ip, 'up'], {
    stdio: 'inherit',
    timeout: 10_000,
  })
  if (result.status !== 0) throw new Error('Failed to add loopback alias — try running with sudo manually')
}
