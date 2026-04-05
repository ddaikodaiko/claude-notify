import { spawnSync } from 'child_process'
import { platform } from 'os'

// Escape for AppleScript double-quoted string literals
// Handles: backslash, double-quote, and newlines (which break single-line -e expressions)
function escapeAppleScript(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, ' ')
    .replace(/\r/g, ' ')
}

// Strip CRLF and control characters from strings used in shell args / headers
function sanitizeText(s: string): string {
  return s.replace(/[\r\n\t\x00-\x1f]/g, ' ').trim()
}

export function sendDesktop(title: string, body: string): void {
  const safeTitle = sanitizeText(title)
  const safeBody  = sanitizeText(body)
  const os = platform()

  try {
    if (os === 'darwin') {
      // spawnSync — args passed directly to osascript, no shell expansion
      spawnSync('osascript', [
        '-e',
        `display notification "${escapeAppleScript(safeBody)}" with title "${escapeAppleScript(safeTitle)}"`,
      ], { stdio: 'ignore', timeout: 5000 })
    } else if (os === 'linux') {
      // spawnSync with arg array — no shell, title/body are never interpreted
      spawnSync('notify-send', [safeTitle, safeBody, '--icon=terminal'], {
        stdio: 'ignore',
        timeout: 5000,
      })
    } else if (os === 'win32') {
      const script = [
        'Add-Type -AssemblyName System.Windows.Forms',
        '$n = New-Object System.Windows.Forms.NotifyIcon',
        '$n.Icon = [System.Drawing.SystemIcons]::Information',
        '$n.Visible = $true',
        `$n.ShowBalloonTip(5000, '${safeTitle.replace(/'/g, "''")}', '${safeBody.replace(/'/g, "''")}', [System.Windows.Forms.ToolTipIcon]::Info)`,
        'Start-Sleep -Milliseconds 5500',
        '$n.Dispose()',
      ].join('; ')
      // -Command as a separate arg — no shell quoting layer
      spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
        stdio: 'ignore',
        timeout: 8000,
      })
    }
  } catch {
    // Silent — desktop notif is best-effort, never break the hook
  }
}
