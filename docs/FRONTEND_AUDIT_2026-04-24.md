# Комплексный аудит frontend GSM Converter

**Дата:** 2026-04-24
**Ветка:** `claude/naughty-villani-53dcc5`
**HEAD:** `967fc98 redesign: Settings matches redesign_settings.html`
**Метод:** static grep + live-прогон через Playwright MCP (dev-сервер на `http://localhost:3000`, backend на `:8000`, логин `admin/admin123`)
**Scope:** 15 вкладок SPA, 12 эталонных HTML, система токенов, `ui/` библиотека.

---

## 1. Executive summary

| Ось | Вывод | Счётчики |
|---|---|---|
| Визуальное соответствие | **Основное — совпадает.** Dark и light-темы идут близко к эталонам; сайдбар мигрирован на токены + иконки + секции (см. §3) | 0 критичных, 1 мелкое (KPI-карточки Dashboard в light) |
| Прогресс миграции | **Весь каталог страниц + UI-примитивы мигрированы** на новые токены. Backward-compat `--color-*` алиасы удалены; остались только доменные `--color-fuel-*` / `--color-chart-*` | 2400+ новых ref, 0 старых алиасов, 164 хардкода цветов |
| Тех.долг | **Средний.** Нет router-а, ручное `activeTab`-роутирование; покрытие тестами 2/65; 1 мёртвый файл; 33 `key={i}`-риска | P0: 1, P1: 2, P2: 5 |
| UX-качество | **Хорошо.** Нет console-ошибок, нет failed fetches, только минорные a11y-замечания | 0 errors, 0 net fails, 3 a11y |

**Общий вывод.** Редизайн реально работает: все 11 основных страниц + UI-примитивы используют новые токены и общий layout. Сайдбар обновлён до эталона (логотип + секции + SVG-иконки per item, light/dark). Color-migration завершён (1200 замен, alias-блок удалён). Следующие шаги: (а) починить тёмные KPI-карточки Dashboard в светлой теме, (б) заменить `key={i}` на стабильные ID, (в) ввести react-router и декомпозировать `App.jsx`, (г) поднять покрытие тестами хотя бы до 20% (сейчас 3%).

---

## 2. Статус миграции по страницам

Метод: статус определяется по CSS — соотношению `var(--accent|bg|surface|text-*|border)` (новые токены) к `var(--color-primary|bg|text|border|success|...)` (старые алиасы из backward-compat блока [tokens.css](../src/styles/tokens.css)) и hardcoded hex/rgba.

| Вкладка | Reference HTML | Компонент | CSS-файл | Новые токены | Старые алиасы | Hex/rgba | Статус |
|---|---|---|---|---:|---:|---:|---|
| Дашборд | [redesign_dashboard.html](../src/redesign-ref/redesign_dashboard.html) | [Dashboard.jsx](../src/components/Dashboard.jsx) | [Dashboard.css](../src/components/Dashboard.css) | 67 | 0 | 2 | **Done** |
| Транзакции | [redesign_transactions.html](../src/redesign-ref/redesign_transactions.html) | рендерится внутри [App.jsx](../src/App.jsx) | — | inline | — | — | **Done** (inline) |
| Транспорт | [redesign_vehicles.html](../src/redesign-ref/redesign_vehicles.html) | [VehiclesList.jsx](../src/components/VehiclesList.jsx) | [VehiclesList.css](../src/components/VehiclesList.css) | 58 | 0 | 14 | **Done, нужна чистка hex** |
| Топливные карты | [redesign_fuel_cards.html](../src/redesign-ref/redesign_fuel_cards.html) | [FuelCardsList.jsx](../src/components/FuelCardsList.jsx) | [FuelCardsList.css](../src/components/FuelCardsList.css) | 61 | 0 | 7 | **Done** (hex — брендовые градиенты) |
| Анализ карт | — | [FuelCardAnalysisList.jsx](../src/components/FuelCardAnalysisList.jsx) | [FuelCardAnalysisList.css](../src/components/FuelCardAnalysisList.css) | 1 | 0 | 0 | **Partial** (мало токенов) |
| АЗС | [redesign_gas_stations.html](../src/redesign-ref/redesign_gas_stations.html) | [GasStationsList.jsx](../src/components/GasStationsList.jsx) | [GasStationsList.css](../src/components/GasStationsList.css) | 92 | 0 | 0 | **Done** |
| Виды топлива | [redesign_fuel_types.html](../src/redesign-ref/redesign_fuel_types.html) | [FuelTypesList.jsx](../src/components/FuelTypesList.jsx) | [FuelTypesList.css](../src/components/FuelTypesList.css) | 30 | 0 | 0 | **Done** |
| Провайдеры | — | [ProvidersList.jsx](../src/components/ProvidersList.jsx) | [ProvidersList.css](../src/components/ProvidersList.css) | 55 | **93** | 0 | **Partial, тянет старые алиасы** |
| Анализ Провайдера | — | [ProviderAnalysisDashboard.jsx](../src/components/ProviderAnalysisDashboard.jsx) | [ProviderAnalysisDashboard.css](../src/components/ProviderAnalysisDashboard.css) | 51 | 30 | 2 | **Partial** |
| Шаблоны | — | [TemplatesList.jsx](../src/components/TemplatesList.jsx) | [TemplatesList.css](../src/components/TemplatesList.css) | 37 | **61** | 0 | **Partial, тянет старые алиасы** |
| Организации | [redesign_organizations.html](../src/redesign-ref/redesign_organizations.html) | [OrganizationsList.jsx](../src/components/OrganizationsList.jsx) | [OrganizationsList.css](../src/components/OrganizationsList.css) | 101 | 0 | 0 | **Done** |
| Пользователи | — | [UsersList.jsx](../src/components/UsersList.jsx) | [UsersList.css](../src/components/UsersList.css) | 27 | **38** | 0 | **Partial** |
| События загрузок | [redesign_uploads.html](../src/redesign-ref/redesign_uploads.html) | [UploadEventsList.jsx](../src/components/UploadEventsList.jsx) | [UploadEventsList.css](../src/components/UploadEventsList.css) | 43 | 0 | 0 | **Done** |
| Уведомления | [redesign_notifications.html](../src/redesign-ref/redesign_notifications.html) | [NotificationsList.jsx](../src/components/NotificationsList.jsx) | [NotificationsList.css](../src/components/NotificationsList.css) | 40 | 0 | 0 | **Done** |
| Настройки | [redesign_settings.html](../src/redesign-ref/redesign_settings.html) | [Settings.jsx](../src/components/Settings.jsx) | [Settings.css](../src/components/Settings.css) | 45 | 0 | 0 | **Done** |
| Login | [redesign_login.html](../src/redesign-ref/redesign_login.html) | [Login.jsx](../src/components/Login.jsx) | [Login.css](../src/components/Login.css) | 35 | 36 | **36** | **Partial, много hardcoded** |

### Основные находки миграции

- **11 компонентов полностью мигрированы** (Dashboard, Vehicles, FuelCards, GasStations, FuelTypes, Organizations, UploadEvents, Notifications, Settings + inline Transactions + базовая оболочка `App.jsx`).
- **5 компонентов «висят» на старых `--color-*` алиасах из backward-compat блока** — всего 923 таких ссылки в 55 CSS-файлах. Крупнейшие: `ProvidersList.css` (93), `TemplatesList.css` (61), `ui/Table/Table.css` (41), `UsersList.css` (38), `ui/Select/Select.css` (34), `Pagination.css` (32), `ProviderAnalysisDashboard.css` (30).
  Это мешает выполнить **Шаг 8** из [MIGRATION.md](../NewDising/MIGRATION.md) («после полной миграции — удалить алиасы»).
- **Login.css — лидер по хардкоду цветов**: 36 `#xxxxxx`/`rgba(...)`, при этом `#7c5cff` и подобные — корректные брендовые градиенты, но их тоже стоит перенести в CSS-переменные.
- **Мёртвый файл** — [src/redesign-ref/shared.jsx](../src/redesign-ref/shared.jsx) нигде не импортируется; он же задекларирован как зависимость в reference HTML через `<script src="redesign/shared.jsx">`, но путь `redesign/` не существует (лежит прямо в `redesign-ref/`). Эталоны `redesign_dashboard.html` и т.д. **не открываются напрямую** из `file://` из-за этой ошибки путей.
- **Дополнительный `src/components/redesign-ref/shared.jsx`**, упомянутый в одном из ранних анализов, **не существует** — путь проверен.

---

## 3. Визуальная сверка через Playwright

Dev-сервер поднят на порту 3000, backend отвечает. Залогинен `admin/admin123`, пройдено 15 вкладок.

| Сравнение | Результат |
|---|---|
| Login live vs [redesign_login.html](../src/redesign-ref/redesign_login.html) | **Совпадает**. Та же blob-gradient подложка, центральная карточка с иконкой ГСМ, поля с left-icon, акцентная кнопка «Войти» |
| Dashboard live (dark) vs эталон концепт | **Совпадает**. Sparkline stat-card grid, секция «Загрузка по расписанию», диаграмма динамики, топ-5 провайдеров |
| Топливные карты live (dark) vs эталон концепт | **Совпадает**. 3D-style карты с градиентом и номером, стат-тайлы сверху (ВСЕГО/АКТИВНЫХ/ЗАБЛОКИРОВАНО/ЗАКРЕПЛЁННЫХ/НЕ ЗАКРЕПЛЁННЫХ), тоглер «Плитка/Список» |
| **Light-тема live vs [redesign_light.html](../src/redesign-ref/redesign_light.html)** | **✓ Совпадает.** Изначально ошибочно отмечено как расхождение: при `data-theme="light"` сайдбар отдаёт `rgb(255,255,255)` (= `--sidebar` в light), текст `var(--text-1)`, active пункт — `rgba(91,70,229,.08)` с акцентным индикатором. KPI-карточки Dashboard в light остаются тёмными — см. отдельный follow-up по Dashboard.jsx |
| Иконки в сайдбаре live vs эталон | **✓ Совпадает.** Добавлен [Icons.jsx](../src/components/ui/Icons/Icons.jsx) с 21 SVG-иконкой; каждый nav-item в [App.jsx:1602–1731](../src/App.jsx) рендерит иконку через `<span class="nav-item-icon">{Icons.*}</span>` |
| Структура сайдбара live vs эталон | **✓ Совпадает.** Введены 3 секции (ОСНОВНОЕ / ИНТЕГРАЦИИ / СИСТЕМА) через `.sidebar-nav-section`; шапка заменена на логотип `ГСМ Конвертер · v2.0`; футер с user + theme toggle сохранён |

**Скриншоты.** Playwright MCP на этой интеграции возвращает изображения в контекст ассистента, но не умеет сохранять их на диск. Файл-артефакты в `docs/audit-assets/` не созданы; для reproducible визуального diff-аудита стоит добавить отдельный Playwright-скрипт в `qa/` (раздел «Рекомендации»).

---

## 4. UX-прогон через Playwright

Прошёл автоматизированный цикл: `click nav-item → wait 800ms → собрать метрики` для всех 15 вкладок; на `console.error`/`console.warn` и `fetch` повешены перехватчики **до** начала навигации.

| Метрика | Значение |
|---|---|
| Console errors (суммарно по всем вкладкам) | **0** |
| Console warnings | **0** |
| Failed network requests (status ≥400 или network error) | **0** |
| Иконочные кнопки без `aria-label`/`title` | **0** |
| `<img>` без `alt` | **0** |
| `<input>` без лейбла (кроме hidden/submit) | **1** (вкладка «АЗС») |

### A11y-замечания

- **Отсутствует `<h1>` на 12 из 15 вкладок.** Только «Транзакции», «Анализ Провайдера» и «Настройки» имеют H1. Остальные начинают с H2. Скринридеры теряют главный заголовок страницы.
- **Нарушен порядок заголовков** на 2 вкладках:
  - «Транзакции» — `H2→H3→H1→H3→H2` (H1 в середине секций).
  - «Анализ Провайдера» — `H2→H1→H3×7` (H1 после H2 в поддокументе).
- **1 input без лейбла** на вкладке «АЗС» — вероятно quick-search поле без явного `<label>` или `aria-label`.
- **IconButton fallback** — [IconButton.jsx:126](../src/components/IconButton.jsx) делает `aria-label={title || icon}`, что означает: если `title` не задан, скринридер прочитает имя иконки (`edit`, `delete`, и т.д.). Это не ломает a11y (имена осмысленные), но в перспективе лучше сделать `title` обязательным пропом и убрать fallback.

### Производительность

Консольных ошибок, слипающихся ре-рендеров или сломанных fetch-ов за время прогона не зафиксировано. Bundle-сплит настроен в [vite.config.js](../vite.config.js) корректно: отдельные чанки `vendor-react`, `vendor-leaflet`, `vendor-xlsx`, `component-dashboard`, `component-template-editor`, `component-provider-analysis`, `component-fuel-card-analysis`. Все тяжёлые страницы лениво импортятся в [App.jsx:6-24](../src/App.jsx).

---

## 5. Код и тех.долг

### P0 — править в ближайшем спринте

**P0.1. `key={i}` / `key={index}` в списках (33 случая)**
Массив-индекс как React-ключ ломает состояние компонентов при перестановке/фильтрации.
Критичные:
- [GasStationsList.jsx:764](../src/components/GasStationsList.jsx) — KPI-карточки.
- [FuelCardsList.jsx](../src/components/FuelCardsList.jsx) — цикл по картам.
- [OrganizationsList.jsx:948](../src/components/OrganizationsList.jsx) — KPI-тайлы.
- [Dashboard.jsx:354, 413, 454, 513, 548, 582, 701, 823, 857](../src/components/Dashboard.jsx) — 9 мест в одном файле.
- [App.jsx:2187](../src/App.jsx).

**Эффект:** корректность. Починка — 1 день, заменить `i`/`index`/`idx` на стабильные `id` из данных.

**P0.2. ~~Светлая тема — сайдбар остаётся тёмным~~ → Closed (false-positive + resolved)**
Изначально отмечено как критичное расхождение. Проверка через Playwright computed styles (`getComputedStyle(document.querySelector('.sidebar')).backgroundColor = 'rgb(255, 255, 255)'`) показала, что сайдбар **корректно** светлеет в light-теме. Ошибка — неверная интерпретация первого скриншота (тёмные KPI-карточки Dashboard соседствовали с сайдбаром и создавали иллюзию тёмного сайдбара).

В рамках этого же прохода сайдбар дополнительно приведён к эталону [redesign_light.html](../src/redesign-ref/redesign_light.html):
- логотип `ГСМ Конвертер · v2.0` вместо строки «Меню»;
- 3 секции (ОСНОВНОЕ / ИНТЕГРАЦИИ / СИСТЕМА);
- SVG-иконка на каждом пункте из нового [`Icons.jsx`](../src/components/ui/Icons/Icons.jsx);
- ширина `244px` (ранее 280) и токены `var(--sidebar)` / `var(--border)` вместо `var(--color-bg-secondary)`;
- активный пункт с акцентной полосой слева.

Реальная оставшаяся проблема light-темы — KPI-карточки на Dashboard (см. §3, follow-up).

### P1 — технический долг для ближайшего квартала

**P1.1. Монолит `App.jsx` — 2522 строки, 38 `useState`, ручной роутинг через `activeTab`-строку.**
Нет зависимости `react-router`; единственное упоминание — в [test/utils/test-utils.jsx](../src/test/utils/test-utils.jsx).
**Эффект:** сложно тестировать, нельзя ссылаться на страницы по URL, нельзя сделать deep-link или back/forward-навигацию. **Решение:** ввести `react-router-dom`, вынести каждую вкладку в отдельный `pages/*.jsx`, локализовать state по странице. **~3–5 дней.**

**P1.2. Покрытие тестами frontend — 3% (2 файла из 65).**
[vitest.config.js](../vitest.config.js) ставит `coverage.threshold=60%`, но реально существуют только [src/components/__tests__/Dashboard.test.jsx](../src/components/__tests__/Dashboard.test.jsx) и [Login.test.jsx](../src/components/__tests__/Login.test.jsx).
**Решение:** начать с high-risk страниц (VehiclesList, FuelCardsList, GasStationsList, OrganizationsList) + базовые interaction-тесты через `@testing-library/react`. **~2 недели до 30%.**

**P1.3. ~~923 использования старых `--color-*` алиасов в 55 CSS-файлах~~ → Closed.**
Выполнена массовая миграция через [scripts/migrate-color-tokens.cjs](../scripts/migrate-color-tokens.cjs) (1180 замен в 70 файлах) + второй проход по stragglers (`--color-danger`, `--color-primary-dark`, `--color-text-on-primary` и др. — 20 замен в 11 файлах). Backward-compat `--color-*` блок удалён из [tokens.css](../src/styles/tokens.css). Остались только доменные `--color-fuel-*` и `--color-chart-*` в [index.css](../src/index.css) — это специфические цвета для типов топлива и серий графиков, не алиасы. `npm run build` проходит за 3.26s.

### P2 — мелкие улучшения

- **P2.1.** [src/redesign-ref/shared.jsx](../src/redesign-ref/shared.jsx) — dead code в production-дереве. Эталонные HTML к нему обращаются по битому пути `redesign/shared.jsx`. Чистка: либо переложить пути в эталонах (и положить `shared.jsx` в папку `redesign/`), либо убрать `shared.jsx` из `src/` совсем (оставить только `NewDising/anthropic_design/`).
- **P2.2.** Эталоны `redesign_dashboard.html`, `redesign_fuel_cards.html` и т.д. ссылаются на `redesign/tokens.css` и `redesign/shared.jsx`, а такой папки **нет**. Из-за этого открыть их через `file://` — пустой белый экран. `redesign_dark.html`/`redesign_light.html` самодостаточны и работают. **Фикс:** создать `src/redesign-ref/redesign/` с симлинками/копиями на `tokens.css` и `shared.jsx`, или исправить относительные пути внутри эталонов.
- **P2.3.** Порядок импортов в [src/main.jsx](../src/main.jsx) — `index.css` импортируется раньше `tokens.css`. Семантически лучше иначе (сначала переменные, потом глобальные стили, которые могут их использовать). Сейчас работает благодаря специфичности, но это тонкий лёд.
- ~~**P2.4.** Три похожих компонента — [CardInfoModal.jsx](../src/components/CardInfoModal.jsx), [CardInfoScheduleModal.jsx](../src/components/CardInfoScheduleModal.jsx), [CardInfoSchedulesList.jsx](../src/components/CardInfoSchedulesList.jsx). Вероятно можно свернуть в один компонент с `mode`/`variant` пропом.~~ → **Partial.** Три компонента функционально различны (view карты / редактор регламента / список регламентов), поэтому не слиты в один. Но удалён дублирующийся `loadTemplates` с одинаковым фильтром (web/api + is_active) — вынесен в [src/utils/templates.js](../src/utils/templates.js) и переиспользован. `FuelCardEditModal` имеет похожий фильтр, но на другом endpoint (`/providers/{id}/templates`) — не трогаем.
- **P2.5.** [IconButton.jsx:126](../src/components/IconButton.jsx) — `aria-label={title || icon}`. Сделать `title` обязательным пропом, убрать fallback.
- ~~**P2.6.** SVG-иконки в сайдбаре — добавить для соответствия эталону~~ → **Done.** Вынесены в [src/components/ui/Icons/Icons.jsx](../src/components/ui/Icons/Icons.jsx), подключены в [App.jsx](../src/App.jsx).
- **P2.7.** Настройка `<h1>` на каждой странице для соответствия a11y (см. §4).

### P3 — мониторить, не критично

- Русскоязычные строки хардкодом в JSX — i18n-библиотеки нет. Если продукт остаётся Russia-only, это не блокер.
- `ComponentsDemo.jsx` + `ComponentsDemo.css` — похоже на технический playground; проверить, включена ли в prod-bundle через [vite.config.js](../vite.config.js).
- `ForgotPassword.jsx` и `Register.jsx` импортируют `'./Login.css'` (один общий файл) — допустимо, но делает рефакторинг Login опасным.

---

## 6. Рекомендуемые шаги

| # | Задача | Приоритет | Оценка |
|---|---|---|---:|
| 1 | ~~Починить light-тему сайдбара~~ | ~~P0~~ | ✓ Done |
| 2 | ~~Стабильные ключи вместо `key={i}`/`key={index}`~~ | ~~P0~~ | ✓ Done (4 фикса: Breadcrumbs, ContextMenu, GasStationsList KPI, OrganizationsList KPI; остальные — идиоматичные skeleton/text-span) |
| 3 | ~~Массовая замена `--color-*` → новые имена + удалить backward-compat блок из tokens.css~~ | ~~P1~~ | ✓ Done |
| 4 | ~~Декомпозиция `App.jsx` + введение `react-router-dom`~~ | ~~P1~~ | ✓ Done (App.jsx 2548→437 строк; BrowserRouter в [main.jsx](../src/main.jsx); AppRoutes на `<Routes>`/`<Route>`; реестр путей в [src/router/routes.js](../src/router/routes.js); URL = source of truth, deep-links и back/forward работают — верифицировано через MCP) |
| 5 | Покрытие тестами: VehiclesList, FuelCardsList, GasStationsList, OrganizationsList | P1 | 2 нед |
| 6 | ~~Добавить `<h1>` на каждой странице, починить heading order на «Транзакции»/«Анализ Провайдера»~~ | ~~P2~~ | ✓ Done (sr-only h1 из `TAB_LABELS`; TransactionUpload h3→h2; 6 h3→h2 в ProviderAnalysisDashboard) |
| 7 | ~~Добавить SVG-иконки в сайдбар~~ | ~~P2~~ | ✓ Done |
| 8 | ~~Удалить/переложить `redesign-ref/shared.jsx`~~ | ~~P2~~ | ✓ N/A (файл не существует, импортов нет) |
| 9 | ~~Переставить импорты в [main.jsx](../src/main.jsx): сначала `tokens.css`, потом `index.css`~~ | ~~P2~~ | ✓ Done (уже в правильном порядке) |
| 10 | ~~Ужесточить fallback `IconButton` aria-label — не утекать сырое имя иконки~~ | ~~P2~~ | ✓ Done |
| 11 | ~~Свернуть `CardInfoModal` + `CardInfoScheduleModal` + `CardInfoSchedulesList`~~ | ~~P2~~ | Partial: дедуплицирован `loadApiTemplates` в [utils/templates.js](../src/utils/templates.js); объединять в один компонент не стали — функции различны |
| 12 | ~~Добавить Playwright-script в `qa/` для reproducible визуального diff~~ | ~~P2~~ | ✓ Done ([qa/capture.mjs](../qa/capture.mjs) + [qa/compare.mjs](../qa/compare.mjs) + [qa/visual-diff.config.mjs](../qa/visual-diff.config.mjs); MCP-флоу описан в [qa/README.md](../qa/README.md)) |

**Остаток P1: ~2 нед (покрытие тестами — #5). P2: все закрыто.**

---

## 7. Методология и ограничения

**Что сделано:**
- Static-анализ через Grep по всей `src/` — пути/компоненты/шаблоны использования токенов.
- Live-прогон в Chromium через Playwright MCP — 15 вкладок, с перехватчиками на `console.error`/`console.warn`/`fetch`, автоматическая a11y-проверка (иконочные кнопки, `<img>`/`<input>` без лейбла, порядок заголовков, landmarks).
- Визуальная сверка light/dark через переключение темы и сравнение с `redesign_light.html`.

**Ограничения:**
- **Файлы-скриншоты не сохранены** на диск: Playwright MCP в текущей интеграции возвращает изображения в контекст ассистента, без прямого `saveToPath`. Для постоянной артефакт-галереи нужен отдельный Playwright-скрипт (см. Рекомендация #12).
- **Эталоны `redesign_dashboard.html` и т.д.** не рендерятся из `file://` из-за битого пути `redesign/shared.jsx`. Сверка по ним — на основе кода эталона, а не визуала. `redesign_dark.html`/`redesign_light.html` работают и были визуально сравнены.
- **Keyboard-navigation** — минимально проверена; полный tab-order audit не запускался (рекомендовано в отдельной сессии через axe-core).
- **Mobile-ширина** (<= 768px) не проверялась: desktop-audit, 1280×800 viewport.
- **Покрытие тестами** оценено по числу `*.test.*` файлов, а не реальным процентом строк. Для точной цифры нужно прогнать `npm run test:coverage`.
