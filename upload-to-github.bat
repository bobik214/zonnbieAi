@echo off
chcp 65001 >nul
echo ========================================
echo   Загрузка бота на GitHub
echo ========================================
echo.

REM Проверяем git
git --version >nul 2>&1
if errorlevel 1 (
    echo [ОШИБКА] Git не установлен!
    echo.
    echo Скачай и установи отсюда: https://git-scm.com/download/win
    echo После установки перезапусти этот файл.
    echo.
    pause
    exit /b 1
)

echo [OK] Git найден
echo.

cd /d "%USERPROFILE%\Desktop\ai-bot-js"

echo Инициализация git...
git init 2>nul
echo.

echo Добавление файлов...
git add .
echo.

echo Коммит...
git commit -m "Initial commit - AI Telegram Bot" 2>nul
if errorlevel 1 (
    echo [OK] Все файлы уже закоммичены
)
echo.

echo Переименование ветки в main...
git branch -M main 2>nul
echo.

echo ========================================
echo  ТЕПЕРЬ НУЖНО СОЗДАТЬ РЕПОЗИТОРИЙ НА GITHUB
echo ========================================
echo.
echo 1. Зайди на https://github.com/new
echo 2. Имя репозитория: ai-telegram-bot
echo 3. Выбери Public
echo 4. НЕ ставь галочку на README
echo 5. Нажми Create repository
echo.
echo После создания GitHub покажет команды для push.
echo Скопируй URL своего репозитория и вставь ниже.
echo.
echo Пример URL: https://github.com/ТВОЙ_НИК/ai-telegram-bot.git
echo.

set /p REPO_URL=Вставь URL репозитория и нажми Enter: 

if "%REPO_URL%"=="" (
    echo.
    echo [ОШИБКА] URL не может быть пустым!
    echo.
    echo Введи команду вручную:
    echo   git remote add origin ТВОЙ_URL
    echo   git push -u origin main
    echo.
    pause
    exit /b 1
)

echo.
echo Подключение к репозиторию...
git remote add origin %REPO_URL% 2>nul
if errorlevel 1 (
    echo [INFO] Remote уже существует, обновляем...
    git remote set-url origin %REPO_URL%
)
echo.

echo Загрузка на GitHub...
git push -u origin main

if errorlevel 1 (
    echo.
    echo [ОШИБКА] Не удалось загрузить на GitHub.
    echo.
    echo Возможные причины:
    echo - Не авторизован в GitHub
    echo - Неверный URL репозитория
    echo.
    echo Попробуй вручную:
    echo   git push -u origin main
    echo.
) else (
    echo.
    echo ========================================
    echo   ГОТОВО! Файлы загружены на GitHub!
    echo ========================================
    echo.
    echo Теперь подключи к Render:
    echo 1. Зайди на https://render.com
    echo 2. Войди через GitHub
    echo 3. New + → Web Service
    echo 4. Выбери репозиторий ai-telegram-bot
    echo 5. Build: npm install
    echo 6. Start: node bot.js
    echo.
)

pause
