# Учёт работ

Фронтенд-приложение для учёта выполненных работ, аналог вашего Excel-файла.

## Структура проекта

```
uchet/
├── index.html              ← единственная страница
├── css/
│   ├── base.css            ← reset, типографика, утилиты
│   ├── layout.css          ← app shell, sidebar, карточки, модалки
│   ├── components.css      ← кнопки, таблицы, формы, пагинация
│   └── themes/
│       ├── dark_theme.css  ← тёмная тема (по умолчанию)
│       └── white_theme.css ← светлая тема
└── js/
    ├── storage.js          ← File System Access API + CRUD
    ├── ui.js               ← UI-примитивы: Button, Input, Toast, Modal
    ├── view-records.js     ← таблица учёта (CRUD записей)
    ├── view-analytics.js   ← аналитика и графики
    ├── view-dashboard.js   ← общий обзор
    └── app.js              ← роутер, тема, инициализация
```

## Хранение данных

Используется **File System Access API** — браузер просит разрешение на доступ к файлу `uchet.json` на вашем диске. Данные не уходят на сервер, не хранятся в localStorage.

При первом запуске: создайте новый файл или откройте существующий.

## Хостинг на GitHub Pages

1. Создайте репозиторий на GitHub
2. Загрузите содержимое папки `uchet/` в корень репозитория
3. Включите GitHub Pages (Settings → Pages → Deploy from branch → main)
4. Готово — сайт работает по адресу `https://ваш-ник.github.io/имя-репозитория/`

> **Важно:** File System Access API работает только при открытии с HTTPS или localhost. GitHub Pages использует HTTPS — всё окей.

## Добавление новой темы

1. Создайте файл `css/themes/my_theme.css`
2. Скопируйте переменные из `dark_theme.css` и измените значения
3. Подключите его в `index.html`: `<link rel="stylesheet" href="css/themes/my_theme.css">`
4. Добавьте тему в массив `THEMES` в `js/app.js`

## Структура записи (record)

```json
{
  "id": "auto",
  "semesterId": "ссылка на семестр",
  "subject": "ап",
  "taskNum": "1",
  "client": "Фамилия",
  "price": 300,
  "doneDate": "2024-03-15",
  "paidDate": "2024-03-16",
  "status": "закрыто",
  "notes": "",
  "createdAt": "..."
}
```

## Статусы

| Статус   | Значение                        |
|----------|---------------------------------|
| закрыто  | выполнено и оплачено            |
| о+ в-    | оплачено, не выполнено          |
| о- в+    | выполнено, не оплачено          |
| о- в-    | не выполнено, не оплачено       |
