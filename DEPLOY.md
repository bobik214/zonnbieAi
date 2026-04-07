# Инструкция по деплою на TeleBotHost

## Шаг 1: Регистрация на TeleBotHost

1. Перейдите на https://telebothost.com/
2. Нажмите **Get Started**
3. Зарегистрируйтесь или войдите в аккаунт

## Шаг 2: Добавление бота

1. На дашборде нажмите **Add Bot** (или иконку `+`)
2. Введите имя бота (например: "AI Assistant")
3. Вставьте токен бота: `8541388104:AAECxzzmEiM0PbQOyozsj5JWIqLSdnI3Tlo`
4. Нажмите **Add**

## Шаг 3: Настройка кода бота

### Важно: TeleBotHost использует свой язык TBL (похож на JavaScript)

Есть два варианта деплоя:

---

### Вариант A: Использовать внешний хостинг (Рекомендуется)

Поскольку ваш бот написан на Node.js, лучше использовать хостинг с поддержкой Node.js:

#### Бесплатные хостинги для Node.js:

1. **Railway** (https://railway.app)
   - 500 часов/мес бесплатно
   - Поддержка Node.js из коробки
   - Простой деплой через GitHub

2. **Render** (https://render.com)
   - Бесплатный тариф
   - Автоматический деплой

3. **Fly.io** (https://fly.io)
   - 3 бесплатных VM
   - Поддержка Docker

---

### Вариант B: Деплой на Render (Пошаговая инструкция)

#### 1. Создайте репозиторий на GitHub

```bash
cd %USERPROFILE%\Desktop\ai-bot-js
git init
git add .
git commit -m "Initial commit"
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

#### 2. Зарегистрируйтесь на Render

1. Перейдите на https://render.com
2. Войдите через GitHub
3. Нажмите **New +** → **Web Service**

#### 3. Настройте сервис

1. Подключите ваш GitHub репозиторий
2. Заполните настройки:
   - **Name**: `ai-telegram-bot`
   - **Region**: Выберите ближайший
   - **Branch**: `main`
   - **Root Directory**: оставьте пустым
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node bot.js`

#### 4. Добавьте переменные окружения (опционально)

В разделе **Environment Variables** добавьте:
- `BOT_TOKEN` = `8541388104:AAECxzzmEiM0PbQOyozsj5JWIqLSdnI3Tlo`
- `OPENROUTER_API_KEY` = `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`

#### 5. Нажмите **Create Web Service**

Render автоматически:
- Склонирует ваш код
- Установит зависимости
- Запустит бота

---

### Вариант C: Локальный запуск (для тестов)

```bash
cd %USERPROFILE%\Desktop\ai-bot-js
npm install
node bot.js
```

Бот будет работать пока запущен терминал.

---

## Шаг 4: Проверка работы

1. Откройте вашего бота в Telegram
2. Отправьте `/start`
3. Напишите любой вопрос
4. Проверьте ответ от ИИ

---

## Файлы проекта

```
ai-bot-js/
├── bot.js              # Основной файл бота
├── config.js           # Настройки и модели
├── package.json        # Зависимости
├── user_settings.json  # Создается автоматически
└── README.md          # Документация
```

---

## Возможные проблемы и решения

### Бот не отвечает

1. Проверьте, что бот запущен
2. Проверьте логи на наличие ошибок
3. Убедитесь, что API ключ OpenRouter действителен

### Ошибка API ключа

1. В админ-панели смените API ключ
2. Убедитесь, что ключ начинается с `sk-or-v1-`

### Лимит запросов

Бесплатные модели OpenRouter имеют лимиты. Если получили ошибку 429:
- Подождите немного
- Попробуйте другую модель

---

## Полезные ссылки

- TeleBotHost: https://telebothost.com
- Render: https://render.com
- Railway: https://railway.app
- OpenRouter: https://openrouter.ai
- Документация Telegram Bot API: https://core.telegram.org/bots/api
