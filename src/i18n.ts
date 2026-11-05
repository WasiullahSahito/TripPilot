import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

const LANGUAGES = ['en', 'ar', 'fr', 'es', 'de', 'ru', 'tr', 'hi', 'zh', 'ja'] as const
export const LANGUAGE_LABELS: Record<Language, string> = {
  en: 'English',
  ar: 'العربية',
  fr: 'Français',
  es: 'Español',
  de: 'Deutsch',
  ru: 'Русский',
  tr: 'Türkçe',
  hi: 'हिन्दी',
  zh: '简体中文',
  ja: '日本語',
}
type Language = (typeof LANGUAGES)[number]
// v2: older builds auto-saved "en" on every load, which would wrongly override device detection
const LANGUAGE_KEY = 'trippilot-language-v2'

const resources = {
  en: {
    translation: {
      navigation: {
        dashboard: 'Dashboard',
        visa: 'Visa',
        flights: 'Flights',
        hotels: 'Hotels',
        insurance: 'Insurance',
        map: 'Map',
        appointments: 'Appointments',
        documents: 'Documents',
        bookings: 'Bookings',
        extras: 'Extras',
        translate: 'Translate',
        assistant: 'Assistant',
        notifications: 'Notifications', budget: 'Budget',
        settings: 'Settings',
        logout: 'Log out',
        label: 'Main navigation',
      },
      settings: {
        eyebrow: 'Manage your account',
        title: 'Settings',
        description: 'Update your account, travel preferences, security and personal data.',
        languageTitle: 'Language',
        languageDescription: 'Choose the language used for supported parts of the app.',
        languageLabel: 'App language',
        english: 'English',
        arabic: 'Arabic',
        account: 'Account details',
        emailNote: 'Your email address is used to sign in and cannot be changed here.',
        name: 'Name',
        email: 'Email address',
        saveName: 'Save name',
        preferences: 'Travel preferences',
        preferencesDescription: 'These details help prefill travel planning and visa preparation.',
        nationality: 'Nationality',
        residence: 'Country of residence',
        airport: 'Home airport or city (optional)',
        interests: 'Interests',
        savePreferences: 'Save travel preferences',
        security: 'Password & security',
        passwordDescription: 'Enter your current password to set a new one. Use at least 10 characters.',
        currentPassword: 'Current password',
        newPassword: 'New password',
        confirmPassword: 'Confirm new password',
        changePassword: 'Change password',
        data: 'Your data',
        dataDescription: 'Download the data we hold or permanently delete your account and travel records.',
        export: 'Export my data',
        delete: 'Delete account',
        confirmDelete: 'Yes, delete permanently',
        cancel: 'Cancel',
        nameSaved: 'Your name has been updated.',
        preferencesSaved: 'Your travel preferences have been saved.',
        passwordChanged: 'Your password has been changed.',
        nameRequired: 'Enter your name',
        nationalityRequired: 'Enter your nationality',
        residenceRequired: 'Enter your country of residence',
        currentPasswordRequired: 'Enter your current password',
        passwordMin: 'Password must be at least 10 characters',
        confirmRequired: 'Confirm your new password',
        passwordMismatch: 'Passwords do not match',
        exportFailed: 'Export failed.',
        deleteFailed: 'Deletion failed.',
        nameFailed: 'Could not update your name.',
        preferencesFailed: 'Could not save your preferences.',
        passwordFailed: 'Could not change your password.',
      },
    },
  },
  ar: {
    translation: {
      navigation: {
        dashboard: 'لوحة التحكم',
        visa: 'التأشيرة',
        flights: 'الرحلات الجوية',
        hotels: 'الفنادق',
        insurance: 'التأمين',
        map: 'الخريطة',
        appointments: 'المواعيد',
        documents: 'المستندات',
        bookings: 'الحجوزات',
        extras: 'إضافات الرحلة',
        translate: 'الترجمة',
        assistant: 'المساعد',
        notifications: 'الإشعارات', budget: 'الميزانية',
        settings: 'الإعدادات',
        logout: 'تسجيل الخروج',
        label: 'التنقل الرئيسي',
      },
      settings: {
        eyebrow: 'إدارة حسابك',
        title: 'الإعدادات',
        description: 'حدّث حسابك وتفضيلات السفر والأمان والبيانات الشخصية.',
        languageTitle: 'اللغة',
        languageDescription: 'اختر اللغة للأجزاء المدعومة من التطبيق.',
        languageLabel: 'لغة التطبيق',
        english: 'الإنجليزية',
        arabic: 'العربية',
        account: 'تفاصيل الحساب',
        emailNote: 'يُستخدم بريدك الإلكتروني لتسجيل الدخول ولا يمكن تغييره هنا.',
        name: 'الاسم',
        email: 'البريد الإلكتروني',
        saveName: 'حفظ الاسم',
        preferences: 'تفضيلات السفر',
        preferencesDescription: 'تساعد هذه المعلومات في تعبئة تخطيط السفر والتحضير للتأشيرة.',
        nationality: 'الجنسية',
        residence: 'بلد الإقامة',
        airport: 'مطار أو مدينة المغادرة (اختياري)',
        interests: 'الاهتمامات',
        savePreferences: 'حفظ تفضيلات السفر',
        security: 'كلمة المرور والأمان',
        passwordDescription: 'أدخل كلمة المرور الحالية لتعيين كلمة مرور جديدة. استخدم 10 أحرف على الأقل.',
        currentPassword: 'كلمة المرور الحالية',
        newPassword: 'كلمة المرور الجديدة',
        confirmPassword: 'تأكيد كلمة المرور الجديدة',
        changePassword: 'تغيير كلمة المرور',
        data: 'بياناتك',
        dataDescription: 'نزّل البيانات المحفوظة أو احذف حسابك وسجلات سفرك نهائيًا.',
        export: 'تصدير بياناتي',
        delete: 'حذف الحساب',
        confirmDelete: 'نعم، احذف نهائيًا',
        cancel: 'إلغاء',
        nameSaved: 'تم تحديث اسمك.',
        preferencesSaved: 'تم حفظ تفضيلات السفر.',
        passwordChanged: 'تم تغيير كلمة المرور.',
        nameRequired: 'أدخل اسمك',
        nationalityRequired: 'أدخل جنسيتك',
        residenceRequired: 'أدخل بلد إقامتك',
        currentPasswordRequired: 'أدخل كلمة المرور الحالية',
        passwordMin: 'يجب أن تتكون كلمة المرور من 10 أحرف على الأقل',
        confirmRequired: 'أكد كلمة المرور الجديدة',
        passwordMismatch: 'كلمتا المرور غير متطابقتين',
        exportFailed: 'تعذر تصدير البيانات.',
        deleteFailed: 'تعذر حذف الحساب.',
        nameFailed: 'تعذر تحديث الاسم.',
        preferencesFailed: 'تعذر حفظ التفضيلات.',
        passwordFailed: 'تعذر تغيير كلمة المرور.',
      },
    },
  },
  fr: {
    translation: {
      navigation: {
        dashboard: 'Tableau de bord', visa: 'Visa', flights: 'Vols', hotels: 'Hôtels', insurance: 'Assurance',
        map: 'Carte', appointments: 'Rendez-vous', documents: 'Documents', bookings: 'Réservations',
        extras: 'Extras', translate: 'Traduction', assistant: 'Assistant', notifications: 'Notifications', budget: 'Budget',
        settings: 'Paramètres', logout: 'Déconnexion', label: 'Navigation principale',
      },
      settings: {
        eyebrow: 'Gérer votre compte', title: 'Paramètres', description: 'Gérez votre compte, vos préférences de voyage, votre sécurité et vos données personnelles.',
        languageTitle: 'Langue', languageDescription: 'Choisissez la langue utilisée dans les parties traduites de l’application.', languageLabel: 'Langue de l’application',
        english: 'Anglais', arabic: 'Arabe', account: 'Détails du compte', emailNote: 'Votre adresse e-mail sert à vous connecter et ne peut pas être modifiée ici.',
        name: 'Nom', email: 'Adresse e-mail', saveName: 'Enregistrer le nom', preferences: 'Préférences de voyage',
        preferencesDescription: 'Ces informations facilitent la préparation de vos voyages et demandes de visa.',
        nationality: 'Nationalité', residence: 'Pays de résidence', airport: 'Aéroport ou ville de départ (facultatif)',
        interests: 'Centres d’intérêt', savePreferences: 'Enregistrer les préférences', security: 'Mot de passe et sécurité',
        passwordDescription: 'Saisissez votre mot de passe actuel pour en définir un nouveau. 10 caractères minimum.',
        currentPassword: 'Mot de passe actuel', newPassword: 'Nouveau mot de passe', confirmPassword: 'Confirmer le nouveau mot de passe',
        changePassword: 'Changer le mot de passe', data: 'Vos données', dataDescription: 'Téléchargez vos données ou supprimez définitivement votre compte et vos voyages.',
        export: 'Exporter mes données', delete: 'Supprimer le compte', confirmDelete: 'Oui, supprimer définitivement', cancel: 'Annuler',
        nameSaved: 'Votre nom a été mis à jour.', preferencesSaved: 'Vos préférences de voyage ont été enregistrées.',
        passwordChanged: 'Votre mot de passe a été changé.', nameRequired: 'Saisissez votre nom', nationalityRequired: 'Saisissez votre nationalité',
        residenceRequired: 'Saisissez votre pays de résidence', currentPasswordRequired: 'Saisissez votre mot de passe actuel',
        passwordMin: 'Le mot de passe doit contenir au moins 10 caractères', confirmRequired: 'Confirmez votre nouveau mot de passe',
        passwordMismatch: 'Les mots de passe ne correspondent pas', exportFailed: 'Échec de l’exportation.', deleteFailed: 'Échec de la suppression.',
        nameFailed: 'Impossible de mettre à jour votre nom.', preferencesFailed: 'Impossible d’enregistrer vos préférences.',
        passwordFailed: 'Impossible de changer votre mot de passe.',
      },
    },
  },
  es: {
    translation: {
      navigation: {
        dashboard: 'Panel', visa: 'Visado', flights: 'Vuelos', hotels: 'Hoteles', insurance: 'Seguro',
        map: 'Mapa', appointments: 'Citas', documents: 'Documentos', bookings: 'Reservas',
        extras: 'Extras', translate: 'Traducir', assistant: 'Asistente', notifications: 'Notificaciones', budget: 'Presupuesto',
        settings: 'Configuración', logout: 'Cerrar sesión', label: 'Navegación principal',
      },
      settings: {
        eyebrow: 'Gestiona tu cuenta', title: 'Configuración', description: 'Actualiza tu cuenta, preferencias de viaje, seguridad y datos personales.',
        languageTitle: 'Idioma', languageDescription: 'Elige el idioma de las secciones traducidas de la aplicación.', languageLabel: 'Idioma de la aplicación',
        english: 'Inglés', arabic: 'Árabe', account: 'Datos de la cuenta', emailNote: 'Tu correo se utiliza para iniciar sesión y no se puede cambiar aquí.',
        name: 'Nombre', email: 'Correo electrónico', saveName: 'Guardar nombre', preferences: 'Preferencias de viaje',
        preferencesDescription: 'Estos datos ayudan a preparar tus viajes y solicitudes de visado.',
        nationality: 'Nacionalidad', residence: 'País de residencia', airport: 'Aeropuerto o ciudad de origen (opcional)',
        interests: 'Intereses', savePreferences: 'Guardar preferencias', security: 'Contraseña y seguridad',
        passwordDescription: 'Introduce tu contraseña actual para establecer una nueva. Usa al menos 10 caracteres.',
        currentPassword: 'Contraseña actual', newPassword: 'Nueva contraseña', confirmPassword: 'Confirmar nueva contraseña',
        changePassword: 'Cambiar contraseña', data: 'Tus datos', dataDescription: 'Descarga los datos que guardamos o elimina permanentemente tu cuenta y viajes.',
        export: 'Exportar mis datos', delete: 'Eliminar cuenta', confirmDelete: 'Sí, eliminar permanentemente', cancel: 'Cancelar',
        nameSaved: 'Tu nombre se ha actualizado.', preferencesSaved: 'Se han guardado tus preferencias de viaje.',
        passwordChanged: 'Se ha cambiado tu contraseña.', nameRequired: 'Introduce tu nombre', nationalityRequired: 'Introduce tu nacionalidad',
        residenceRequired: 'Introduce tu país de residencia', currentPasswordRequired: 'Introduce tu contraseña actual',
        passwordMin: 'La contraseña debe tener al menos 10 caracteres', confirmRequired: 'Confirma la nueva contraseña',
        passwordMismatch: 'Las contraseñas no coinciden', exportFailed: 'No se pudieron exportar los datos.',
        deleteFailed: 'No se pudo eliminar la cuenta.', nameFailed: 'No se pudo actualizar el nombre.',
        preferencesFailed: 'No se pudieron guardar las preferencias.', passwordFailed: 'No se pudo cambiar la contraseña.',
      },
    },
  },
  de: {
    translation: {
      navigation: {
        dashboard: 'Übersicht', visa: 'Visum', flights: 'Flüge', hotels: 'Hotels', insurance: 'Versicherung',
        map: 'Karte', appointments: 'Termine', documents: 'Dokumente', bookings: 'Buchungen',
        extras: 'Extras', translate: 'Übersetzen', assistant: 'Assistent', notifications: 'Benachrichtigungen', budget: 'Budget',
        settings: 'Einstellungen', logout: 'Abmelden', label: 'Hauptnavigation',
      },
      settings: {
        eyebrow: 'Konto verwalten', title: 'Einstellungen', description: 'Verwalte dein Konto, Reisevorlieben, Sicherheit und persönliche Daten.',
        languageTitle: 'Sprache', languageDescription: 'Wähle die Sprache für die übersetzten Bereiche der App.', languageLabel: 'App-Sprache',
        english: 'Englisch', arabic: 'Arabisch', account: 'Kontodaten', emailNote: 'Deine E-Mail-Adresse dient zur Anmeldung und kann hier nicht geändert werden.',
        name: 'Name', email: 'E-Mail-Adresse', saveName: 'Namen speichern', preferences: 'Reisevorlieben',
        preferencesDescription: 'Diese Angaben helfen bei der Reiseplanung und Visumvorbereitung.',
        nationality: 'Staatsangehörigkeit', residence: 'Wohnsitzland', airport: 'Heimatflughafen oder Stadt (optional)',
        interests: 'Interessen', savePreferences: 'Reisevorlieben speichern', security: 'Passwort und Sicherheit',
        passwordDescription: 'Gib dein aktuelles Passwort ein, um ein neues festzulegen. Mindestens 10 Zeichen.',
        currentPassword: 'Aktuelles Passwort', newPassword: 'Neues Passwort', confirmPassword: 'Neues Passwort bestätigen',
        changePassword: 'Passwort ändern', data: 'Deine Daten', dataDescription: 'Lade deine gespeicherten Daten herunter oder lösche dein Konto und deine Reisen dauerhaft.',
        export: 'Meine Daten exportieren', delete: 'Konto löschen', confirmDelete: 'Ja, dauerhaft löschen', cancel: 'Abbrechen',
        nameSaved: 'Dein Name wurde aktualisiert.', preferencesSaved: 'Deine Reisevorlieben wurden gespeichert.',
        passwordChanged: 'Dein Passwort wurde geändert.', nameRequired: 'Gib deinen Namen ein', nationalityRequired: 'Gib deine Staatsangehörigkeit ein',
        residenceRequired: 'Gib dein Wohnsitzland ein', currentPasswordRequired: 'Gib dein aktuelles Passwort ein',
        passwordMin: 'Das Passwort muss mindestens 10 Zeichen lang sein', confirmRequired: 'Bestätige dein neues Passwort',
        passwordMismatch: 'Die Passwörter stimmen nicht überein', exportFailed: 'Export fehlgeschlagen.', deleteFailed: 'Löschen fehlgeschlagen.',
        nameFailed: 'Der Name konnte nicht aktualisiert werden.', preferencesFailed: 'Die Vorlieben konnten nicht gespeichert werden.',
        passwordFailed: 'Das Passwort konnte nicht geändert werden.',
      },
    },
  },
  ru: {
    translation: {
      navigation: {
        dashboard: 'Панель управления', visa: 'Виза', flights: 'Авиабилеты', hotels: 'Отели', insurance: 'Страхование',
        map: 'Карта', appointments: 'Записи', documents: 'Документы', bookings: 'Бронирования',
        extras: 'Дополнительно', translate: 'Перевод', assistant: 'Помощник', notifications: 'Уведомления', budget: 'Бюджет',
        settings: 'Настройки', logout: 'Выйти', label: 'Главная навигация',
      },
      settings: {
        eyebrow: 'Управление аккаунтом', title: 'Настройки', description: 'Изменяйте данные аккаунта, предпочтения поездок, безопасность и личные данные.',
        languageTitle: 'Язык', languageDescription: 'Выберите язык для переведённых разделов приложения.', languageLabel: 'Язык приложения',
        english: 'Английский', arabic: 'Арабский', account: 'Данные аккаунта', emailNote: 'Электронная почта используется для входа и не меняется здесь.',
        name: 'Имя', email: 'Электронная почта', saveName: 'Сохранить имя', preferences: 'Предпочтения поездок',
        preferencesDescription: 'Эти данные помогают планировать поездки и готовить документы на визу.',
        nationality: 'Гражданство', residence: 'Страна проживания', airport: 'Домашний аэропорт или город (необязательно)',
        interests: 'Интересы', savePreferences: 'Сохранить предпочтения', security: 'Пароль и безопасность',
        passwordDescription: 'Введите текущий пароль, чтобы задать новый. Не менее 10 символов.',
        currentPassword: 'Текущий пароль', newPassword: 'Новый пароль', confirmPassword: 'Подтвердите новый пароль',
        changePassword: 'Изменить пароль', data: 'Ваши данные', dataDescription: 'Скачайте сохранённые данные или удалите аккаунт и поездки навсегда.',
        export: 'Экспортировать данные', delete: 'Удалить аккаунт', confirmDelete: 'Да, удалить навсегда', cancel: 'Отмена',
        nameSaved: 'Имя обновлено.', preferencesSaved: 'Предпочтения поездок сохранены.',
        passwordChanged: 'Пароль изменён.', nameRequired: 'Введите имя', nationalityRequired: 'Введите гражданство',
        residenceRequired: 'Введите страну проживания', currentPasswordRequired: 'Введите текущий пароль',
        passwordMin: 'Пароль должен содержать не менее 10 символов', confirmRequired: 'Подтвердите новый пароль',
        passwordMismatch: 'Пароли не совпадают', exportFailed: 'Не удалось экспортировать данные.',
        deleteFailed: 'Не удалось удалить аккаунт.', nameFailed: 'Не удалось обновить имя.',
        preferencesFailed: 'Не удалось сохранить предпочтения.', passwordFailed: 'Не удалось изменить пароль.',
      },
    },
  },
  tr: {
    translation: {
      navigation: {
        dashboard: 'Kontrol paneli', visa: 'Vize', flights: 'Uçuşlar', hotels: 'Oteller', insurance: 'Sigorta',
        map: 'Harita', appointments: 'Randevular', documents: 'Belgeler', bookings: 'Rezervasyonlar',
        extras: 'Ek hizmetler', translate: 'Çeviri', assistant: 'Asistan', notifications: 'Bildirimler', budget: 'Bütçe',
        settings: 'Ayarlar', logout: 'Çıkış yap', label: 'Ana gezinme',
      },
      settings: {
        eyebrow: 'Hesabınızı yönetin', title: 'Ayarlar', description: 'Hesabınızı, seyahat tercihlerinizi, güvenliğinizi ve kişisel verilerinizi yönetin.',
        languageTitle: 'Dil', languageDescription: 'Uygulamanın çevrilmiş bölümleri için dili seçin.', languageLabel: 'Uygulama dili',
        english: 'İngilizce', arabic: 'Arapça', account: 'Hesap bilgileri', emailNote: 'E-posta adresiniz giriş için kullanılır ve buradan değiştirilemez.',
        name: 'Ad', email: 'E-posta adresi', saveName: 'Adı kaydet', preferences: 'Seyahat tercihleri',
        preferencesDescription: 'Bu bilgiler seyahat planlamanızı ve vize hazırlığınızı kolaylaştırır.',
        nationality: 'Uyruk', residence: 'İkamet edilen ülke', airport: 'Ana havalimanı veya şehir (isteğe bağlı)',
        interests: 'İlgi alanları', savePreferences: 'Seyahat tercihlerini kaydet', security: 'Parola ve güvenlik',
        passwordDescription: 'Yeni parola belirlemek için mevcut parolanızı girin. En az 10 karakter kullanın.',
        currentPassword: 'Mevcut parola', newPassword: 'Yeni parola', confirmPassword: 'Yeni parolayı onaylayın',
        changePassword: 'Parolayı değiştir', data: 'Verileriniz', dataDescription: 'Saklanan verilerinizi indirin veya hesabınızı ve seyahat kayıtlarınızı kalıcı olarak silin.',
        export: 'Verilerimi dışa aktar', delete: 'Hesabı sil', confirmDelete: 'Evet, kalıcı olarak sil', cancel: 'İptal',
        nameSaved: 'Adınız güncellendi.', preferencesSaved: 'Seyahat tercihleriniz kaydedildi.',
        passwordChanged: 'Parolanız değiştirildi.', nameRequired: 'Adınızı girin', nationalityRequired: 'Uyruğunuzu girin',
        residenceRequired: 'İkamet ettiğiniz ülkeyi girin', currentPasswordRequired: 'Mevcut parolanızı girin',
        passwordMin: 'Parola en az 10 karakter olmalıdır', confirmRequired: 'Yeni parolanızı onaylayın',
        passwordMismatch: 'Parolalar eşleşmiyor', exportFailed: 'Veriler dışa aktarılamadı.', deleteFailed: 'Hesap silinemedi.',
        nameFailed: 'Adınız güncellenemedi.', preferencesFailed: 'Tercihleriniz kaydedilemedi.',
        passwordFailed: 'Parolanız değiştirilemedi.',
      },
    },
  },
  hi: {
    translation: {
      navigation: {
        dashboard: 'डैशबोर्ड', visa: 'वीज़ा', flights: 'उड़ानें', hotels: 'होटल', insurance: 'बीमा',
        map: 'मानचित्र', appointments: 'अपॉइंटमेंट', documents: 'दस्तावेज़', bookings: 'बुकिंग',
        extras: 'अतिरिक्त', translate: 'अनुवाद', assistant: 'सहायक', notifications: 'सूचनाएँ', budget: 'बजट',
        settings: 'सेटिंग्स', logout: 'लॉग आउट', label: 'मुख्य नेविगेशन',
      },
      settings: {
        eyebrow: 'अपना खाता प्रबंधित करें', title: 'सेटिंग्स', description: 'खाता, यात्रा प्राथमिकताएँ, सुरक्षा और निजी जानकारी अपडेट करें।',
        languageTitle: 'भाषा', languageDescription: 'ऐप के अनुवादित हिस्सों के लिए भाषा चुनें।', languageLabel: 'ऐप की भाषा',
        english: 'अंग्रेज़ी', arabic: 'अरबी', account: 'खाते का विवरण', emailNote: 'ईमेल पते का उपयोग साइन इन के लिए होता है और इसे यहाँ बदला नहीं जा सकता।',
        name: 'नाम', email: 'ईमेल पता', saveName: 'नाम सहेजें', preferences: 'यात्रा प्राथमिकताएँ',
        preferencesDescription: 'ये जानकारी यात्रा योजना और वीज़ा तैयारी में मदद करती है।',
        nationality: 'राष्ट्रीयता', residence: 'निवास का देश', airport: 'घरेलू हवाई अड्डा या शहर (वैकल्पिक)',
        interests: 'रुचियाँ', savePreferences: 'यात्रा प्राथमिकताएँ सहेजें', security: 'पासवर्ड और सुरक्षा',
        passwordDescription: 'नया पासवर्ड बनाने के लिए वर्तमान पासवर्ड दर्ज करें। कम से कम 10 अक्षर रखें।',
        currentPassword: 'वर्तमान पासवर्ड', newPassword: 'नया पासवर्ड', confirmPassword: 'नए पासवर्ड की पुष्टि करें',
        changePassword: 'पासवर्ड बदलें', data: 'आपका डेटा', dataDescription: 'सहेजा गया डेटा डाउनलोड करें या अपना खाता और यात्रा रिकॉर्ड स्थायी रूप से हटाएँ।',
        export: 'मेरा डेटा निर्यात करें', delete: 'खाता हटाएँ', confirmDelete: 'हाँ, स्थायी रूप से हटाएँ', cancel: 'रद्द करें',
        nameSaved: 'आपका नाम अपडेट हो गया है।', preferencesSaved: 'आपकी यात्रा प्राथमिकताएँ सहेज ली गई हैं।',
        passwordChanged: 'आपका पासवर्ड बदल दिया गया है।', nameRequired: 'अपना नाम दर्ज करें', nationalityRequired: 'अपनी राष्ट्रीयता दर्ज करें',
        residenceRequired: 'अपने निवास का देश दर्ज करें', currentPasswordRequired: 'वर्तमान पासवर्ड दर्ज करें',
        passwordMin: 'पासवर्ड कम से कम 10 अक्षरों का होना चाहिए', confirmRequired: 'नए पासवर्ड की पुष्टि करें',
        passwordMismatch: 'पासवर्ड मेल नहीं खाते', exportFailed: 'डेटा निर्यात नहीं हो सका।', deleteFailed: 'खाता हटाया नहीं जा सका।',
        nameFailed: 'नाम अपडेट नहीं हो सका।', preferencesFailed: 'प्राथमिकताएँ सहेजी नहीं जा सकीं।',
        passwordFailed: 'पासवर्ड बदला नहीं जा सका।',
      },
    },
  },
  zh: {
    translation: {
      navigation: {
        dashboard: '仪表板', visa: '签证', flights: '航班', hotels: '酒店', insurance: '保险',
        map: '地图', appointments: '预约', documents: '文件', bookings: '预订',
        extras: '旅行服务', translate: '翻译', assistant: '助手', notifications: '通知', budget: '预算',
        settings: '设置', logout: '退出登录', label: '主导航',
      },
      settings: {
        eyebrow: '管理您的账户', title: '设置', description: '管理账户、旅行偏好、安全和个人资料。',
        languageTitle: '语言', languageDescription: '选择应用已翻译部分使用的语言。', languageLabel: '应用语言',
        english: '英语', arabic: '阿拉伯语', account: '账户信息', emailNote: '电子邮箱用于登录，无法在此更改。',
        name: '姓名', email: '电子邮箱', saveName: '保存姓名', preferences: '旅行偏好',
        preferencesDescription: '这些信息有助于旅行规划和签证准备。',
        nationality: '国籍', residence: '居住国家', airport: '常用机场或城市（可选）',
        interests: '兴趣', savePreferences: '保存旅行偏好', security: '密码与安全',
        passwordDescription: '输入当前密码以设置新密码。新密码至少需要 10 个字符。',
        currentPassword: '当前密码', newPassword: '新密码', confirmPassword: '确认新密码',
        changePassword: '更改密码', data: '您的数据', dataDescription: '下载我们保存的数据，或永久删除账户和旅行记录。',
        export: '导出我的数据', delete: '删除账户', confirmDelete: '是，永久删除', cancel: '取消',
        nameSaved: '姓名已更新。', preferencesSaved: '旅行偏好已保存。',
        passwordChanged: '密码已更改。', nameRequired: '请输入姓名', nationalityRequired: '请输入国籍',
        residenceRequired: '请输入居住国家', currentPasswordRequired: '请输入当前密码',
        passwordMin: '密码至少需要 10 个字符', confirmRequired: '请确认新密码',
        passwordMismatch: '两次输入的密码不一致', exportFailed: '导出失败。', deleteFailed: '删除失败。',
        nameFailed: '无法更新姓名。', preferencesFailed: '无法保存偏好设置。',
        passwordFailed: '无法更改密码。',
      },
    },
  },
  ja: {
    translation: {
      navigation: {
        dashboard: 'ダッシュボード', visa: 'ビザ', flights: 'フライト', hotels: 'ホテル', insurance: '保険',
        map: '地図', appointments: '予約予定', documents: '書類', bookings: '予約',
        extras: '旅行オプション', translate: '翻訳', assistant: 'アシスタント', notifications: '通知', budget: '予算',
        settings: '設定', logout: 'ログアウト', label: 'メインナビゲーション',
      },
      settings: {
        eyebrow: 'アカウント管理', title: '設定', description: 'アカウント、旅行の設定、セキュリティ、個人情報を管理します。',
        languageTitle: '言語', languageDescription: 'アプリの翻訳対応部分で使用する言語を選択します。', languageLabel: 'アプリの言語',
        english: '英語', arabic: 'アラビア語', account: 'アカウント情報', emailNote: 'メールアドレスはログインに使用され、ここでは変更できません。',
        name: '名前', email: 'メールアドレス', saveName: '名前を保存', preferences: '旅行の設定',
        preferencesDescription: '旅行計画やビザの準備に役立つ情報です。',
        nationality: '国籍', residence: '居住国', airport: '利用空港または都市（任意）',
        interests: '興味・関心', savePreferences: '旅行の設定を保存', security: 'パスワードとセキュリティ',
        passwordDescription: '新しいパスワードを設定するには現在のパスワードを入力してください。10文字以上が必要です。',
        currentPassword: '現在のパスワード', newPassword: '新しいパスワード', confirmPassword: '新しいパスワードを確認',
        changePassword: 'パスワードを変更', data: 'データ', dataDescription: '保存されたデータをダウンロードするか、アカウントと旅行記録を完全に削除できます。',
        export: 'データをエクスポート', delete: 'アカウントを削除', confirmDelete: '完全に削除する', cancel: 'キャンセル',
        nameSaved: '名前を更新しました。', preferencesSaved: '旅行の設定を保存しました。',
        passwordChanged: 'パスワードを変更しました。', nameRequired: '名前を入力してください', nationalityRequired: '国籍を入力してください',
        residenceRequired: '居住国を入力してください', currentPasswordRequired: '現在のパスワードを入力してください',
        passwordMin: 'パスワードは10文字以上にしてください', confirmRequired: '新しいパスワードを確認してください',
        passwordMismatch: 'パスワードが一致しません', exportFailed: 'エクスポートに失敗しました。', deleteFailed: '削除に失敗しました。',
        nameFailed: '名前を更新できませんでした。', preferencesFailed: '設定を保存できませんでした。',
        passwordFailed: 'パスワードを変更できませんでした。',
      },
    },
  },
} as const

/** First supported language in the device's preference list ("fr-CA" -> fr, "zh-Hans-CN" -> zh), or null. */
export function detectDeviceLanguage(preferred: readonly string[]): Language | null {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split('-')[0]
    if (LANGUAGES.includes(base as Language)) return base as Language
  }
  return null
}

/** A language the person chose in Settings wins; otherwise follow the phone/browser language; otherwise English. */
function getInitialLanguage(): Language {
  const saved = window.localStorage.getItem(LANGUAGE_KEY)
  if (saved && LANGUAGES.includes(saved as Language)) return saved as Language
  const preferred = navigator.languages?.length ? navigator.languages : [navigator.language]
  return detectDeviceLanguage(preferred.filter(Boolean)) ?? 'en'
}

function applyDocumentLanguage(language: string) {
  const supported = LANGUAGES.includes(language as Language) ? language : 'en'
  document.documentElement.lang = supported
  document.documentElement.dir = supported === 'ar' ? 'rtl' : 'ltr'
}

/** Only an explicit change is remembered, so an auto-detected language keeps following the device until the person picks one. */
let started = false
function rememberLanguage(language: string) {
  applyDocumentLanguage(language)
  if (!started) return // i18next announces the initial language while starting up; that is not a choice
  window.localStorage.setItem(LANGUAGE_KEY, LANGUAGES.includes(language as Language) ? language : 'en')
}

void i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: getInitialLanguage(),
    fallbackLng: 'en',
    supportedLngs: [...LANGUAGES],
    interpolation: { escapeValue: false },
    returnNull: false,
  })
  .then(() => {
    started = true
  })

i18n.on('languageChanged', rememberLanguage)
applyDocumentLanguage(i18n.language)

export default i18n
export { LANGUAGES, LANGUAGE_KEY }
