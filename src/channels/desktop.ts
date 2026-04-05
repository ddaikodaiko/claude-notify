import { spawnSync } from 'child_process'
import { platform } from 'os'

// Safe escape for AppleScript double-quoted string literals
function escapeAppleScript(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

export function sendDesktop(title: string, body: string): void {
  const os = platform()
  try {
    if (os === 'darwin') {
      // spawnSync avoids shell — args are passed directly to osascript, no shell expansion
      spawnSync('osascript', [
        '-e',
        `display notification "${escapeAppleScript(body)}" with title "${escapeAppleScript(title)}"`,
      ], { stdio: 'ignore', timeout: 5000 })
    } else if (os === 'linux') {
      // spawnSync avoids shell — title and body are separate args, not interpolated
      spawnSync('notify-send', [title, body, '--icon=terminal'], {
        stdio: 'ignore',
        timeout: 5000,
      })
    } else if (os === 'win32') {
      // Pass the script as a single -Command arg — no shell quoting needed
      const script = [
        'Add-Type -AssemblyName System.Windows.Forms',
        '$n = New-Object System.Windows.Forms.NotifyIcon',
        '$n.Icon = [System.Drawing.SystemIcons]::Information',
        '$n.Visible = $true',
        `$n.ShowBalloonTip(5000, '${title.replace(/'/g, "''")}', '${body.replace(/'/g, "''")}', [System.Windows.Forms.ToolTipIcon]::Info)`,
        'Start-Sleep -Milliseconds 5500',
        '$n.Dispose()',
      ].join('; ')
      spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
        stdio: 'ignore',
        timeout: 8000,
      })
    }
  } catch {
    // Silent — desktop notif is best-effort, never break the hook
  }
}
