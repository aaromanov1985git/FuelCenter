# QA — Visual Regression Infrastructure

Папка для снапшотов и отчётов визуальной миграции на новый дизайн.

## Структура

```
qa/
  baseline/        # скриншоты ДО изменений (git-ignored)
  reference/       # рендеры redesign_*.html — эталон (git-ignored)
  after/<page>/    # скриншоты после миграции страницы (git-ignored)
  diffs/<page>/    # pixel-diff между after и reference (git-ignored)
  reports/<page>.md  # findings, статус миграции (в git)
```

## Запуск аудита

Через Playwright MCP с учёткой `admin/admin123` на `http://10.35.1.27:3002/`.

Viewports: `1440x900` (desktop), `1920x1080` (hd), `768x1024` (tablet).
Темы: `dark` (default), `light`.

## Протокол миграции страницы

1. Прочитать эталон `NewDising/anthropic_design/gsm-design-system/project/ui_kits/web_app/redesign_<page>.html`
2. Изменить соответствующий `src/components/<Page>.jsx` + `.css`
3. Snapshot → `qa/after/<page>/<theme>.png`
4. Diff против `qa/reference/<page>.png`
5. Записать `qa/reports/<page>.md`: OK / DIFF / TODO
6. Commit `redesign: <page>`
