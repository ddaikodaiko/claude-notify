const FETCH_TIMEOUT_MS = 5000

export async function sendWebhook(
  url: string,
  method: 'POST' | 'GET',
  headers: Record<string, string>,
  bodyTemplate: string,
  title: string,
  body: string,
): Promise<void> {
  if (!url) return

  // Only allow http(s) — prevents file://, javascript:, etc.
  if (!/^https?:\/\//i.test(url)) throw new Error('Webhook URL must start with http:// or https://')

  const rendered = bodyTemplate
    .replace(/\{\{title\}\}/g, title)
    .replace(/\{\{body\}\}/g, body)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    await fetch(url, {
      method,
      headers,
      body: method === 'POST' ? rendered : undefined,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}
