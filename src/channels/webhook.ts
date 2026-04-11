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

  const vars: Record<string, string> = { title, body }
  const rendered = bodyTemplate.replace(/\{\{(title|body)\}\}/g, (_, key) => vars[key] ?? '')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: method === 'POST' ? rendered : undefined,
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`Webhook returned ${res.status}`)
  } finally {
    clearTimeout(timer)
  }
}
