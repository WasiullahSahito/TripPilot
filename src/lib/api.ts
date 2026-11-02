export class ApiError extends Error {
  status: number
  fields?: Record<string, string>

  constructor(status: number, message: string, fields?: Record<string, string>) {
    super(message)
    this.status = status
    this.fields = fields
  }
}

const BASE = import.meta.env.VITE_API_BASE_URL ?? ''

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method: init.method ?? 'GET',
      credentials: 'include',
      headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
      body: init.body ? JSON.stringify(init.body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Is the API running?')
  }
  if (res.status === 204) return undefined as T
  const data = (await res.json().catch(() => ({}))) as { error?: string; fields?: Record<string, string> }
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Request failed', data.fields)
  return data as T
}
