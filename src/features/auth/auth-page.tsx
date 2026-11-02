import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/field'
import { ROUTES } from '@/config/routes'
import { ApiError } from '@/lib/api'
import { useAuth } from './auth-context'

const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
})
const signupSchema = loginSchema.extend({
  name: z.string().trim().min(1, 'Enter your name').max(80),
  password: z.string().min(10, 'Use at least 10 characters'),
})
type FormValues = { name?: string; email: string; password: string }

export default function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const isSignup = mode === 'signup'
  const { user, login, register: registerUser } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(isSignup ? signupSchema : loginSchema) })

  const from = (location.state as { from?: string } | null)?.from ?? ROUTES.app.dashboard
  if (user) return <Navigate to={from} replace />

  const onSubmit = handleSubmit(async (v) => {
    setServerError(null)
    try {
      if (isSignup) await registerUser(v.name ?? '', v.email, v.password)
      else await login(v.email, v.password)
      navigate(isSignup ? ROUTES.onboarding : from, { replace: true })
    } catch (e) {
      if (e instanceof ApiError && e.fields) {
        // Server-side rules (for example "password too common") appear next to the field they belong to.
        let shown = false
        for (const name of ['name', 'email', 'password'] as const) {
          const message = e.fields[name]
          if (message) {
            setError(name, { message })
            shown = true
          }
        }
        if (shown) return
      }
      setServerError(e instanceof ApiError ? e.message : 'Something went wrong')
    }
  })

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <Card className="p-6 sm:p-8">
        <h1 className="text-2xl font-semibold">{isSignup ? 'Create your account' : 'Welcome back'}</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {isSignup ? 'Start preparing your trip in minutes.' : 'Log in to continue your trip.'}
        </p>
        <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-4">
          {isSignup && (
            <Field label="Full name" htmlFor="name" error={errors.name?.message}>
              <Input id="name" autoComplete="name" aria-invalid={!!errors.name} {...register('name')} />
            </Field>
          )}
          <Field label="Email" htmlFor="email" error={errors.email?.message}>
            <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...register('email')} />
          </Field>
          <Field label="Password" htmlFor="password" error={errors.password?.message}>
            <Input
              id="password"
              type="password"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              aria-invalid={!!errors.password}
              {...register('password')}
            />
          </Field>
          {serverError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Please wait…' : isSignup ? 'Create account' : 'Log in'}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-ink-soft">
          {isSignup ? 'Already have an account?' : 'New to TripPilot?'}{' '}
          <Link to={isSignup ? ROUTES.login : ROUTES.signup} className="font-medium text-accent-700 underline">
            {isSignup ? 'Log in' : 'Create an account'}
          </Link>
        </p>
      </Card>
    </div>
  )
}
