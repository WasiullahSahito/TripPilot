import { expect, test, type Page } from '@playwright/test'
import { inDays, signUp } from './helpers'

// Real OpenStreetMap-shaped listings, served from a stub so tests never depend on the network.
const directory = {
  listings: [
    { id: 'node/1', name: 'Hotel Lumiere', kind: 'hotel', stars: 4, lat: 48.86, lng: 2.35, distanceKm: 0.6, address: '12 Rue Exemple, Paris', website: 'https://lumiere.example/', phone: null, wifi: true, wheelchair: 'yes', osmUrl: 'https://www.openstreetmap.org/node/1' },
    { id: 'node/2', name: 'Rose Guest House', kind: 'guesthouse', stars: null, lat: 48.87, lng: 2.36, distanceKm: 1.9, address: '9 Rose Lane', website: null, phone: null, wifi: null, wheelchair: null, osmUrl: 'https://www.openstreetmap.org/node/2' },
    { id: 'node/3', name: 'Budget Hostel Nord', kind: 'hostel', stars: 2, lat: 48.88, lng: 2.37, distanceKm: 3.1, address: '', website: null, phone: null, wifi: null, wheelchair: null, osmUrl: 'https://www.openstreetmap.org/node/3' },
  ],
  cached: false,
  source: 'OpenStreetMap contributors',
  notice: 'Real properties from OpenStreetMap. Prices, availability and reviews are not included: check them with a booking partner.',
}

async function stubDirectory(page: Page) {
  await page.route('**/api/hotels/directory**', (route) => route.fulfill({ json: directory }))
}

async function searchHotels(page: Page) {
  await page.goto('/app/hotels')
  await page.getByLabel('Where are you going?').fill('Paris')
  await page.getByLabel('Check-in').fill(inDays(30))
  await page.getByLabel('Check-out').fill(inDays(34))
  await page.getByRole('button', { name: 'Find hotels' }).click()
}

test.describe('hotels: a real directory, honest about prices', () => {
  test('lists real properties with no invented prices and links out to check prices', async ({ page }) => {
    await signUp(page)
    await stubDirectory(page)
    await searchHotels(page)

    await expect(page.getByText('Real listings')).toBeVisible()
    await expect(page.getByText(/Prices, availability and reviews are not included/).first()).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Hotel Lumiere' })).toBeVisible()
    await expect(page.getByText('12 Rue Exemple, Paris')).toBeVisible()
    await expect(page.getByText(/\$\s?\d/)).toHaveCount(0) // no fabricated prices anywhere

    const booking = page.getByRole('link', { name: /Booking\.com/ }).first()
    await expect(booking).toHaveAttribute('href', /booking\.com\/searchresults\.html\?ss=Hotel%20Lumiere%2C%20Paris/)
    await expect(booking).toHaveAttribute('href', new RegExp(`checkin=${inDays(30)}`))
    await expect(page.getByRole('link', { name: /Property website/ })).toHaveAttribute('href', 'https://lumiere.example/')
    await expect(page.getByText(/affiliate links/).first()).toBeVisible()
  })

  test('filters and sorts the listings', async ({ page }) => {
    await signUp(page)
    await stubDirectory(page)
    await searchHotels(page)
    await expect(page.getByText('3 of 3 places')).toBeVisible()

    await page.getByLabel('Search by name or street').fill('rose')
    await expect(page.getByText('1 of 3 places')).toBeVisible()
    await page.getByLabel('Search by name or street').fill('')

    await page.getByLabel('Minimum stars').selectOption('3')
    await expect(page.getByText('1 of 3 places')).toBeVisible()
    await page.getByLabel('Minimum stars').selectOption('0')

    await page.getByLabel('Hostel').check()
    await expect(page.getByRole('heading', { name: 'Budget Hostel Nord' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Hotel Lumiere' })).toHaveCount(0)
  })

  test('shows a readable error when the directory is busy', async ({ page }) => {
    await signUp(page)
    await page.route('**/api/hotels/directory**', (route) => route.fulfill({ status: 503, json: { error: 'The hotel directory is busy. Try again in a minute.' } }))
    await searchHotels(page)
    await expect(page.getByRole('alert').filter({ hasText: /busy/ })).toBeVisible()
  })

  test('clicking a partner leaves a note, and Booking history offers to record it (never as confirmed)', async ({ page, context }) => {
    await signUp(page)
    await stubDirectory(page)
    await context.route(/booking\.com/, (route) => route.fulfill({ body: 'partner site stub' }))
    await searchHotels(page)

    const popup = context.waitForEvent('page')
    await page.getByRole('link', { name: /Booking\.com/ }).first().click()
    await (await popup).close()

    await page.goto('/app/bookings')
    await expect(page.getByText(/You opened Booking\.com to book/)).toBeVisible()
    await page.getByRole('button', { name: 'Record this booking' }).click()
    await expect(page.getByLabel('Title')).toHaveValue('Hotel Lumiere')
    await expect(page.getByLabel('Status')).toHaveValue('requested')
    await expect(page.getByLabel('Start date')).toHaveValue(inDays(30))

    await page.getByRole('button', { name: 'Add to history' }).click()
    await expect(page.getByRole('region', { name: /Requested/ }).getByText('Hotel Lumiere')).toBeVisible()
    await expect(page.getByText('No confirmed reservations recorded.')).toBeVisible()
    await expect(page.getByText(/You opened Booking\.com to book/)).toHaveCount(0)
  })

  test('the handoff can be dismissed', async ({ page, context }) => {
    await signUp(page)
    await stubDirectory(page)
    await context.route(/booking\.com/, (route) => route.fulfill({ body: 'stub' }))
    await searchHotels(page)
    const popup = context.waitForEvent('page')
    await page.getByRole('link', { name: /Booking\.com/ }).first().click()
    await (await popup).close()
    await page.goto('/app/bookings')
    await page.getByRole('button', { name: 'I didn’t book' }).click()
    await expect(page.getByText(/You opened/)).toHaveCount(0)
    await page.reload()
    await expect(page.getByText(/You opened/)).toHaveCount(0)
  })
})

test.describe('flights: partner links only', () => {
  test('without a connected provider it says so and still offers partner searches', async ({ page }) => {
    await signUp(page)
    await page.goto('/app/flights')
    await page.getByLabel('One way').check()
    await page.getByLabel('From').fill('DEL')
    await page.getByLabel('To').fill('CDG')
    await page.getByLabel('Depart').fill(inDays(60))
    await page.getByRole('button', { name: 'Search flights' }).click()

    const partners = page.getByRole('region', { name: /partner|airlines directly/i }).first()
    await expect(partners.getByRole('link', { name: /Skyscanner/ })).toHaveAttribute('href', /skyscanner\.net\/transport\/flights\/del\/cdg\//)
    await expect(partners.getByText(/affiliate links/)).toBeVisible()
    await expect(page.getByText('Demo data')).toHaveCount(0)
  })
})

test.describe('trip budget', () => {
  test('records expenses per currency, compares only USD with the USD trip budget, and deletes', async ({ page }) => {
    await signUp(page)
    await page.getByLabel('Destination').fill('Japan')
    await page.getByLabel('Departure').fill('2027-03-01')
    await page.getByLabel('Return').fill('2027-03-10')
    await page.getByLabel('Budget (optional, USD)').fill('1000')
    await page.getByRole('button', { name: 'Add trip' }).click()
    await expect(page.getByText('Japan').first()).toBeVisible()

    await page.goto('/app/budget')
    await expect(page.getByText('No expenses recorded here yet')).toBeVisible()

    const add = async (fields: { cat: string; amount: string; currency: string; status: string; desc: string }) => {
      await page.getByLabel('Category', { exact: true }).selectOption(fields.cat)
      await page.getByLabel('Description (optional)', { exact: true }).fill(fields.desc)
      await page.getByLabel('Amount', { exact: true }).fill(fields.amount)
      await page.getByLabel('Currency', { exact: true }).selectOption(fields.currency)
      await page.getByLabel('Status', { exact: true }).selectOption(fields.status)
      const tripSelect = page.getByLabel('Trip', { exact: true })
      const value = await tripSelect.locator('option', { hasText: 'Japan' }).first().getAttribute('value')
      await tripSelect.selectOption(value!)
      await page.getByRole('button', { name: 'Add expense' }).click()
      await expect(page.getByText(fields.desc).first()).toBeVisible()
    }

    await add({ cat: 'flights', amount: '600', currency: 'USD', status: 'paid', desc: 'Flights to Tokyo' })
    await add({ cat: 'accommodation', amount: '150.50', currency: 'USD', status: 'estimated', desc: 'Hotel deposit' })
    await add({ cat: 'food', amount: '20000', currency: 'JPY', status: 'estimated', desc: 'Ramen fund' })

    await page.getByLabel('Show', { exact: true }).selectOption({ label: 'Japan (2027-03-01)' })
    const status = page.getByLabel('Trip budget status')
    await expect(status).toContainText('$750.50')
    await expect(status).toContainText('of $1,000.00')
    await expect(status).toContainText('$249.50 left')
    await expect(status).toContainText('$600.00 already paid')
    await expect(status).toContainText(/JPY are not included/)

    await page.getByRole('button', { name: 'JPY' }).click()
    await expect(page.getByText('¥20,000').first()).toBeVisible()

    await page.getByRole('button', { name: /Mark paid for Hotel deposit/ }).click()
    await page.getByRole('button', { name: 'USD' }).click()
    await expect(status).toContainText('$750.50 already paid')

    await page.getByRole('button', { name: 'Delete expense Ramen fund' }).click()
    await expect(page.getByText('Ramen fund')).toHaveCount(0)
  })

  test('validates the form and rejects bad amounts with clear messages', async ({ page }) => {
    await signUp(page)
    await page.goto('/app/budget')
    await page.getByRole('button', { name: 'Add expense' }).click()
    await expect(page.getByText('Enter an amount')).toBeVisible()
    await page.getByLabel('Amount', { exact: true }).fill('12.345')
    await page.getByRole('button', { name: 'Add expense' }).click()
    await expect(page.getByText('Use a positive number with up to 2 decimals')).toBeVisible()
    await page.getByLabel('Amount', { exact: true }).fill('0')
    await page.getByRole('button', { name: 'Add expense' }).click()
    await expect(page.getByText('Amount must be greater than zero')).toBeVisible()
  })

  test('the dashboard shows the recorded budget', async ({ page }) => {
    await signUp(page)
    await page.goto('/app/budget')
    await page.getByLabel('Amount', { exact: true }).fill('80')
    await page.getByLabel('Description (optional)', { exact: true }).fill('Visa fee')
    await page.getByRole('button', { name: 'Add expense' }).click()
    await expect(page.getByText('Visa fee').first()).toBeVisible()
    await page.goto('/app')
    await expect(page.getByText('$80.00').first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open budget' })).toBeVisible()
  })
})
