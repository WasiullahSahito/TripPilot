import { Navigate, Outlet, useLocation } from 'react-router'
import { ROUTES } from '@/config/routes'
import type { User } from '@/types/api'
import { useAuth } from './auth-context'

interface Props {
  role?: User['role']
  /** Set false for the onboarding route itself to avoid a redirect loop. */
  requireOnboarded?: boolean
}

export function ProtectedRoute({ role, requireOnboarded = true }: Props) {
  const { user, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) return <div role="status" className="p-16 text-center text-sm text-ink-soft">Loading…</div>
  if (!user) return <Navigate to={ROUTES.login} replace state={{ from: location.pathname }} />
  if (role && user.role !== role) return <Navigate to={ROUTES.app.dashboard} replace />
  if (requireOnboarded && profile && !profile.onboardedAt) return <Navigate to={ROUTES.onboarding} replace />
  return <Outlet />
}
