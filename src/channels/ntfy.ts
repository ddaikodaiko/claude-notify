const FETCH_TIMEOUT_MS = 5000

export async function sendNtfy(
  server: string,
  topic: string,
  title: string,
  body: string,
): Promise<void> {
  if (!topic) return

  // Sanitize server URL — must be http(s)
  const base = server.replace(/\/$/, '')
  if (!/^https?:\/\//i.test(base)) throw new Error('ntfy server must start with http:// or https://')

  const url = `${base}/${encodeURIComponent(topic)}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Title': title,
        'Content-Type': 'text/plain; charset=utf-8',
        'Priority': 'default',
        'Tags': 'white_check_mark',
      },
      body,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}
