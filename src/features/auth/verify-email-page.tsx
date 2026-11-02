import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Card } from '@/components/ui/card'
import { ROUTES } from '@/config/routes'
import { api, ApiError } from '@/lib/api'

export default function VerifyEmailPage() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const [state, setState] = useState<'pending' | 'ok' | 'error'>(token ? 'pending' : 'error')
  const [message, setMessage] = useState('This verification link is missing its token.')

  useEffect(() => {
    if (!token) return
    api('/auth/verify-email', { method: 'POST', body: { token } })
      .then(() => setState('ok'))
      .catch((e: unknown) => {
        setMessage(e instanceof ApiError ? e.message : 'Verification failed')
        setState('error')
      })
  }, [token])

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <Card className="p-8 text-center" role="status">
        <h1 className="text-xl font-semibold">
          {state === 'pending' ? 'Verifying…' : state === 'ok' ? 'Email verified' : 'Verification failed'}
        </h1>
        {state === 'error' && <p className="mt-2 text-sm text-ink-soft">{message}</p>}
        <Link to={ROUTES.app.dashboard} className="mt-6 inline-block text-sm font-medium text-accent-700 underline">
          Go to dashboard
        </Link>
      </Card>
    </div>
  )
}
