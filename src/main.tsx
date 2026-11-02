import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import './i18n'
import { AuthProvider } from '@/features/auth/auth-context'
import { router } from '@/routes'
import './index.css'

// After a new deploy, a tab opened earlier still points at old file names that no longer exist (the server answers with HTML).
// Reload once to pick up the new build; the flag prevents a reload loop if the file is genuinely missing.
window.addEventListener('vite:preloadError', () => {
  try {
    if (sessionStorage.getItem('chunk-reload')) return
    sessionStorage.setItem('chunk-reload', '1')
  } catch {
    return
  }
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </StrictMode>,
)
