import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, ApiError } from '@/lib/api'
import type { Profile, User } from '@/types/api'

interface AuthState {
  user: User | null
  profile: Profile | null
  loading: boolean
  login(email: string, password: string): Promise<void>
  register(name: string, email: string, password: string): Promise<void>
  logout(): Promise<void>
  saveProfile(p: Omit<Profile, 'userId' | 'onboardedAt'>): Promise<void>
  updateName(name: string): Promise<void>
  setRetention(days: number | null): Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const loadMe = useCallback(async () => {
    try {
      const me = await api<{ user: User; profile: Profile }>('/auth/me')
      setUser(me.user)
      setProfile(me.profile)
    } catch (e) {
      if (!(e instanceof ApiError)) throw e
      setUser(null)
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadMe()
  }, [loadMe])

  const value = useMemo<AuthState>(
    () => ({
      user,
      profile,
      loading,
      async login(email, password) {
        await api('/auth/login', { method: 'POST', body: { email, password } })
        await loadMe()
      },
      async register(name, email, password) {
        await api('/auth/register', { method: 'POST', body: { name, email, password } })
        await loadMe()
      },
      async logout() {
        await api('/auth/logout', { method: 'POST' })
        setUser(null)
        setProfile(null)
      },
      async saveProfile(p) {
        const res = await api<{ profile: Profile }>('/profile', { method: 'PUT', body: p })
        setProfile(res.profile)
      },
      async setRetention(days) {
        const res = await api<{ profile: Profile }>('/profile/retention', { method: 'PATCH', body: { days } })
        setProfile(res.profile)
      },
      async updateName(name) {
        const res = await api<{ user: User }>('/account/name', { method: 'PATCH', body: { name } })
        setUser(res.user)
      },
    }),
    [user, profile, loading, loadMe],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth() {
  const ctx = use(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
