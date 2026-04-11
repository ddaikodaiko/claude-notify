const FETCH_TIMEOUT_MS = 5000

// Strip CRLF — prevents HTTP header injection
function sanitizeHeader(s: string): string {
  return s.replace(/[\r\n]/g, ' ').trim()
}

export async function sendNtfy(
  server: string,
  topic: string,
  title: string,
  body: string,
): Promise<void> {
  if (!topic) return

  const base = server.replace(/\/$/, '')
  if (!/^https?:\/\//i.test(base)) throw new Error('ntfy server must start with http:// or https://')

  const url = `${base}/${encodeURIComponent(topic)}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Title': sanitizeHeader(title),
        'Content-Type': 'text/plain; charset=utf-8',
        'Priority': 'default',
        'Tags': 'white_check_mark',
      },
      body,
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`ntfy returned ${res.status}`)
  } finally {
    clearTimeout(timer)
  }
}
