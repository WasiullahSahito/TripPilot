import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { signUp } from './helpers'

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

async function violations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.impact}): ${v.help} -> ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)
}

test.describe('accessibility (axe, WCAG 2.1 A/AA, serious and critical only)', () => {
  test('public pages', async ({ page }) => {
    const problems: string[] = []
    for (const path of ['/', '/login', '/signup', '/help', '/privacy', '/terms']) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      for (const v of await violations(page)) problems.push(`${path}: ${v}`)
    }
    expect(problems).toEqual([])
  })

  test('signed-in pages', async ({ page }) => {
    await signUp(page)
    const problems: string[] = []
    for (const path of [
      '/app', '/app/visa', '/app/visa/france/schengen-visitor?nationality=India&residence=India', '/app/flights', '/app/hotels', '/app/insurance', '/app/budget',
      '/app/appointments', '/app/documents', '/app/bookings', '/app/extras', '/app/translate', '/app/assistant', '/app/notifications', '/app/profile',
    ]) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      for (const v of await violations(page)) problems.push(`${path}: ${v}`)
    }
    expect(problems).toEqual([])
  })

  test('hotel results (stubbed directory)', async ({ page }) => {
    await signUp(page)
    await page.route('**/api/hotels/directory**', (route) => route.fulfill({ json: {
      listings: [{ id: 'node/1', name: 'Hotel Lumiere', kind: 'hotel', stars: 4, lat: 48.86, lng: 2.35, distanceKm: 0.6, address: '12 Rue Exemple', website: 'https://lumiere.example/', phone: null, wifi: true, wheelchair: 'yes', osmUrl: 'https://www.openstreetmap.org/node/1' }],
      cached: false, source: 'OpenStreetMap contributors', notice: 'Real properties from OpenStreetMap. Prices, availability and reviews are not included.',
    } }))
    await page.goto('/app/hotels')
    await page.getByLabel('Destination').selectOption('Paris')
    await page.getByLabel('Check-in').fill('2030-05-01')
    await page.getByLabel('Check-out').fill('2030-05-04')
    await page.getByRole('button', { name: 'Find hotels' }).click()
    await expect(page.getByRole('heading', { name: 'Hotel Lumiere' })).toBeVisible()
    expect(await violations(page)).toEqual([])
  })

  test('the map page', async ({ page }) => {
    await signUp(page)
    await page.goto('/app/map')
    await page.waitForSelector('[aria-label="Interactive map"]')
    expect(await violations(page)).toEqual([])
  })

  test('keyboard: skip link, focus is visible, and the sign-up form works without a mouse', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()

    await page.goto('/signup')
    await page.getByLabel('Full name').focus()
    await page.keyboard.type('Keyboard User')
    await page.keyboard.press('Tab')
    await page.keyboard.type('keyboard@example.com')
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('Password')).toBeFocused()
    const outline = await page.getByLabel('Password').evaluate((el) => getComputedStyle(el).outlineStyle)
    expect(outline).not.toBe('none')
  })
})

test.describe('responsive layout', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('no horizontal scrolling on a phone-sized screen', async ({ page }) => {
    const overflow = async (path: string) => {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    }
    for (const path of ['/', '/login', '/help']) expect(await overflow(path), path).toBeLessThanOrEqual(1)
    await signUp(page)
    for (const path of ['/app', '/app/visa', '/app/flights', '/app/appointments', '/app/documents']) expect(await overflow(path), path).toBeLessThanOrEqual(1)
  })

  test('the mobile menu opens and links work', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Open menu' }).click()
    await expect(page.getByRole('navigation', { name: 'Mobile' })).toBeVisible()
    await page.getByRole('link', { name: 'Get started' }).last().click()
    await expect(page).toHaveURL(/\/signup/)
  })
})
