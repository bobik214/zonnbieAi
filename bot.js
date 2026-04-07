const TelegramBot = require('node-telegram-bot-api');
const https = require('https');
const fs = require('fs');
const path = require('path');
const config = require('./config');

// Инициализация бота
const bot = new TelegramBot(config.BOT_TOKEN, { polling: true });
console.log('✅ Бот запущен...');

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

// Получаем название модели по ID
function getModelName(modelId) {
    const model = config.FREE_MODELS.find(m => m.id === modelId);
    return model ? model.name : modelId;
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

function getMainKeyboard(username, currentModel) {
    const modelName = getModelName(currentModel);
    
    const keyboard = {
        inline_keyboard: [
            [
                { text: `🤖 Модель: ${modelName}`, callback_data: "select_model" }
            ],
            [
                { text: "❓ Помощь", callback_data: "help" },
                { text: "ℹ️ О боте", callback_data: "about" }
            ],
        ]
    };
    
    // Добавляем кнопку админа если нужно
    if (username === config.ADMIN_USERNAME) {
        keyboard.inline_keyboard.push([
            { text: "⚙️ Админ-панель", callback_data: "admin" }
        ]);
    }
    
    return keyboard;
}

function getModelsKeyboard() {
    const buttons = config.FREE_MODELS.map(model => [
        { text: model.name, callback_data: `model_${model.id}` }
    ]);
    buttons.push([{ text: "⬅️ Назад в меню", callback_data: "back_to_main" }]);
    
    return { inline_keyboard: buttons };
}

function getAdminKeyboard() {
    return {
        inline_keyboard: [
            [{ text: "🔑 Сменить API ключ", callback_data: "admin_change_api" }],
            [{ text: "👁️ Показать API ключ", callback_data: "admin_show_api" }],
            [{ text: "⬅️ Назад в меню", callback_data: "back_to_main" }],
        ]
    };
}

// ==================== ОБРАБОТКА КОМАНД ====================

// Команда /start
bot.onText(/\/start/, (msg) => {
    const username = msg.from.username;
    const currentModel = getUserModel(msg.from.id);
    const modelName = getModelName(currentModel);
    
    bot.sendMessage(msg.chat.id,
        `👋 Привет, ${msg.from.first_name}!\n\n` +
        `🧠 Я ИИ-ассистент с бесплатными нейросетями.\n` +
        `⚡ Сейчас активна модель: \`${modelName}\`\n\n` +
        `💬 Просто напиши мне вопрос — и я отвечу!\n` +
        `👇 Используй кнопки для управления:`,
        { 
            reply_markup: getMainKeyboard(username, currentModel),
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
    const username = msg.from.username;
    const currentModel = getUserModel(msg.from.id);
    bot.sendMessage(msg.chat.id, "❌ Действие отменено.", {
        reply_markup: getMainKeyboard(username, currentModel)
    });
});

function sendHelpMessage(msg) {
    const chatType = msg.chat.type;
    const isPrivate = chatType === 'private';
    
    let instructionText;
    if (isPrivate) {
        instructionText = "💬 В личных сообщениях просто напиши вопрос — точка не нужна!";
    } else {
        instructionText = "💬 В чатах пиши `.вопрос` (с точкой в начале), чтобы бот ответил";
    }
    
    const helpText = 
        `📖 Как пользоваться ботом:\n\n` +
        `${instructionText}\n` +
        `🤖 Кнопка "Модель" - смена нейросети\n` +
        `⚙️ Кнопка "Админ-панель" - только для администратора\n\n` +
        `💡 Примеры вопросов:\n` +
        `• Сколько лап у паука?\n` +
        `• Какая столица Франции?\n` +
        `• Расскажи о космосе\n` +
        `• Помоги написать код на Python`;

    const username = msg.from.username;
    const currentModel = getUserModel(msg.from.id);
    bot.sendMessage(msg.chat.id, helpText, {
        reply_markup: getMainKeyboard(username, currentModel)
    });
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
                const helpMsg = await bot.sendMessage(chatId, "📖 Как пользоваться ботом:", {
                    reply_markup: getMainKeyboard(username, getUserModel(userId))
                });
                bot.answerCallbackQuery(callbackQuery.id, { text: "Справка" });
                break;

            case 'about':
                await bot.deleteMessage(chatId, messageId);
                const aboutMsg = await bot.sendMessage(chatId, 
                    `🧠 *ИИ-Ассистент*\n\n` +
                    `🔹 Бесплатные нейросети через OpenRouter\n` +
                    `🔹 4 модели на выбор\n` +
                    `🔹 Работает 24/7\n\n` +
                    `⚡ Быстро • Бесплатно • Удобно`,
                    { 
                        reply_markup: getMainKeyboard(username, getUserModel(userId)),
                        parse_mode: "Markdown"
                    }
                );
                bot.answerCallbackQuery(callbackQuery.id, { text: "О боте" });
                break;

            case 'select_model':
                await bot.deleteMessage(chatId, messageId);
                const modelMsg = await bot.sendMessage(chatId, "🤖 Выберите нейросеть:", {
                    reply_markup: getModelsKeyboard()
                });
                bot.answerCallbackQuery(callbackQuery.id, { text: "Выбор модели" });
                break;

            case 'back_to_main':
                await bot.deleteMessage(chatId, messageId);
                const currentModel = getUserModel(userId);
                const mainMsg = await bot.sendMessage(chatId, "⬅️ Главное меню:", {
                    reply_markup: getMainKeyboard(username, currentModel)
                });
                bot.answerCallbackQuery(callbackQuery.id, { text: "В меню" });
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
                bot.answerCallbackQuery(callbackQuery.id, { text: "Админ-панель" });
                break;

            case 'admin_show_api':
                if (username !== config.ADMIN_USERNAME) {
                    bot.answerCallbackQuery(callbackQuery.id, { text: "Доступ запрещен!", show_alert: true });
                    return;
                }
                const apiKey = getAdminApiKey();
                const maskedKey = apiKey.length > 15 ? `${apiKey.slice(0, 10)}...${apiKey.slice(-5)}` : apiKey;
                bot.answerCallbackQuery(callbackQuery.id, { text: "API ключ" });
                await bot.sendMessage(chatId, `🔑 Текущий API ключ:\n\`${maskedKey}\``, { parse_mode: "Markdown" });
                break;

            case 'admin_change_api':
                if (username !== config.ADMIN_USERNAME) {
                    bot.answerCallbackQuery(callbackQuery.id, { text: "Доступ запрещен!", show_alert: true });
                    return;
                }
                await bot.deleteMessage(chatId, messageId);
                await bot.sendMessage(chatId, "🔑 Отправьте новый API ключ OpenRouter:\n(Нажмите /cancel для отмены)");
                setUserState(userId, 'waiting_for_api_key');
                bot.answerCallbackQuery(callbackQuery.id, { text: "Введите новый ключ" });
                break;

            default:
                // Обработка выбора модели
                if (data.startsWith('model_')) {
                    const modelId = data.replace('model_', '');
                    setUserModel(userId, modelId);
                    
                    const model = config.FREE_MODELS.find(m => m.id === modelId);
                    const modelName = model ? model.name : modelId;
                    
                    await bot.deleteMessage(chatId, messageId);
                    const confirmMsg = await bot.sendMessage(chatId, `✅ Модель изменена на:\n*${modelName}*`, {
                        reply_markup: getMainKeyboard(username, modelId),
                        parse_mode: "Markdown"
                    });
                    bot.answerCallbackQuery(callbackQuery.id, { text: `Выбрано: ${model.name}` });
                }
                break;
        }
    } catch (error) {
        console.error('Callback error:', error);
        bot.answerCallbackQuery(callbackQuery.id, { text: "Произошла ошибка" });
    }
});

// ==================== ЗАПРОС К OPENROUTER ====================

function askOpenRouter(question, chatId, thinkingMsgId, username, userId) {
    return new Promise((resolve, reject) => {
        const userModel = getUserModel(userId);
        const apiKey = getAdminApiKey();
        
        const postData = JSON.stringify({
            model: userModel,
            messages: [
                { role: 'system', content: 'Ты полезный ИИ-ассистент. Отвечай на русском языке, если вопрос на русском. Отвечай кратко и по делу.' },
                { role: 'user', content: question },
            ],
            temperature: 0.7,
            max_tokens: 1000,
        });

        const url = new URL(config.OPENROUTER_API_URL);
        const options = {
            hostname: url.hostname,
            port: 443,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
                'HTTP-Referer': config.OPENROUTER_SITE_URL,
                'X-Title': 'AI Telegram Bot',
            }
        };

        const req = https.request(options, (res) => {
            let responseData = '';
            
            res.on('data', (chunk) => {
                responseData += chunk;
            });

            res.on('end', () => {
                try {
                    const parsedData = JSON.parse(responseData);
                    
                    if (res.statusCode === 200) {
                        if (parsedData.choices && parsedData.choices[0] && parsedData.choices[0].message) {
                            resolve({ success: true, text: parsedData.choices[0].message.content });
                        } else {
                            resolve({ success: false, text: "Получен пустой ответ от AI. Попробуйте переформулировать вопрос." });
                        }
                    } else if (res.statusCode === 401) {
                        resolve({ success: false, text: "❌ Неверный API ключ. Обратитесь к администратору." });
                    } else if (res.statusCode === 429) {
                        resolve({ success: false, text: "⏰ Лимит запросов превышен. Подождите минуту и попробуйте снова." });
                    } else {
                        const errorMsg = parsedData.error?.message || `Код ошибки: ${res.statusCode}`;
                        resolve({ success: false, text: `❌ Ошибка OpenRouter:\n${errorMsg}\n\nПопробуйте позже или смените модель.` });
                    }
                } catch (e) {
                    resolve({ success: false, text: `❌ Ошибка обработки ответа: ${e.message}` });
                }
            });
        });

        req.on('error', (error) => {
            resolve({ success: false, text: `❌ Ошибка сети: ${error.message}\nПопробуйте позже.` });
        });

        req.setTimeout(60000, () => {
            req.abort();
            resolve({ success: false, text: "⏰ Время ожидания ответа истекло. Попробуйте снова." });
        });

        req.write(postData);
        req.end();
    });
}

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
            bot.sendMessage(msg.chat.id, "🔑 Ключ не может быть пустым. Попробуйте еще раз или нажмите /cancel.");
            return;
        }

        if (!newApiKey.startsWith('sk-or-v1-') && !newApiKey.startsWith('sk-')) {
            bot.sendMessage(msg.chat.id, 
                "⚠️ Ключ не похож на API ключ OpenRouter.\n" +
                "Обычно он начинается с 'sk-or-v1-' или 'sk-'.\n" +
                "Все равно установить? (Да/Нет)"
            );
            setUserState(msg.from.id, 'confirm_invalid_api', { tempApiKey: newApiKey });
            return;
        }

        setAdminApiKey(newApiKey);
        clearUserState(msg.from.id);
        
        const maskedKey = `${newApiKey.slice(0, 10)}...${newApiKey.slice(-5)}`;
        const username = msg.from.username;
        const currentModel = getUserModel(msg.from.id);
        bot.sendMessage(msg.chat.id, 
            `✅ API ключ обновлен!\n\`${maskedKey}\``,
            { parse_mode: "Markdown", reply_markup: getMainKeyboard(username, currentModel) }
        );
        return;
    }

    if (userState.state === 'confirm_invalid_api') {
        if (msg.text.toLowerCase() === 'да') {
            setAdminApiKey(userState.data.tempApiKey);
            clearUserState(msg.from.id);
            const maskedKey = `${userState.data.tempApiKey.slice(0, 10)}...${userState.data.tempApiKey.slice(-5)}`;
            const username = msg.from.username;
            const currentModel = getUserModel(msg.from.id);
            bot.sendMessage(msg.chat.id, 
                `✅ API ключ обновлен!\n\`${maskedKey}\``,
                { parse_mode: "Markdown", reply_markup: getMainKeyboard(username, currentModel) }
            );
        } else {
            clearUserState(msg.from.id);
            bot.sendMessage(msg.chat.id, "❌ Установка API ключа отменена.");
        }
        return;
    }

    // Игнорируем не текстовые сообщения
    if (!msg.text) {
        return;
    }

    const userText = msg.text.trim();
    const chatType = msg.chat.type;
    const isPrivate = chatType === 'private';
    
    let questionText = userText;
    
    // В чатах - триггер на точку, в ЛС - без точки
    if (!isPrivate) {
        // В чатах отвечаем только на сообщения с точкой в начале
        if (!userText.startsWith('.')) {
            return;
        }
        questionText = userText.substring(1).trim();
    }
    
    if (!questionText) {
        if (!isPrivate) {
            bot.sendMessage(msg.chat.id, "✏️ Напишите вопрос после точки. Пример: `.сколько лап у паука?`", {
                parse_mode: "Markdown"
            });
        }
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

    // Запрос к OpenRouter
    const result = await askOpenRouter(questionText, chatId, thinkingMsg.message_id, msg.from.username, userId);

    try {
        if (result.success) {
            await bot.deleteMessage(chatId, thinkingMsg.message_id);
            const username = msg.from.username;
            const currentModel = getUserModel(userId);
            await bot.sendMessage(chatId, result.text, {
                reply_markup: getMainKeyboard(username, currentModel)
            });
        } else {
            await bot.editMessageText(result.text, {
                chat_id: chatId,
                message_id: thinkingMsg.message_id
            });
        }
    } catch (e) {
        console.error('Error sending response:', e);
        bot.sendMessage(chatId, result.text);
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
    console.log('\n⏹️ Остановка бота...');
    bot.stopPolling();
    process.exit(0);
});
