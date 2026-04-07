const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const config = require('./config');

// Инициализация бота
const bot = new TelegramBot(config.BOT_TOKEN, { polling: true });
console.log('Бот запущен...');

// ==================== ХРАНИЛИЩЕ НАСТРОЕК ====================

function loadUserSettings() {
    const settingsFile = path.join(__dirname, config.USER_SETTINGS_FILE);
    if (fs.existsSync(settingsFile)) {
        return JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    }
    return {};
}

function saveUserSettings(settings) {
    const settingsFile = path.join(__dirname, config.USER_SETTINGS_FILE);
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), 'utf8');
}

function getUserModel(userId) {
    const settings = loadUserSettings();
    return settings[userId]?.model || config.DEFAULT_MODEL;
}

function setUserModel(userId, model) {
    const settings = loadUserSettings();
    if (!settings[userId]) {
        settings[userId] = {};
    }
    settings[userId].model = model;
    saveUserSettings(settings);
}

function getAdminApiKey() {
    const settings = loadUserSettings();
    return settings.admin?.api_key || config.OPENROUTER_API_KEY;
}

function setAdminApiKey(apiKey) {
    const settings = loadUserSettings();
    if (!settings.admin) {
        settings.admin = {};
    }
    settings.admin.api_key = apiKey;
    saveUserSettings(settings);
}

// Состояния пользователей для FSM
const userStates = {};

function setUserState(userId, state, data = {}) {
    userStates[userId] = { state, data };
}

function getUserState(userId) {
    return userStates[userId] || { state: null, data: {} };
}

function clearUserState(userId) {
    delete userStates[userId];
}

// ==================== КЛАВИАТУРЫ ====================

// Конфигурация клавиатур с отслеживанием сообщений
const messageTracker = {};

function getMainKeyboard(username, chatId, msgId) {
    const keyboard = {
        inline_keyboard: [
            [{ text: "🤖 Выбрать модель", callback_data: "select_model" }],
            [{ text: "❓ Помощь", callback_data: "help" }],
        ]
    };
    
    // Добавляем кнопку админа если нужно
    if (username === config.ADMIN_USERNAME) {
        keyboard.inline_keyboard.push([{ text: "⚙️ Админ-панель", callback_data: "admin" }]);
    }
    
    return keyboard;
}

function getModelsKeyboard() {
    const buttons = config.FREE_MODELS.map(model => [
        { text: model.name, callback_data: `model_${model.id}` }
    ]);
    buttons.push([{ text: "⬅️ Назад", callback_data: "back_to_main" }]);
    
    return { inline_keyboard: buttons };
}

function getAdminKeyboard() {
    return {
        inline_keyboard: [
            [{ text: "Сменить API ключ", callback_data: "admin_change_api" }],
            [{ text: "Текущий API ключ", callback_data: "admin_show_api" }],
            [{ text: "⬅️ Назад", callback_data: "back_to_main" }],
        ]
    };
}

async function deletePreviousMenu(chatId, messageId) {
    // Удаляет предыдущее сообщение с кнопками
    if (messageId) {
        try {
            await bot.deleteMessage(chatId, messageId);
        } catch (e) {
            // Игнорируем ошибки удаления
        }
    }
}

function trackMessage(chatId, messageId) {
    // Отслеживает сообщение с кнопками для последующего удаления
    if (!messageTracker[chatId]) {
        messageTracker[chatId] = [];
    }
    messageTracker[chatId].push(messageId);
}

// ==================== ОБРАБОТКА КОМАНД ====================

// Команда /start
bot.onText(/\/start/, (msg) => {
    const username = msg.from.username;
    bot.sendMessage(msg.chat.id,
        `Привет, ${msg.from.first_name}!\n` +
        `Я ИИ-ассистент. Напишите _.вопрос_ (с точкой в начале), и я отвечу.\n\n` +
        `Пример: _.сколько лап у паука_`,
        { 
            reply_markup: getMainKeyboard(username),
            parse_mode: "Markdown"
        }
    );
});

// Команда /help
bot.onText(/\/help/, (msg) => {
    sendHelpMessage(msg);
});

// Команда /cancel
bot.onText(/\/cancel/, (msg) => {
    clearUserState(msg.from.id);
    bot.sendMessage(msg.chat.id, "Действие отменено.", {
        reply_markup: getMainKeyboard(msg.from.username)
    });
});

function sendHelpMessage(msg) {
    const helpText = 
        "Как пользоваться ботом:\n\n" +
        "1 Просто напишите мне вопрос, и я отвечу\n" +
        "2 Кнопка 'Выбрать модель' - смена AI модели\n" +
        "3 Кнопка 'Админ-панель' - только для администратора\n\n" +
        "Примеры вопросов:\n" +
        "• Сколько лап у паука?\n" +
        "• Какая столица Франции?\n" +
        "• Расскажи о космосе\n" +
        "• Помоги написать код на Python";

    bot.sendMessage(msg.chat.id, helpText);
}

// ==================== ОБРАБОТКА CALLBACK (КНОПКИ) ====================

bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const messageId = msg.message_id;
    const data = callbackQuery.data;
    const userId = callbackQuery.from.id;
    const username = callbackQuery.from.username;

    try {
        switch (data) {
            case 'help':
                await bot.deleteMessage(chatId, messageId);
                const helpMsg = await bot.sendMessage(chatId, 
                    "Как пользоваться ботом:\n\n" +
                    "1 Напишите `.вопрос` (точка в начале), и я отвечу\n" +
                    "2 Кнопка 'Выбрать модель' - смена AI модели\n" +
                    "3 Кнопка 'Админ-панель' - только для администратора\n\n" +
                    "Примеры вопросов:\n" +
                    "• `.сколько лап у паука?`\n" +
                    "• `.какая столица Франции?`\n" +
                    "• `.расскажи о космосе`\n" +
                    "• `.помоги написать код на Python`",
                    { reply_markup: getMainKeyboard(username), parse_mode: "Markdown" }
                );
                trackMessage(chatId, helpMsg.message_id);
                bot.answerCallbackQuery(callbackQuery.id);
                break;

            case 'select_model':
                await bot.deleteMessage(chatId, messageId);
                const modelMsg = await bot.sendMessage(chatId, "Выберите AI модель для ответов:", {
                    reply_markup: getModelsKeyboard()
                });
                trackMessage(chatId, modelMsg.message_id);
                bot.answerCallbackQuery(callbackQuery.id);
                break;

            case 'back_to_main':
                await bot.deleteMessage(chatId, messageId);
                const mainMsg = await bot.sendMessage(chatId, "Главное меню:", {
                    reply_markup: getMainKeyboard(username)
                });
                trackMessage(chatId, mainMsg.message_id);
                bot.answerCallbackQuery(callbackQuery.id);
                break;

            case 'admin':
                if (username !== config.ADMIN_USERNAME) {
                    bot.answerCallbackQuery(callbackQuery.id, { text: "Доступ запрещен!", show_alert: true });
                    return;
                }
                await bot.deleteMessage(chatId, messageId);
                const adminMsg = await bot.sendMessage(chatId, "⚙️ Админ-панель:", {
                    reply_markup: getAdminKeyboard()
                });
                trackMessage(chatId, adminMsg.message_id);
                bot.answerCallbackQuery(callbackQuery.id);
                break;

            case 'admin_show_api':
                if (username !== config.ADMIN_USERNAME) {
                    bot.answerCallbackQuery(callbackQuery.id, { text: "Доступ запрещен!", show_alert: true });
                    return;
                }
                const apiKey = getAdminApiKey();
                const maskedKey = apiKey.length > 15 ? `${apiKey.slice(0, 10)}...${apiKey.slice(-5)}` : apiKey;
                bot.answerCallbackQuery(callbackQuery.id, { text: "API ключ показан", show_alert: false });
                await bot.sendMessage(chatId, `Текущий API ключ:\n\`${maskedKey}\``, { parse_mode: "Markdown" });
                break;

            case 'admin_change_api':
                if (username !== config.ADMIN_USERNAME) {
                    bot.answerCallbackQuery(callbackQuery.id, { text: "Доступ запрещен!", show_alert: true });
                    return;
                }
                await bot.deleteMessage(chatId, messageId);
                await bot.sendMessage(chatId, "Отправьте новый API ключ OpenRouter:\n(Нажмите /cancel для отмены)");
                setUserState(userId, 'waiting_for_api_key');
                bot.answerCallbackQuery(callbackQuery.id, { text: "Введите новый API ключ" });
                break;

            default:
                // Обработка выбора модели
                if (data.startsWith('model_')) {
                    const modelId = data.replace('model_', '');
                    setUserModel(userId, modelId);
                    
                    const model = config.FREE_MODELS.find(m => m.id === modelId);
                    const modelName = model ? model.name : modelId;
                    
                    await bot.deleteMessage(chatId, messageId);
                    const confirmMsg = await bot.sendMessage(chatId, `✅ Модель изменена на: **${modelName}**`, {
                        reply_markup: getMainKeyboard(username),
                        parse_mode: "Markdown"
                    });
                    trackMessage(chatId, confirmMsg.message_id);
                    bot.answerCallbackQuery(callbackQuery.id, { text: `Выбрано: ${modelName}` });
                }
                break;
        }
    } catch (error) {
        console.error('Callback error:', error);
        bot.answerCallbackQuery(callbackQuery.id, { text: "Произошла ошибка" });
    }
});

// ==================== ОБРАБОТКА СООБЩЕНИЙ ====================

bot.on('message', async (msg) => {
    // Игнорируем команды
    if (msg.text && msg.text.startsWith('/')) {
        return;
    }

    // Проверяем состояние пользователя (ожидание API ключа)
    const userState = getUserState(msg.from.id);
    if (userState.state === 'waiting_for_api_key') {
        const newApiKey = msg.text.trim();
        
        if (!newApiKey) {
            bot.sendMessage(msg.chat.id, "Ключ не может быть пустым. Попробуйте еще раз или нажмите /cancel.");
            return;
        }

        // Проверяем формат ключа
        if (!newApiKey.startsWith('sk-or-v1-') && !newApiKey.startsWith('sk-')) {
            bot.sendMessage(msg.chat.id, 
                "Ключ не похож на API ключ OpenRouter.\n" +
                "Обычно он начинается с 'sk-or-v1-' или 'sk-'.\n" +
                "Все равно установить? (Да/Нет)"
            );
            setUserState(msg.from.id, 'confirm_invalid_api', { tempApiKey: newApiKey });
            return;
        }

        setAdminApiKey(newApiKey);
        clearUserState(msg.from.id);
        
        const maskedKey = `${newApiKey.slice(0, 10)}...${newApiKey.slice(-5)}`;
        bot.sendMessage(msg.chat.id, 
            `API ключ успешно обновлен!\nКлюч: \`${maskedKey}\``,
            { parse_mode: "Markdown", reply_markup: getAdminKeyboard() }
        );
        return;
    }

    // Подтверждение невалидного API ключа
    if (userState.state === 'confirm_invalid_api') {
        if (msg.text.toLowerCase() === 'да') {
            setAdminApiKey(userState.data.tempApiKey);
            clearUserState(msg.from.id);
            const maskedKey = `${userState.data.tempApiKey.slice(0, 10)}...${userState.data.tempApiKey.slice(-5)}`;
            bot.sendMessage(msg.chat.id, 
                `API ключ успешно обновлен!\nКлюч: \`${maskedKey}\``,
                { parse_mode: "Markdown", reply_markup: getAdminKeyboard() }
            );
        } else {
            clearUserState(msg.from.id);
            bot.sendMessage(msg.chat.id, "Установка API ключа отменена.", {
                reply_markup: getAdminKeyboard()
            });
        }
        return;
    }

    // Игнорируем не текстовые сообщения
    if (!msg.text) {
        return;
    }

    const userText = msg.text.trim();
    
    // ТРИГГЕР НА ТОЧКУ - отвечаем только на сообщения с '.' в начале
    if (!userText.startsWith('.')) {
        return; // Игнорируем сообщения без точки
    }

    // Убираем точку из текста
    const questionText = userText.substring(1).trim();
    
    if (!questionText) {
        bot.sendMessage(msg.chat.id, "Напишите вопрос после точки. Пример: `.сколько лап у паука?`", {
            parse_mode: "Markdown"
        });
        return;
    }

    const chatId = msg.chat.id;
    const userId = msg.from.id;

    // Отправляем сообщение "Думаю..."
    let thinkingMsg;
    try {
        thinkingMsg = await bot.sendMessage(chatId, "⏳ Думаю...");
    } catch (e) {
        console.error('Error sending thinking message:', e);
        return;
    }

    // Получаем модель пользователя и актуальный API ключ
    const userModel = getUserModel(userId);
    const apiKey = getAdminApiKey();

    try {
        const response = await fetch(config.OPENROUTER_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': config.OPENROUTER_SITE_URL,
                'X-Title': 'AI Telegram Bot',
            },
            body: JSON.stringify({
                model: userModel,
                messages: [
                    { role: 'system', content: 'Ты полезный ИИ-ассистент. Отвечай на русском языке, если вопрос на русском.' },
                    { role: 'user', content: questionText },
                ],
                temperature: 0.7,
                max_tokens: 1000,
            })
        });

        if (response.status === 200) {
            const data = await response.json();
            
            if (data.choices && data.choices[0] && data.choices[0].message) {
                const aiResponse = data.choices[0].message.content;
                
                // Удаляем "Думаю..." и отправляем ответ
                try {
                    await bot.deleteMessage(chatId, thinkingMsg.message_id);
                } catch (e) {}
                
                await bot.sendMessage(chatId, aiResponse, {
                    reply_markup: getMainKeyboard(msg.from.username)
                });
            } else {
                await bot.editMessageText("Получен пустой ответ от AI. Попробуйте другой вопрос.", {
                    chat_id: chatId,
                    message_id: thinkingMsg.message_id
                });
            }
        } else if (response.status === 401) {
            await bot.editMessageText("❌ Ошибка: Неверный API ключ. Обратитесь к администратору.", {
                chat_id: chatId,
                message_id: thinkingMsg.message_id
            });
        } else if (response.status === 429) {
            await bot.editMessageText("⏰ Превышен лимит запросов. Подождите немного и попробуйте снова.", {
                chat_id: chatId,
                message_id: thinkingMsg.message_id
            });
        } else {
            const errorData = await response.json().catch(() => ({}));
            const errorMsg = errorData.error?.message || `Код ошибки: ${response.status}`;
            await bot.editMessageText(`❌ Ошибка при запросе к OpenRouter:\n${errorMsg}\n\nПопробуйте позже или смените модель.`, {
                chat_id: chatId,
                message_id: thinkingMsg.message_id
            });
            console.error(`OpenRouter error: ${response.status}`, errorData);
        }
    } catch (error) {
        try {
            await bot.editMessageText(`❌ Ошибка сети: ${error.message}\nПопробуйте позже.`, {
                chat_id: chatId,
                message_id: thinkingMsg.message_id
            });
        } catch (e) {
            bot.sendMessage(chatId, `❌ Ошибка: ${error.message}`);
        }
        console.error('OpenRouter request error:', error);
    }
});

// ==================== ОБРАБОТКА ОШИБОК ====================

bot.on('polling_error', (error) => {
    console.error('Polling error:', error.message);
});

bot.on('error', (error) => {
    console.error('Bot error:', error.message);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Остановка бота...');
    bot.stopPolling();
    process.exit(0);
});
