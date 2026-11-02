import i18n, { LANGUAGE_KEY } from './i18n'

describe('application internationalization', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en')
    window.localStorage.removeItem(LANGUAGE_KEY)
  })

  it('provides translated English and Arabic navigation and settings labels', async () => {
    await i18n.changeLanguage('en')
    expect(i18n.t('navigation.dashboard')).toBe('Dashboard')
    expect(i18n.t('settings.title')).toBe('Settings')

    await i18n.changeLanguage('ar')
    expect(i18n.t('navigation.dashboard')).toBe('لوحة التحكم')
    expect(i18n.t('settings.title')).toBe('الإعدادات')
  })

  it.each([
    ['fr', 'Paramètres', 'Tableau de bord'],
    ['es', 'Configuración', 'Panel'],
    ['de', 'Einstellungen', 'Übersicht'],
    ['ru', 'Настройки', 'Панель управления'],
    ['tr', 'Ayarlar', 'Kontrol paneli'],
    ['hi', 'सेटिंग्स', 'डैशबोर्ड'],
    ['zh', '设置', '仪表板'],
    ['ja', '設定', 'ダッシュボード'],
  ])('loads translated settings and navigation for %s', async (language, settings, dashboard) => {
    await i18n.changeLanguage(language)
    expect(i18n.t('settings.title')).toBe(settings)
    expect(i18n.t('navigation.dashboard')).toBe(dashboard)
    expect(i18n.language).toBe(language)
  })

  it('persists language changes and updates page language and text direction', async () => {
    await i18n.changeLanguage('ar')
    expect(window.localStorage.getItem(LANGUAGE_KEY)).toBe('ar')
    expect(document.documentElement.lang).toBe('ar')
    expect(document.documentElement.dir).toBe('rtl')

    await i18n.changeLanguage('en')
    expect(window.localStorage.getItem(LANGUAGE_KEY)).toBe('en')
    expect(document.documentElement.lang).toBe('en')
    expect(document.documentElement.dir).toBe('ltr')
  })

  it('uses left-to-right layout for non-Arabic languages', async () => {
    for (const language of ['fr', 'es', 'de', 'ru', 'tr', 'hi', 'zh', 'ja']) {
      await i18n.changeLanguage(language)
      expect(document.documentElement.lang).toBe(language)
      expect(document.documentElement.dir).toBe('ltr')
    }
  })
})
