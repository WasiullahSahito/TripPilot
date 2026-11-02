import { Menu, X } from 'lucide-react'
import { useState } from 'react'
import { Link, Outlet } from 'react-router'
import { Logo } from '@/components/shared/logo'
import { SeoManager } from '@/components/shared/seo-manager'
import { Button } from '@/components/ui/button'
import { marketingNav } from '@/config/site'
import { ROUTES } from '@/config/routes'
import { SiteFooter } from './site-footer'

function SiteHeader() {
  const [open, setOpen] = useState(false)
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Logo />
        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {marketingNav.map((n) => (
            <a key={n.href} href={n.href} className="rounded-lg px-3 py-2 text-sm text-ink-soft hover:text-ink">
              {n.label}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <Button asChild variant="ghost" size="sm"><Link to={ROUTES.login}>Log in</Link></Button>
          <Button asChild size="sm"><Link to={ROUTES.signup}>Get started</Link></Button>
        </div>
        <button
          className="grid size-10 place-items-center rounded-lg md:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label="Mobile" className="flex flex-col gap-1 border-t border-line px-4 py-3 md:hidden">
          {marketingNav.map((n) => (
            <a key={n.href} href={n.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-sm">
              {n.label}
            </a>
          ))}
          <div className="mt-2 flex gap-2">
            <Button asChild variant="outline" className="flex-1"><Link to={ROUTES.login}>Log in</Link></Button>
            <Button asChild className="flex-1"><Link to={ROUTES.signup}>Get started</Link></Button>
          </div>
        </nav>
      )}
    </header>
  )
}

export function MarketingLayout() {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <SiteHeader />
      <SeoManager />
      <main id="main"><Outlet /></main>
      <SiteFooter />
    </>
  )
}
