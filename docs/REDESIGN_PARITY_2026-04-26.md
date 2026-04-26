# Redesign Parity Audit — 2026-04-26

Сверка live-приложения (`http://localhost:3011`, ветка `claude/naughty-villani-53dcc5`) с эталонами `NewDising/anthropic_design/gsm-design-system/project/ui_kits/web_app/redesign_*.html`.

Метод: Playwright MCP, авторизация admin/admin123, viewport 1280×800, dark theme.

## Сводка

| # | Страница | Эталон | Статус | Заметка |
|---|---|---|---|---|
| 1 | Login | `redesign_login.html` | ✅ Done | Полное соответствие. После фикса `181f064` (убран `position:fixed` с `.login-bg`) ещё и скроллится при коротком viewport. |
| 2 | Dashboard | `redesign_dashboard.html` | ✅ Done | KPI-плитки со спарклайнами, segmented selector «По дням/По месяцам/По годам», карточка «Загрузка по расписанию», график «Динамика потребления», «Топ-5 провайдеров» с прогресс-барами. Идентично эталону. |
| 3 | Transactions | `redesign_transactions.html` | 🟡 Partial | Архитектура совпадает (KPI-плитки → фильтры → таблица → пагинация). После сегодняшнего коммита значения KPI окрашены под accent-bar (cyan/green) как в эталоне. **Расхождения** — продуктовые: добавлена область drag-drop file upload (нет в эталоне, но эта страница главная для импорта), «Расширенный поиск» сделан раскрывающимся, в таблице ~20 колонок (в эталоне 11). Все три отступа осознанные. |
| 4 | Vehicles | `redesign_vehicles.html` | ✅ Done | KPI-плитки (Всего ТС / Валидные / Требуют проверки / С ошибками), search input + pill-фильтры, таблица с госномерами в стилизованной обойме (RU-флаг). |
| 5 | FuelCards | `redesign_fuel_cards.html` | ✅ Done | KPI-плитки (5 шт), grid/list тоглер «Плитка/Список», «Расширенный поиск», 3D-карты с градиентом. Полный матч эталону. |
| 6 | GasStations | `redesign_gas_stations.html` | 🟡 Partial | KPI-плитки + поиск + provider-dropdown ✅. **Дивергенция**: в эталоне data в виде карточек с мини-статистикой; у нас плоская таблица. Это правильно для master-data с большим списком, но визуально дальше от эталона чем другие страницы. |
| 7 | FuelTypes | `redesign_fuel_types.html` | ✅ Done | KPI-плитки + pill-фильтры (Все/Требуют проверки/Валидные/С ошибками) + кнопка «Настроить поля» + таблица со status-badges и actions-icons. Полный матч. |
| 8 | Organizations | `redesign_organizations.html` | ✅ Done | KPI-плитки + search + «Добавить», master-detail layout (список слева, реквизиты справа). Полный матч. |
| 9 | Notifications | `redesign_notifications.html` | ✅ Done | После коммита `2fe602c`: pill-чипы фильтра с count-badges (Все/Непрочитанные/Ошибки/Предупреждения/Успех/Информация) + ghost «Прочитать всё» + category-dropdown + items-card с accent-strip для непрочитанных. Минимальное косметическое расхождение: в эталоне «Прочитать всё» сидит inline справа на той же строке что чипы; у нас иногда уезжает на вторую строку при wrap (при viewport ≥1280 — на той же строке). |
| 10 | UploadEvents | `redesign_uploads.html` | 🟡 Partial | KPI-плитки (5 шт) + большой блок фильтров (Поиск/Провайдер/Источник/Статус/Регламент/Дата с/Дата по) + таблица. **Дивергенция**: эталон легче — drop-zone сверху + журнал последних загрузок; у нас полноценный audit-log с расширенной фильтрацией. Продуктово правильно. |
| 11 | Settings | `redesign_settings.html` | ✅ Done | Заголовок «Настройки» + subtitle «Конфигурация системы», левый sidebar с разделами (Очистка/Администрирование/Внешний вид/Нормализация/Регламенты по картам/Уведомления), правое содержимое с action-карточками. Полный матч. |

**Итог**: 11/11 страниц мигрированы. 7 страниц — полное соответствие, 4 страницы — продуктовые расхождения (Transactions/GasStations/UploadEvents — больше функциональности чем в эталоне).

## Что не делалось (вне scope этого audit)

Sidebar (`redesign_dark.html`/`redesign_light.html` reference): уже мигрирован в коммите `24ffdcd redesign: Sidebar matches redesign_light.html (logo + sections + icons)` — общий шеврон-логотип, секции «ОСНОВНОЕ/ИНТЕГРАЦИИ/СИСТЕМА», иконки. ✅

## Сегодняшние правки (в порядке коммитов)

| Hash | Что |
|---|---|
| `2fe602c` | Уведомления — pill-чипы фильтра вместо 3-х `<Select>` (которые были сломаны: передавали `<option>` детей в кастомный `<Select options=[]>`) |
| `ae2c776` | h1 страниц — слева (был center глобально); 9 CTA-кнопок `variant="success"` → `"primary"` |
| `181f064` | `.login-bg` без `position:fixed` (скролл на маленьких экранах) + safety-net body.overflow при навигации |
| `7754f67` | useScrollLock реентрантен (counter pattern) + 3 модалки переведены на него |
| `962af99` | `overflow:hidden` → `overflow:clip` на 21 CSS-файле (45 правил) — wheel-trap fix |
| `0136d59` | dash-chart-container / dash-table-wrap — убран `overflow-x:auto` (последние ловушки колеса мыши) |
| `a28249f` | **Корневой фикс прокрутки**: убран `body { overflow-y: auto }` из App.css. Body больше не scroll-контейнер, виновный в перехвате wheel-событий когда курсор был не над scrollbar. |
| (текущий) | KPI Транзакций — значения окрашены в accent-цвет как в эталоне (cyan для primary, green для success). Размер шрифта 20px → 18px (как в эталоне). |

## Рекомендации (по приоритету)

| # | Приоритет | Действие |
|---|---|---|
| 1 | P2 | Notifications: переместить «Прочитать всё» в `flex-shrink: 0` чтобы оно гарантированно сидело справа inline с чипами на любых ширинах (сейчас может уезжать на 2-ю строку при wrap-у). |
| 2 | P2 | GasStations: альтернативно — добавить toggle «Карточки/Таблица» (как на FuelCards), чтобы можно было переключиться на view с мини-статистикой как в эталоне. Если нужно. |
| 3 | P3 | UploadEvents: рассмотреть вынесение фильтров за collapsible (как на Транзакциях) — сейчас они занимают ~250px высоты на свежем заходе. |
| 4 | P3 | Tests: Dashboard.test.jsx и Login.test.jsx живут в `__tests__/`, но coverage по компонентам всё ещё < 30%. Аудит `FRONTEND_AUDIT_2026-04-24.md` отметил этот пункт P1, но scope сегодняшнего сеанса — визуальная сверка, не тест-coverage. |

## Ограничения

- Скриншоты делались в Playwright Chromium при viewport 1280×800. На реальных мониторах ≥1440 раскладки могут выглядеть просторнее (в частности, на Notifications «Прочитать всё» уйдёт inline).
- Live-проверка велась в одной (dark) теме. Light тема не покрыта в этом audit — отдельный пункт.
- Замечания по «продуктовым расхождениям» (Transactions/GasStations/UploadEvents) — это design-product calls, не bugs. Решение «оставлять как есть или приближать к эталону» — за командой продукта.
