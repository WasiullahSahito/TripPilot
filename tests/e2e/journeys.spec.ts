import { expect, test } from '@playwright/test'
import { inDays, samplePdf, signUp } from './helpers'

test.describe('visa workspace', () => {
  test('saves progress, resumes after a reload, and produces a summary PDF', async ({ page }) => {
    await signUp(page)
    await page.goto('/app/visa')
    await page.getByLabel('Destination').selectOption('france')
    await page.getByLabel('Nationality').fill('India')
    await page.getByLabel('Country of residence').fill('India')
    await page.getByRole('button', { name: /Continue to checklist/ }).click()

    await expect(page.getByRole('heading', { name: /France/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /France-Visas/ })).toHaveAttribute('href', 'https://france-visas.gouv.fr')
    await expect(page.getByText(/authoritative place to apply/)).toBeVisible()

    await page.getByRole('button', { name: 'Applicant' }).click()
    await page.getByLabel('Given names (as in passport)').fill('Asha')
    await expect(page.getByText('Progress saved')).toBeVisible()

    await page.reload()
    await page.getByRole('button', { name: 'Applicant' }).click()
    await expect(page.getByLabel('Given names (as in passport)')).toHaveValue('Asha')

    await page.getByRole('button', { name: 'Passport' }).click()
    await expect(page.getByText('Fill from a passport photo')).toBeVisible()
    await expect(page.getByText(/not uploaded or stored/)).toBeVisible()

    await page.getByRole('button', { name: /Review & export/ }).click()
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download summary PDF' }).click()
    expect((await download).suggestedFilename()).toBe('visa-summary-france.pdf')
    await expect(page.getByText(/TripPilot does not submit applications/)).toBeVisible()
  })

  test('validates the step when continuing and shows field errors', async ({ page }) => {
    await signUp(page)
    await page.goto('/app/visa/france/schengen-visitor?nationality=India&residence=India')
    await page.getByRole('button', { name: 'Applicant' }).click()
    await page.getByRole('button', { name: 'Continue' }).click() // moves on; the step is now marked attempted
    await page.getByRole('button', { name: 'Applicant' }).click()
    await expect(page.getByText('Given names is required')).toBeVisible()
  })
})

test.describe('bookings keep samples and confirmations apart', () => {
  test('a confirmed reservation needs the provider reference', async ({ page }) => {
    await signUp(page)
    await page.goto('/app/bookings')
    await page.getByLabel('Status').selectOption('confirmed')
    await page.getByLabel('Title').fill('Hotel Lumiere, Paris')
    await page.getByLabel('Start date').fill(inDays(40))
    await page.getByRole('button', { name: 'Add to history' }).click()
    await expect(page.getByText(/Enter the reference/)).toBeVisible()

    await page.getByLabel(/Confirmation reference/).fill('XK29LQ')
    await page.getByRole('button', { name: 'Add to history' }).click()
    const confirmed = page.getByRole('region', { name: /Confirmed \(reference entered by you\)/ })
    await expect(confirmed.getByText('Hotel Lumiere, Paris')).toBeVisible()
    await expect(confirmed.getByText('XK29LQ')).toBeVisible()
  })
})

test.describe('appointments', () => {
  test('requested, pending and confirmed are distinct and confirmation needs a reference', async ({ page }) => {
    await signUp(page)
    await page.goto('/app/appointments')
    await page.getByLabel('Visa centre / consulate').fill('Sample Visa Centre')
    await page.getByLabel('Date and time').fill(`${inDays(10)}T10:30`)
    await page.getByRole('button', { name: 'Save appointment' }).click()

    await page.getByRole('button', { name: 'agenda' }).click()
    await page.getByRole('button', { name: /Biometrics/ }).first().click()
    await expect(page.getByText(/not secured/).first()).toBeVisible()

    await page.getByLabel('Update status').selectOption('confirmed')
    await page.getByLabel('Confirmation reference').fill('APPT-12345')
    await page.getByRole('button', { name: 'Save status' }).click()
    await expect(page.getByText('Reference: APPT-12345')).toBeVisible()

    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: /Export calendar/ }).click()
    expect((await download).suggestedFilename()).toBe('trippilot-appointments.ics')
  })
})

test.describe('document package', () => {
  test('attaches a PDF to a reservation and builds a combined package', async ({ page }) => {
    await signUp(page)
    await page.goto('/app/bookings')
    await page.getByLabel('Type').selectOption('hotel')
    await page.getByLabel('Title').fill('Hotel Lumiere')
    await page.getByLabel('Start date').fill(inDays(30))
    await page.getByRole('button', { name: 'Add to history' }).click()
    await expect(page.getByText('Hotel Lumiere').first()).toBeVisible()

    await page.getByLabel('Attach document to Hotel Lumiere').setInputFiles({ name: 'reservation.pdf', mimeType: 'application/pdf', buffer: await samplePdf('Reservation') })
    await expect(page.getByRole('link', { name: 'reservation.pdf' })).toBeVisible()

    await page.goto('/app/documents')
    await expect(page.getByText('Hotel reservations').first()).toBeVisible()
    await expect(page.getByText('reservation.pdf')).toBeVisible()
    await page.getByRole('button', { name: 'Build preview' }).click()
    await expect(page.getByText(/Built \d+ pages?/)).toBeVisible()

    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download PDF' }).click()
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/)
  })

  test('rejects a non-PDF file renamed to .pdf', async ({ page }) => {
    await signUp(page)
    await page.goto('/app/bookings')
    await page.getByLabel('Title').fill('Hotel Fake')
    await page.getByLabel('Start date').fill(inDays(30))
    await page.getByRole('button', { name: 'Add to history' }).click()
    await page.getByLabel('Attach document to Hotel Fake').setInputFiles({ name: 'evil.pdf', mimeType: 'application/pdf', buffer: Buffer.from('<script>alert(1)</script>') })
    await expect(page.getByRole('alert').filter({ hasText: /Only PDF, PNG and JPEG/ })).toBeVisible()
  })
})

test.describe('help, legal and translation', () => {
  test('help search filters articles, and legal pages are marked as templates', async ({ page }) => {
    await page.goto('/help')
    await page.getByLabel('Search help').fill('passport')
    await expect(page.getByText('Can I fill my passport details from a photo?')).toBeVisible()
    await page.getByLabel('Search help').fill('zzzzzz')
    await expect(page.getByText(/No articles match/)).toBeVisible()
    await page.goto('/privacy')
    await expect(page.getByText(/Template, not legal advice/)).toBeVisible()
    await page.goto('/terms')
    await expect(page.getByText(/Template, not legal advice/)).toBeVisible()
  })

  test('translation blocks passport-style text before anything is sent', async ({ page }) => {
    await signUp(page)
    await page.goto('/app/translate')
    await page.getByLabel(/Text to translate/).fill('P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<\nL898902C36UTO7408122F1204159ZE184226B<<<<<10')
    await expect(page.getByText(/looks like passport data/).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Translate' })).toBeDisabled()
  })
})
