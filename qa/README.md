# QA — Visual Regression Infrastructure

Папка для снапшотов и отчётов визуальной миграции на новый дизайн.

## Структура

```
qa/
  baseline/        # эталонные скриншоты (git-ignored)
  after/<tab>/     # свежие скриншоты (git-ignored)
  diffs/<tab>/     # pixel-diff between baseline и after (git-ignored)
  reports/<page>.md  # findings, статус миграции (в git)
  visual-diff.config.mjs  # список страниц, viewports, тем
  capture.mjs      # снимает скриншоты через Playwright
  compare.mjs      # pixel-diff baseline vs after через pixelmatch
```

## Установка

Playwright и pixelmatch не входят в `package.json` — ставить руками при необходимости:

```bash
npm i -D playwright pixelmatch pngjs
npx playwright install chromium
```

## Альтернатива: Playwright MCP

Если работаете через Claude Code с подключённым `playwright` MCP — можно использовать его вместо standalone-скриптов:

- `mcp__playwright__navigate({ url: 'http://localhost:3000' })`
- `mcp__playwright__fill({ selector: '#login-username', text: 'admin' })` / `#login-password`
- `mcp__playwright__click({ selector: 'button[type="submit"]' })`
- `mcp__playwright__wait_for_selector({ selector: '.sidebar .nav-item' })`
- `mcp__playwright__evaluate({ script: "document.documentElement.dataset.theme='light'" })`
- `mcp__playwright__click({ selector: '.nav-item:has-text("Транзакции")' })` (или `xpath=//button[contains(., "Транзакции")]`)
- `mcp__playwright__screenshot({ full_page: true })`

Удобно для точечной сверки страницы. Для полного прогона 15 × 2 × 2 = 60 снимков — используйте [capture.mjs](capture.mjs).

## Использование (standalone-скрипты)

1. **Снять baseline** (один раз на «известно-хорошем» коммите):

   ```bash
   # Дев-сервер должен быть поднят на QA_BASE_URL (по умолчанию http://localhost:3000)
   node qa/capture.mjs --baseline
   ```

2. **Снять after** (после изменений):

   ```bash
   node qa/capture.mjs
   ```

3. **Сравнить**:

   ```bash
   node qa/compare.mjs
   ```

   Exit code 0 — все OK; 1 — есть DIFF (≥1% пикселей отличаются). PNG-диффы сохраняются в `qa/diffs/<tab>/<theme>-<viewport>.png`.

## Переменные окружения

- `QA_BASE_URL` (default: `http://localhost:3000`)
- `QA_USER` (default: `admin`)
- `QA_PASSWORD` (default: `admin123`)

## Конфиг

Страницы, viewports и темы — в [visual-diff.config.mjs](visual-diff.config.mjs). По умолчанию:

- 15 вкладок (см. `TAB_LABELS` в [src/App.jsx](../src/App.jsx))
- Viewports: 1440×900, 1024×768
- Темы: dark, light

Всего ~60 снимков на прогон (15 × 2 × 2).

## Протокол миграции страницы

1. Прочитать эталон (HTML reference или baseline screenshot).
2. Изменить соответствующий `src/components/<Page>.jsx` + `.css`.
3. `node qa/capture.mjs`.
4. `node qa/compare.mjs`.
5. Записать `qa/reports/<page>.md`: OK / DIFF / TODO.
6. Commit `redesign: <page>`.
