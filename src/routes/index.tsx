import { lazy, Suspense } from 'react'
import { createBrowserRouter, Link, Navigate } from 'react-router'
import { AppLayout } from '@/components/layout/app-layout'
import { MarketingLayout } from '@/components/layout/marketing-layout'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/config/routes'
import { ProtectedRoute } from '@/features/auth/protected-route'

const LandingPage = lazy(() => import('@/features/landing/landing-page'))
const AuthPage = lazy(() => import('@/features/auth/auth-page'))
const VerifyEmailPage = lazy(() => import('@/features/auth/verify-email-page'))
const OnboardingPage = lazy(() => import('@/features/onboarding/onboarding-page'))
const VisaStartPage = lazy(() => import('@/features/visa/visa-start-page'))
const VisaWorkspacePage = lazy(() => import('@/features/visa/visa-workspace-page'))
const FlightsPage = lazy(() => import('@/features/flights/flights-page'))
const TrainsPage = lazy(() => import('@/features/trains/trains-page'))
const HotelsPage = lazy(() => import('@/features/hotels/hotels-page'))
const BookingsPage = lazy(() => import('@/features/bookings/bookings-page'))
const InsurancePage = lazy(() => import('@/features/insurance/insurance-page'))
const MapsPage = lazy(() => import('@/features/maps/maps-page'))
const AppointmentsPage = lazy(() => import('@/features/appointments/appointments-page'))
const DocumentsPage = lazy(() => import('@/features/documents/documents-page'))
const ExtrasPage = lazy(() => import('@/features/extras/extras-page'))
const TranslatePage = lazy(() => import('@/features/translate/translate-page'))
const HelpPage = lazy(() => import('@/features/help/help-page'))
const PrivacyPage = lazy(() => import('@/features/legal/legal-pages').then((m) => ({ default: m.PrivacyPage })))
const TermsPage = lazy(() => import('@/features/legal/legal-pages').then((m) => ({ default: m.TermsPage })))
const NotificationsPage = lazy(() => import('@/features/notifications/notifications-page'))
const AssistantPage = lazy(() => import('@/features/automation/assistant-page'))
const OrdersPage = lazy(() => import('@/features/checkout/orders-page').then((m) => ({ default: m.OrdersPage })))
const OrderPage = lazy(() => import('@/features/checkout/orders-page'))
const BudgetPage = lazy(() => import('@/features/budget/budget-page'))
const DashboardPage = lazy(() => import('@/features/dashboard/dashboard-page'))
const SettingsPage = lazy(() => import('@/features/profile/settings-page'))
const AdminPage = lazy(() => import('@/features/admin/admin-page'))

const Loading = () => <div role="status" className="p-16 text-center text-sm text-ink-soft">Loading…</div>

function lazyPage(node: React.ReactNode) {
  return <Suspense fallback={<Loading />}>{node}</Suspense>
}

function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <Button asChild className="mt-6"><Link to={ROUTES.home}>Back to home</Link></Button>
    </div>
  )
}


export const router = createBrowserRouter([
  {
    element: <MarketingLayout />,
    errorElement: <NotFound />,
    children: [
      { index: true, element: <Suspense fallback={<Loading />}><LandingPage /></Suspense> },
      { path: 'login', element: lazyPage(<AuthPage mode="login" />) },
      { path: 'signup', element: lazyPage(<AuthPage mode="signup" />) },
      { path: 'verify-email', element: lazyPage(<VerifyEmailPage />) },
      { path: 'help', element: lazyPage(<HelpPage />) },
      { path: 'privacy', element: lazyPage(<PrivacyPage />) },
      { path: 'terms', element: lazyPage(<TermsPage />) },
      { path: '*', element: <NotFound /> },
    ],
  },
  {
    element: <ProtectedRoute requireOnboarded={false} />,
    children: [{ element: <MarketingLayout />, children: [{ path: 'onboarding', element: lazyPage(<OnboardingPage />) }] }],
  },
  {
    element: <ProtectedRoute />,
    children: [{
    path: 'app',
    element: <AppLayout />,
    children: [
      { index: true, element: lazyPage(<DashboardPage />) },
      { path: 'visa', element: lazyPage(<VisaStartPage />) },
      { path: 'visa/:destinationId/:categoryId', element: lazyPage(<VisaWorkspacePage />) },
      { path: 'flights', element: lazyPage(<FlightsPage />) },
      { path: 'trains', element: lazyPage(<TrainsPage />) },
      { path: 'hotels', element: lazyPage(<HotelsPage />) },
      { path: 'insurance', element: lazyPage(<InsurancePage />) },
      { path: 'map', element: lazyPage(<MapsPage />) },
      { path: 'appointments', element: lazyPage(<AppointmentsPage />) },
      { path: 'documents', element: lazyPage(<DocumentsPage />) },
      { path: 'bookings', element: lazyPage(<BookingsPage />) },
      { path: 'orders', element: lazyPage(<OrdersPage />) },
      { path: 'orders/:id', element: lazyPage(<OrderPage />) },
      { path: 'budget', element: lazyPage(<BudgetPage />) },
      { path: 'extras', element: lazyPage(<ExtrasPage />) },
      { path: 'translate', element: lazyPage(<TranslatePage />) },
      { path: 'assistant', element: lazyPage(<AssistantPage />) },
      { path: 'profile', element: <Navigate to={ROUTES.app.settings} replace /> },
      { path: 'settings', element: lazyPage(<SettingsPage />) },
      { path: 'notifications', element: lazyPage(<NotificationsPage />) },
    ],
    }],
  },
  {
    element: <ProtectedRoute role="admin" />,
    children: [{ element: <MarketingLayout />, children: [{ path: 'admin', element: lazyPage(<AdminPage />) }] }],
  },
])
