import { expect, test } from '@playwright/test'
import { PASSWORD, signUp, uniqueEmail } from './helpers'

test.describe('authentication and onboarding', () => {
  test('a new user can sign up, onboard, see a dashboard, log out and log back in', async ({ page }) => {
    const { email } = await signUp(page)
    await expect(page.getByText('Next trip')).toBeVisible()

    await page.getByRole('button', { name: /Log out/ }).click()
    await expect(page).toHaveURL('/')

    await page.goto('/login')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page.getByRole('heading', { name: /^Welcome, / })).toBeVisible()
  })

  test('protected pages redirect to login when signed out', async ({ page }) => {
    await page.goto('/app/visa')
    await expect(page).toHaveURL(/\/login/)
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/login/)
  })

  test('rejects weak passwords and wrong credentials with clear messages', async ({ page }) => {
    await page.goto('/signup')
    await page.getByLabel('Full name').fill('Weak Person')
    await page.getByLabel('Email').fill(uniqueEmail())
    await page.getByLabel('Password').fill('short')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByText('Use at least 10 characters')).toBeVisible()

    await page.getByLabel('Password').fill('password1234')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByRole('alert').filter({ hasText: /common/i })).toBeVisible()

    await page.goto('/login')
    await page.getByLabel('Email').fill('nobody@example.com')
    await page.getByLabel('Password').fill('whatever-password')
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page.getByText('Incorrect email or password')).toBeVisible()
  })

  test('a non-admin cannot open the admin page', async ({ page }) => {
    await signUp(page)
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/app$/)
  })

  test('trips can be created, updated and deleted from the dashboard', async ({ page }) => {
    await signUp(page)
    await page.getByLabel('Destination').fill('Japan')
    await page.getByLabel('Departure').fill('2027-03-01')
    await page.getByLabel('Return').fill('2027-03-10')
    await page.getByRole('button', { name: 'Add trip' }).click()
    await expect(page.getByRole('paragraph').filter({ hasText: /^Japan$/ }).first()).toBeVisible()
    await page.getByLabel('Status for Japan').selectOption('ready')
    await expect(page.getByLabel('Status for Japan')).toHaveValue('ready')
    await page.getByRole('button', { name: 'Delete trip to Japan' }).click()
    await expect(page.getByText('No upcoming trip yet.')).toBeVisible()
  })

  test('data export and account deletion work', async ({ page }) => {
    const { email } = await signUp(page)
    await page.goto('/app/profile')
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export my data' }).click()
    expect((await download).suggestedFilename()).toMatch(/\.json$/)

    await page.getByRole('button', { name: 'Delete account' }).click()
    await page.getByRole('button', { name: /Yes, delete permanently/ }).click()
    await expect(page).toHaveURL('/')
    await page.goto('/login')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page.getByText('Incorrect email or password')).toBeVisible()
  })
})
