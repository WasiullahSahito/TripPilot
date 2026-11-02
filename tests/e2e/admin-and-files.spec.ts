import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { ADMIN, inDays, loginAs, noisePng, PASSWORD, paddedPdf, samplePdf, signUp } from './helpers'

const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'
const withPdfBody = (body: string) => Buffer.from(`%PDF-1.4\n${body}\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`)

async function addBooking(page: Page, title: string, kind: 'flight' | 'hotel' | 'insurance' = 'hotel') {
  await page.goto('/app/bookings')
  await page.getByLabel('Type').selectOption(kind)
  await page.getByLabel('Title').fill(title)
  await page.getByLabel('Start date').fill(inDays(30))
  await page.getByRole('button', { name: 'Add to history' }).click()
  await expect(page.getByText(title).first()).toBeVisible()
}

async function seriousViolations(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.help}`)
}

test.describe('admin: users, disabling and the audit log', () => {
  test('an admin finds a user, disables them (locking them out at once), re-enables them, and the log shows it', async ({ browser }) => {
    const userCtx = await browser.newContext()
    const user = await userCtx.newPage()
    const { email } = await signUp(user, 'Locked Out')

    const adminCtx = await browser.newContext()
    const admin = await adminCtx.newPage()
    await loginAs(admin, ADMIN.email, ADMIN.password)
    await admin.goto('/admin')
    await expect(admin.getByRole('heading', { name: 'Admin dashboard' })).toBeVisible()
    await admin.getByRole('tab', { name: 'Users' }).click()
    await admin.getByLabel('Search by name or email').fill(email)
    await admin.getByRole('button', { name: 'Search' }).click()
    const row = admin.getByRole('row').filter({ hasText: email })
    await expect(row).toBeVisible()
    await expect(row.getByText('Active')).toBeVisible()

    // two-step: nothing happens on the first click
    await row.getByRole('button', { name: new RegExp(`Disable ${email}`) }).click()
    await expect(row.getByText('Active')).toBeVisible()
    await row.getByRole('button', { name: /Confirm disable/ }).click()
    await expect(row.getByText('Disabled')).toBeVisible()

    // the user's existing session is dead immediately
    await user.goto('/app')
    await expect(user).toHaveURL(/\/login/)
    await user.getByLabel('Email').fill(email)
    await user.getByLabel('Password').fill(PASSWORD)
    await user.getByRole('button', { name: 'Log in' }).click()
    await expect(user.getByText(/This account has been disabled/)).toBeVisible()

    await row.getByRole('button', { name: new RegExp(`Re-enable ${email}`) }).click()
    await row.getByRole('button', { name: /Confirm re-enable/ }).click()
    await expect(row.getByText('Active')).toBeVisible()
    await user.getByRole('button', { name: 'Log in' }).click()
    await expect(user.getByRole('heading', { name: /^Welcome, / })).toBeVisible()

    await admin.getByRole('tab', { name: 'Audit log' }).click()
    await admin.getByLabel('Filter by event').selectOption({ label: 'Account disabled by admin' })
    const entry = admin.getByRole('row').filter({ hasText: email })
    await expect(entry).toContainText('Account disabled by admin')
    await expect(entry).toContainText(ADMIN.email)
    // the blocked sign-in attempt is recorded under its own event, not as a "failed" one
    await admin.getByLabel('Filter by event').selectOption({ label: 'Sign-in blocked (disabled)' })
    await expect(admin.getByRole('row').filter({ hasText: email })).toContainText('Sign-in blocked (disabled)')
    await admin.getByLabel('Filter by event').selectOption({ label: 'Failed sign-in' })
    await expect(admin.getByText('No events of this kind yet.')).toBeVisible()

    expect(await seriousViolations(admin)).toEqual([])
    await userCtx.close()
    await adminCtx.close()
  })

  test('administrator accounts are protected and ordinary users cannot reach admin pages or APIs', async ({ page, browser }) => {
    await signUp(page)
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/app$/)
    const status = await page.evaluate(async () => (await fetch('/api/admin/users')).status)
    expect(status).toBe(403)

    const ctx = await browser.newContext()
    const admin = await ctx.newPage()
    await loginAs(admin, ADMIN.email, ADMIN.password)
    await admin.goto('/admin')
    await admin.getByRole('tab', { name: 'Users' }).click()
    const adminRow = admin.getByRole('row').filter({ hasText: ADMIN.email })
    await expect(adminRow.getByText('Protected')).toBeVisible()
    await expect(adminRow.getByRole('button')).toHaveCount(0)
    await ctx.close()
  })

  test('the overview shows how much of the visa guidance has been reviewed (none yet)', async ({ browser }) => {
    const ctx = await browser.newContext()
    const admin = await ctx.newPage()
    await loginAs(admin, ADMIN.email, ADMIN.password)
    await admin.goto('/admin')
    await expect(admin.getByText(/0 reviewed, 0 out of date, \d+ never reviewed by a person/)).toBeVisible()
    await ctx.close()
  })
})

test.describe('uploads: scanning, large photos and large files', () => {
  test('files with active content or the antivirus test signature are refused with a clear reason', async ({ page }) => {
    await signUp(page)
    await addBooking(page, 'Hotel Scan')
    const attach = page.getByLabel('Attach document to Hotel Scan')

    await attach.setInputFiles({ name: 'eicar.pdf', mimeType: 'application/pdf', buffer: withPdfBody(EICAR) })
    await expect(page.getByRole('alert').filter({ hasText: /antivirus test signature/ })).toBeVisible()

    await attach.setInputFiles({ name: 'script.pdf', mimeType: 'application/pdf', buffer: withPdfBody('1 0 obj << /S /JavaScript /JS (app.alert(1)) >> endobj') })
    await expect(page.getByRole('alert').filter({ hasText: /active content/ })).toBeVisible()

    await attach.setInputFiles({ name: 'ok.pdf', mimeType: 'application/pdf', buffer: await samplePdf('fine') })
    await expect(page.getByRole('link', { name: 'ok.pdf' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'eicar.pdf' })).toHaveCount(0)
  })

  test('a large photo is shrunk automatically to fit, and the result is accepted by the safety scan', async ({ page }) => {
    test.setTimeout(120_000)
    await signUp(page)
    await addBooking(page, 'Hotel Photo')
    const big = noisePng(1500, 1100) // about 5 MB: over the 4 MB limit
    expect(big.length).toBeGreaterThan(4 * 1024 * 1024)
    await page.getByLabel('Attach document to Hotel Photo').setInputFiles({ name: 'passport-photo.png', mimeType: 'image/png', buffer: big })
    await expect(page.getByRole('link', { name: 'passport-photo.jpg' })).toBeVisible({ timeout: 60_000 })
  })

  test('a large PDF explains why it was refused instead of failing silently', async ({ page }) => {
    await signUp(page)
    await addBooking(page, 'Hotel Big Pdf')
    await page.getByLabel('Attach document to Hotel Big Pdf').setInputFiles({ name: 'huge.pdf', mimeType: 'application/pdf', buffer: paddedPdf(5 * 1024 * 1024) })
    await expect(page.getByRole('alert').filter({ hasText: /up to 4 MB.*smaller PDF/ })).toBeVisible()
  })
})

test.describe('document package: ordering and photo size', () => {
  test('drag and drop reorders the package, and so do the arrow buttons', async ({ page }) => {
    await signUp(page)
    await addBooking(page, 'Hotel Order', 'hotel')
    await addBooking(page, 'Flight Order', 'flight')
    await page.goto('/app/documents')

    const items = page.getByRole('list').first().getByRole('listitem')
    const titles = async () => (await items.allTextContents()).map((t) => (t.includes('Hotel reservations') ? 'hotel' : t.includes('Flight reservations') ? 'flight' : '?'))
    await expect.poll(titles).toEqual(['flight', 'hotel'])

    const hotel = items.filter({ hasText: 'Hotel reservations' })
    const flight = items.filter({ hasText: 'Flight reservations' })
    await hotel.dragTo(flight, { targetPosition: { x: 40, y: 4 } }) // top half of the target: drop before it
    await expect.poll(titles).toEqual(['hotel', 'flight'])

    await page.getByRole('button', { name: 'Move Hotel reservations down' }).click()
    await expect.poll(titles).toEqual(['flight', 'hotel'])

    // the built package follows the chosen order
    await page.getByRole('button', { name: 'Move Hotel reservations up' }).click()
    await page.getByRole('button', { name: 'Build preview' }).click()
    await expect(page.getByText(/Built \d+ pages?/)).toBeVisible()
    const outline = await page.getByRole('list').last().allTextContents()
    expect(outline.join(' ').indexOf('Hotel reservations')).toBeLessThan(outline.join(' ').indexOf('Flight reservations'))
  })

  test('reducing photo size shrinks a big photo inside the package and reports the saving', async ({ page }) => {
    test.setTimeout(150_000)
    await signUp(page)
    await addBooking(page, 'Hotel Compress')
    await page.getByLabel('Attach document to Hotel Compress').setInputFiles({ name: 'scan.png', mimeType: 'image/png', buffer: noisePng(1500, 1100) })
    await expect(page.getByRole('link', { name: 'scan.jpg' })).toBeVisible({ timeout: 60_000 })

    await page.goto('/app/documents')
    await page.getByLabel('Reduce photo size').check()
    await page.getByRole('button', { name: 'Build preview' }).click()
    await expect(page.getByText(/1 photo reduced, \d+ KB saved/)).toBeVisible({ timeout: 90_000 })
    await expect(page.getByText(/Uploaded PDFs are always included exactly as they are/)).toBeVisible()
  })
})

test.describe('settings: automatic file deletion, and visa guidance status', () => {
  test('a user can opt in to automatic deletion and the choice sticks', async ({ page }) => {
    await signUp(page)
    await page.goto('/app/settings')
    const select = page.getByLabel('Delete my uploaded files')
    await expect(select).toHaveValue('')
    await select.selectOption('60')
    await expect(page.getByText(/deleted 60 days after the related trip/)).toBeVisible()
    await page.reload()
    await expect(page.getByLabel('Delete my uploaded files')).toHaveValue('60')
    await page.getByLabel('Delete my uploaded files').selectOption('')
    await expect(page.getByText(/kept until you delete them/)).toBeVisible()
    expect(await seriousViolations(page)).toEqual([])
  })

  test('the visa workspace says plainly that the guidance has not been reviewed', async ({ page }) => {
    await signUp(page)
    await page.goto('/app/visa/france/schengen-visitor?nationality=India&residence=India')
    await expect(page.getByRole('note').filter({ hasText: /Not reviewed\./ })).toBeVisible()
    await expect(page.getByText(/Not yet reviewed by a person against the official sources/)).toBeVisible()
  })
})
