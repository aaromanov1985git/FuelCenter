# 📧 РУКОВОДСТВО ПО НАСТРОЙКЕ АЛЕРТОВ

**Дата:** 2025-12-26

---

## 📋 ОБЗОР

AlertManager настроен и готов к работе. Требуется только настройка получателей алертов.

---

## 🔧 НАСТРОЙКА EMAIL АЛЕРТОВ

### 1. Обновить `monitoring/alertmanager/alertmanager.yml`

```yaml
route:
  receiver: 'email-notifications'
  group_by: ['alertname', 'cluster', 'service']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 12h

receivers:
- name: 'email-notifications'
  email_configs:
  - to: 'admin@yourcompany.com'
    from: 'alerts@yourcompany.com'
    smarthost: 'smtp.yourcompany.com:587'
    auth_username: 'alerts@yourcompany.com'
    auth_password: 'your-smtp-password'
    headers:
      Subject: 'GSM System Alert: {{ .GroupLabels.alertname }}'
    html: |
      <h2>Alert: {{ .GroupLabels.alertname }}</h2>
      <p><strong>Status:</strong> {{ .Status }}</p>
      <p><strong>Description:</strong> {{ .CommonAnnotations.description }}</p>
      <ul>
      {{ range .Alerts }}
        <li>
          <strong>{{ .Labels.alertname }}</strong><br>
          {{ .Annotations.description }}
        </li>
      {{ end }}
      </ul>
```

### 2. Перезапустить AlertManager

```bash
docker compose -f docker-compose.monitoring.yml restart alertmanager
```

---

## 📱 НАСТРОЙКА TELEGRAM АЛЕРТОВ

### 1. Создать Telegram бота

1. Написать [@BotFather](https://t.me/botfather) в Telegram
2. Отправить команду `/newbot`
3. Следовать инструкциям для создания бота
4. Сохранить токен бота

### 2. Получить Chat ID

1. Написать боту любое сообщение
2. Открыть: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
3. Найти `chat.id` в ответе

### 3. Обновить `monitoring/alertmanager/alertmanager.yml`

```yaml
receivers:
- name: 'telegram-notifications'
  webhook_configs:
  - url: 'https://api.telegram.org/bot<YOUR_BOT_TOKEN>/sendMessage'
    send_resolved: true
    http_config:
      basic_auth:
        username: '<YOUR_BOT_TOKEN>'
        password: ''
    json:
      chat_id: '<YOUR_CHAT_ID>'
      text: |
        🚨 *Alert: {{ .GroupLabels.alertname }}*
        
        Status: {{ .Status }}
        Description: {{ .CommonAnnotations.description }}
        
        {{ range .Alerts }}
        *{{ .Labels.alertname }}*
        {{ .Annotations.description }}
        {{ end }}
      parse_mode: 'Markdown'
```

### 4. Использовать webhook endpoint (рекомендуется)

Вместо прямого обращения к Telegram API, можно использовать webhook endpoint в приложении:

```yaml
receivers:
- name: 'telegram-notifications'
  webhook_configs:
  - url: 'http://backend:8000/api/v1/notifications/webhook/alertmanager'
    send_resolved: true
```

Webhook endpoint автоматически обработает алерт и отправит уведомление через настроенный Telegram бот в системе.

---

## 🔔 НАСТРОЙКА МНОЖЕСТВЕННЫХ ПОЛУЧАТЕЛЕЙ

### Пример с несколькими получателями:

```yaml
route:
  receiver: 'default'
  routes:
  - match:
      severity: critical
    receiver: 'critical-alerts'
    continue: true
  - match:
      severity: warning
    receiver: 'warning-alerts'

receivers:
- name: 'default'
  email_configs:
  - to: 'team@yourcompany.com'
  
- name: 'critical-alerts'
  email_configs:
  - to: 'oncall@yourcompany.com'
  webhook_configs:
  - url: 'http://backend:8000/api/v1/notifications/webhook/alertmanager'
  
- name: 'warning-alerts'
  email_configs:
  - to: 'team@yourcompany.com'
```

---

## ✅ ПРОВЕРКА РАБОТЫ

### 1. Проверить статус AlertManager

```bash
docker compose -f docker-compose.monitoring.yml ps alertmanager
```

### 2. Проверить логи

```bash
docker compose -f docker-compose.monitoring.yml logs alertmanager
```

### 3. Тестовый алерт

Создать тестовый алерт в Prometheus или отправить тестовый webhook:

```bash
curl -X POST http://localhost:9093/api/v1/alerts \
  -H "Content-Type: application/json" \
  -d '[{
    "labels": {
      "alertname": "TestAlert",
      "severity": "warning"
    },
    "annotations": {
      "description": "This is a test alert"
    }
  }]'
```

---

## 📝 ПРИМЕЧАНИЯ

1. **Безопасность:** Не храните пароли SMTP и токены Telegram в открытом виде. Используйте секреты Docker или переменные окружения.

2. **Rate Limiting:** Telegram API имеет ограничения на количество сообщений. Учитывайте это при настройке.

3. **Webhook Endpoint:** Webhook endpoint в приложении (`/api/v1/notifications/webhook/alertmanager`) уже настроен и готов к использованию.

---

**Дата:** 2025-12-26  
**Статус:** ✅ Готово к настройке

