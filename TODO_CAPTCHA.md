# TODO: Добавление CAPTCHA для защиты от брутфорса

## Задача
Добавить защиту от автоматических атак и перебора паролей (brute-force) на странице входа в систему.

## Варианты реализации

### Вариант 1: Google reCAPTCHA v3
- Невидимая проверка, не требует действий от пользователя
- Автоматически анализирует поведение
- Требует API ключи от Google

### Вариант 2: hCaptcha
- Альтернатива reCAPTCHA
- Более приватный вариант
- Требует API ключи

### Вариант 3: Кастомная защита на бэкенде
- Rate limiting (ограничение попыток входа)
- Блокировка IP после N неудачных попыток
- Временная блокировка учетной записи

## Рекомендуемый подход
Комбинация:
1. Rate limiting на бэкенде (приоритет 1)
2. Google reCAPTCHA v3 (приоритет 2)

## Шаги реализации reCAPTCHA v3

1. Установить пакет:
```bash
npm install react-google-recaptcha-v3
```

2. Добавить в Login.jsx:
```jsx
import { GoogleReCaptchaProvider, useGoogleReCaptcha } from 'react-google-recaptcha-v3'

// В компоненте Login:
const { executeRecaptcha } = useGoogleReCaptcha()

const handleSubmit = async (e) => {
  e.preventDefault()
  
  if (!validateForm()) return
  
  // Выполнить reCAPTCHA
  const token = await executeRecaptcha('login')
  
  setLoading(true)
  const result = await login(values.username, values.password, token)
  // ...
}
```

3. Обернуть приложение в провайдер:
```jsx
<GoogleReCaptchaProvider
  reCaptchaKey="YOUR_RECAPTCHA_SITE_KEY"
  scriptProps={{ async: false, defer: false }}
>
  <App />
</GoogleReCaptchaProvider>
```

4. На бэкенде проверять токен reCAPTCHA перед аутентификацией

## Переменные окружения
- `VITE_RECAPTCHA_SITE_KEY` - публичный ключ для frontend
- `RECAPTCHA_SECRET_KEY` - секретный ключ для backend

## Статус
- [ ] Выбрать решение (reCAPTCHA/hCaptcha/кастомное)
- [ ] Реализовать rate limiting на бэкенде
- [ ] Интегрировать CAPTCHA на frontend
- [ ] Добавить проверку на бэкенде
- [ ] Тестирование

## Дата создания
2024-12-19

## Контакты
Разработчик: Романов А.А. (AAromanov@starwayp.com)