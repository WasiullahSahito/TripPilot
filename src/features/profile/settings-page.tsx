import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate } from 'react-router'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/field'
import { ROUTES } from '@/config/routes'
import { useAuth } from '@/features/auth/auth-context'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import i18n, { LANGUAGES, LANGUAGE_LABELS } from '@/i18n'
import { RetentionSetting } from './retention-setting'

const INTERESTS = ['Culture', 'Food', 'Nature', 'Beaches', 'Cities', 'Adventure', 'Business', 'Family']
const nameSchema = z.object({ name: z.string().trim().min(1).max(80) })
const profileSchema = z.object({
  nationality: z.string().trim().min(2).max(60),
  residenceCountry: z.string().trim().min(2).max(60),
  homeAirport: z.string().trim().max(60),
  interests: z.array(z.string()).max(12),
})
const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10).max(128),
  confirmPassword: z.string().min(1),
}).refine((v) => v.newPassword === v.confirmPassword, {
  path: ['confirmPassword'],
})

type ProfileForm = z.infer<typeof profileSchema>
type PasswordForm = z.infer<typeof passwordSchema>
type Notice = { kind: 'success' | 'error'; text: string }

const messageOf = (e: unknown, fallback: string) => e instanceof Error ? e.message : fallback

export default function SettingsPage() {
  const { t } = useTranslation()
  const { user, profile, saveProfile, updateName, logout } = useAuth()
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  const [nameMessage, setNameMessage] = useState<Notice | null>(null)
  const [profileMessage, setProfileMessage] = useState<Notice | null>(null)
  const [passwordMessage, setPasswordMessage] = useState<Notice | null>(null)
  const [accountError, setAccountError] = useState<string | null>(null)

  const nameForm = useForm<z.infer<typeof nameSchema>>({
    resolver: zodResolver(nameSchema),
    defaultValues: { name: user?.name ?? '' },
  })
  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { nationality: '', residenceCountry: '', homeAirport: '', interests: [] },
  })
  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  })
  const interests = profileForm.watch('interests')

  useEffect(() => {
    if (user) nameForm.reset({ name: user.name })
  }, [user, nameForm])

  useEffect(() => {
    if (profile) {
      profileForm.reset({
        nationality: profile.nationality,
        residenceCountry: profile.residenceCountry,
        homeAirport: profile.homeAirport,
        interests: profile.interests,
      })
    }
  }, [profile, profileForm])

  if (!user) return <Navigate to={ROUTES.login} replace />

  const saveName = nameForm.handleSubmit(async ({ name }) => {
    setNameMessage(null)
    try {
      await updateName(name)
      setNameMessage({ kind: 'success', text: t('settings.nameSaved') })
    } catch (e) {
      setNameMessage({ kind: 'error', text: messageOf(e, t('settings.nameFailed')) })
    }
  })

  const savePreferences = profileForm.handleSubmit(async (values) => {
    setProfileMessage(null)
    try {
      await saveProfile(values)
      setProfileMessage({ kind: 'success', text: t('settings.preferencesSaved') })
    } catch (e) {
      setProfileMessage({ kind: 'error', text: messageOf(e, t('settings.preferencesFailed')) })
    }
  })

  const changePassword = passwordForm.handleSubmit(async ({ currentPassword, newPassword }) => {
    setPasswordMessage(null)
    try {
      await api('/account/password', { method: 'POST', body: { currentPassword, newPassword } })
      passwordForm.reset()
      setPasswordMessage({ kind: 'success', text: t('settings.passwordChanged') })
    } catch (e) {
      setPasswordMessage({ kind: 'error', text: messageOf(e, t('settings.passwordFailed')) })
    }
  })

  const exportData = async () => {
    setAccountError(null)
    try {
      const data = await api<unknown>('/account/export')
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = 'trippilot-export.json'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setAccountError(messageOf(e, t('settings.exportFailed')))
    }
  }

  const deleteAccount = async () => {
    setAccountError(null)
    try {
      await api('/account', { method: 'DELETE' })
      navigate(ROUTES.home, { replace: true })
      void logout().catch(() => undefined)
    } catch (e) {
      setAccountError(messageOf(e, t('settings.deleteFailed')))
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <header>
        <p className="text-sm font-medium text-accent-700">{t('settings.eyebrow')}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{t('settings.title')}</h1>
        <p className="mt-2 text-sm text-ink-soft">{t('settings.description')}</p>
      </header>

      <Card className="p-5 sm:p-6">
        <h2 className="font-semibold">{t('settings.languageTitle')}</h2>
        <p className="mt-1 text-sm text-ink-soft">{t('settings.languageDescription')}</p>
        <Field label={t('settings.languageLabel')} htmlFor="settings-language">
          <Select id="settings-language" value={i18n.language} onChange={(e) => void i18n.changeLanguage(e.target.value)} className="mt-3 max-w-sm">
            {LANGUAGES.map((language) => <option key={language} value={language}>{LANGUAGE_LABELS[language]}</option>)}
          </Select>
        </Field>
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="font-semibold">{t('settings.account')}</h2>
        <p className="mt-1 text-sm text-ink-soft">{t('settings.emailNote')}</p>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <form onSubmit={saveName} noValidate className="space-y-3">
            <Field label={t('settings.name')} htmlFor="settings-name" error={nameForm.formState.errors.name && t('settings.nameRequired')}>
              <Input id="settings-name" autoComplete="name" aria-invalid={!!nameForm.formState.errors.name} {...nameForm.register('name')} />
            </Field>
            <Button type="submit" variant="outline" disabled={nameForm.formState.isSubmitting}>
              {nameForm.formState.isSubmitting ? 'Saving…' : t('settings.saveName')}
            </Button>
            {nameMessage && <p role={nameMessage.kind === 'error' ? 'alert' : 'status'} className={cn('text-sm', nameMessage.kind === 'error' ? 'text-red-700' : 'text-ink-soft')}>{nameMessage.text}</p>}
          </form>
          <Field label={t('settings.email')} htmlFor="settings-email">
            <Input id="settings-email" value={`${user.email}${user.emailVerified ? '' : ' (not verified)'}`} readOnly />
          </Field>
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="font-semibold">{t('settings.preferences')}</h2>
        <p className="mt-1 text-sm text-ink-soft">{t('settings.preferencesDescription')}</p>
        <form onSubmit={savePreferences} noValidate className="mt-4 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('settings.nationality')} htmlFor="settings-nationality" error={profileForm.formState.errors.nationality && t('settings.nationalityRequired')}>
              <Input id="settings-nationality" aria-invalid={!!profileForm.formState.errors.nationality} {...profileForm.register('nationality')} />
            </Field>
            <Field label={t('settings.residence')} htmlFor="settings-residence" error={profileForm.formState.errors.residenceCountry && t('settings.residenceRequired')}>
              <Input id="settings-residence" aria-invalid={!!profileForm.formState.errors.residenceCountry} {...profileForm.register('residenceCountry')} />
            </Field>
            <Field label={t('settings.airport')} htmlFor="settings-airport" error={profileForm.formState.errors.homeAirport?.message}>
              <Input id="settings-airport" placeholder="e.g. DEL or New Delhi" {...profileForm.register('homeAirport')} />
            </Field>
          </div>
          <fieldset className="flex flex-wrap gap-2">
            <legend className="mb-2 text-xs font-medium text-ink-soft">{t('settings.interests')}</legend>
            {INTERESTS.map((interest) => {
              const selected = interests.includes(interest)
              return (
                <button
                  key={interest}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => profileForm.setValue('interests', selected ? interests.filter((item) => item !== interest) : [...interests, interest], { shouldDirty: true })}
                  className={cn('rounded-full border px-3 py-1.5 text-sm', selected ? 'border-navy-900 bg-navy-900 text-white' : 'border-line bg-surface hover:bg-muted')}
                >
                  {interest}
                </button>
              )
            })}
          </fieldset>
          {profileMessage && <p role={profileMessage.kind === 'error' ? 'alert' : 'status'} className={cn('text-sm', profileMessage.kind === 'error' ? 'text-red-700' : 'text-ink-soft')}>{profileMessage.text}</p>}
          <Button type="submit" variant="accent" disabled={profileForm.formState.isSubmitting}>
            {profileForm.formState.isSubmitting ? 'Saving…' : t('settings.savePreferences')}
          </Button>
        </form>
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="font-semibold">{t('settings.security')}</h2>
        <p className="mt-1 text-sm text-ink-soft">{t('settings.passwordDescription')}</p>
        <form onSubmit={changePassword} noValidate className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label={t('settings.currentPassword')} htmlFor="settings-current-password" error={passwordForm.formState.errors.currentPassword && t('settings.currentPasswordRequired')}>
            <Input id="settings-current-password" type="password" autoComplete="current-password" aria-invalid={!!passwordForm.formState.errors.currentPassword} {...passwordForm.register('currentPassword')} />
          </Field>
          <div className="hidden sm:block" />
          <Field label={t('settings.newPassword')} htmlFor="settings-new-password" error={passwordForm.formState.errors.newPassword && t('settings.passwordMin')}>
            <Input id="settings-new-password" type="password" autoComplete="new-password" aria-invalid={!!passwordForm.formState.errors.newPassword} {...passwordForm.register('newPassword')} />
          </Field>
          <Field label={t('settings.confirmPassword')} htmlFor="settings-confirm-password" error={passwordForm.formState.errors.confirmPassword && (passwordForm.getValues('newPassword') !== passwordForm.getValues('confirmPassword') ? t('settings.passwordMismatch') : t('settings.confirmRequired'))}>
            <Input id="settings-confirm-password" type="password" autoComplete="new-password" aria-invalid={!!passwordForm.formState.errors.confirmPassword} {...passwordForm.register('confirmPassword')} />
          </Field>
          {passwordMessage && <p role={passwordMessage.kind === 'error' ? 'alert' : 'status'} className={cn('text-sm sm:col-span-2', passwordMessage.kind === 'error' ? 'text-red-700' : 'text-ink-soft')}>{passwordMessage.text}</p>}
          <div className="sm:col-span-2">
            <Button type="submit" variant="outline" disabled={passwordForm.formState.isSubmitting}>
              {passwordForm.formState.isSubmitting ? 'Updating…' : t('settings.changePassword')}
            </Button>
          </div>
        </form>
      </Card>

      <RetentionSetting />

      <Card className="p-5 sm:p-6">
        <h2 className="font-semibold">{t('settings.data')}</h2>
        <p className="mt-1 text-sm text-ink-soft">{t('settings.dataDescription')}</p>
        {accountError && <p role="alert" className="mt-3 text-sm text-red-700">{accountError}</p>}
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => void exportData()}>{t('settings.export')}</Button>
          {confirming ? (
            <>
              <Button className="bg-red-600 hover:bg-red-700" onClick={() => void deleteAccount()}>{t('settings.confirmDelete')}</Button>
              <Button variant="ghost" onClick={() => setConfirming(false)}>{t('settings.cancel')}</Button>
            </>
          ) : (
            <Button variant="ghost" className="text-red-700" onClick={() => setConfirming(true)}>{t('settings.delete')}</Button>
          )}
        </div>
      </Card>
    </div>
  )
}
