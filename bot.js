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

function getModelInfo(modelId) {
    return config.FREE_MODELS.find(m => m.id === modelId) || { name: modelId, desc: "Описание недоступно" };
}

// Состояния пользователей
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
    const keyboard = {
        inline_keyboard: [
            [
                { text: "💬 Задать вопрос", callback_data: "prompt_help" }
            ],
            [
                { text: "🤖 Модель", callback_data: "select_model" },
                { text: "📖 Помощь", callback_data: "help" }
            ],
        ]
    };
    
    if (username === config.ADMIN_USERNAME) {
        keyboard.inline_keyboard.push([
            { text: "⚙️ Админ", callback_data: "admin" }
        ]);
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
            [{ text: "🔑 Сменить API ключ", callback_data: "admin_change_api" }],
            [{ text: "👁️ Показать API", callback_data: "admin_show_api" }],
            [{ text: "⬅️ Назад", callback_data: "back_to_main" }],
        ]
    };
}

// ==================== КОМАНДЫ ====================

bot.onText(/\/start/, (msg) => {
    const username = msg.from.username;
    const currentModel = getUserModel(msg.from.id);
    const modelInfo = getModelInfo(currentModel);
    
    bot.sendMessage(msg.chat.id,
        `👋 Привет, ${msg.from.first_name}!\n\n` +
        `🧠 Я твой карманный помощник с ИИ.\n` +
        `⚡ Сейчас: *${modelInfo.name}*\n\n` +
        `💬 Просто напиши вопрос — и я помогу!\n` +
        `👇 Кнопки ниже:`,
        { 
            reply_markup: getMainKeyboard(username, currentModel),
            parse_mode: "Markdown"
        }
    );
});

bot.onText(/\/help/, (msg) => {
    sendHelpMessage(msg);
});

bot.onText(/\/cancel/, (msg) => {
    clearUserState(msg.from.id);
    bot.sendMessage(msg.chat.id, "❌ Отменено.", {
        reply_markup: getMainKeyboard(msg.from.username, getUserModel(msg.from.id))
    });
});

function sendHelpMessage(msg) {
    const chatType = msg.chat.type;
    const isPrivate = chatType === 'private';
    
    const instructionText = isPrivate 
        ? "💬 В личных сообщениях — просто напиши вопрос"
        : "💬 В чатах — начни с точки: `.вопрос`";
    
    const helpText = 
        `📖 Справка:\n\n` +
        `${instructionText}\n\n` +
        `🔹 *Модель* — выбор нейросети\n` +
        `🔹 *Помощь* — эта справка\n` +
        `🔹 *Админ* — панель управления\n\n` +
        `💡 Примеры:\n` +
        `• Сколько лап у паука?\n` +
        `• Столица Франции?\n` +
        `• Помоги с кодом на Python`;

    bot.sendMessage(msg.chat.id, helpText, {
        reply_markup: getMainKeyboard(msg.from.username, getUserModel(msg.from.id)),
        parse_mode: "Markdown"
    });
}

// ==================== CALLBACK (КНОПКИ) ====================

bot.on('callback_query', async (callbackQuery) => {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const messageId = msg.message_id;
    const data = callbackQuery.data;
    const userId = callbackQuery.from.id;
    const username = callbackQuery.from.username;

    try {
        switch (data) {
            case 'prompt_help':
                const isPrivate = msg.chat.type === 'private';
                const tipText = isPrivate
                    ? `✏️ Напиши любой вопрос в чат!\n\nНапример:\n• Сколько лап у паука?\n• Расскажи о космосе`
                    : `✏️ Напиши *.вопрос* (с точкой в начале)!\n\nНапример:\n• \`.сколько лап у паука?\`\n• \`.расскажи о космосе\``;
                
                await bot.deleteMessage(chatId, messageId);
                await bot.sendMessage(chatId, tipText, {
                    reply_markup: getMainKeyboard(username, getUserModel(userId)),
                    parse_mode: "Markdown"
                });
                bot.answerCallbackQuery(callbackQuery.id, { text: "Подсказка" });
                break;

            case 'help':
                await bot.deleteMessage(chatId, messageId);
                sendHelpMessage({ chat: msg.chat, from: callbackQuery.from, chat: msg.chat });
                bot.answerCallbackQuery(callbackQuery.id, { text: "Справка" });
                break;

            case 'select_model':
                await bot.deleteMessage(chatId, messageId);
                
                // Формируем текст с описаниями моделей
                const modelsText = config.FREE_MODELS.map((m, i) => 
                    `${i + 1}. *${m.name}*\n   ${m.desc}`
                ).join('\n\n');
                
                await bot.sendMessage(chatId, `🤖 Доступные модели:\n\n${modelsText}\n\nВыбери кнопку ниже:`, {
                    reply_markup: getModelsKeyboard(),
                    parse_mode: "Markdown"
                });
                bot.answerCallbackQuery(callbackQuery.id, { text: "Выбор модели" });
                break;

            case 'back_to_main':
                await bot.deleteMessage(chatId, messageId).catch(() => {});
                await bot.sendMessage(chatId, "🏠 Главное меню:", {
                    reply_markup: getMainKeyboard(username, getUserModel(userId))
                });
                bot.answerCallbackQuery(callbackQuery.id, { text: "В меню" });
                break;

            case 'admin':
                if (username !== config.ADMIN_USERNAME) {
                    bot.answerCallbackQuery(callbackQuery.id, { text: "Доступ запрещён!", show_alert: true });
                    return;
                }
                await bot.deleteMessage(chatId, messageId);
                await bot.sendMessage(chatId, "⚙️ Админ-панель:", {
                    reply_markup: getAdminKeyboard()
                });
                bot.answerCallbackQuery(callbackQuery.id, { text: "Админ" });
                break;

            case 'admin_show_api':
                if (username !== config.ADMIN_USERNAME) {
                    bot.answerCallbackQuery(callbackQuery.id, { text: "Доступ запрещён!", show_alert: true });
                    return;
                }
                const apiKey = getAdminApiKey();
                const maskedKey = apiKey.length > 15 ? `${apiKey.slice(0, 10)}...${apiKey.slice(-5)}` : apiKey;
                bot.answerCallbackQuery(callbackQuery.id, { text: "API ключ" });
                await bot.sendMessage(chatId, `🔑 API ключ:\n\`${maskedKey}\``, { parse_mode: "Markdown" });
                break;

            case 'admin_change_api':
                if (username !== config.ADMIN_USERNAME) {
                    bot.answerCallbackQuery(callbackQuery.id, { text: "Доступ запрещён!", show_alert: true });
                    return;
                }
                await bot.deleteMessage(chatId, messageId);
                await bot.sendMessage(chatId, "🔑 Отправь новый API ключ OpenRouter:\n(/cancel — отмена)");
                setUserState(userId, 'waiting_for_api_key');
                bot.answerCallbackQuery(callbackQuery.id, { text: "Введи ключ" });
                break;

            case 'retry_question':
                const lastQuestion = userStates[userId]?.lastQuestion;
                if (!lastQuestion) {
                    bot.answerCallbackQuery(callbackQuery.id, { text: "Нет последнего вопроса", show_alert: true });
                    return;
                }
                
                await bot.deleteMessage(chatId, messageId);
                const retryThinking = await bot.sendMessage(chatId, "⏳ Повтор...");
                const retryResult = await askOpenRouter(lastQuestion, chatId, retryThinking.message_id, username, userId);
                
                try {
                    if (retryResult.success) {
                        await bot.deleteMessage(chatId, retryThinking.message_id);
                        await bot.sendMessage(chatId, retryResult.text, {
                            reply_markup: getMainKeyboard(username, getUserModel(userId))
                        });
                    } else {
                        await bot.editMessageText(retryResult.text, {
                            chat_id: chatId,
                            message_id: retryThinking.message_id,
                            reply_markup: getErrorKeyboard(userId)
                        });
                    }
                } catch (e) {
                    bot.sendMessage(chatId, retryResult.text);
                }
                bot.answerCallbackQuery(callbackQuery.id, { text: "Повтор" });
                break;

            default:
                if (data.startsWith('model_')) {
                    const modelId = data.replace('model_', '');
                    setUserModel(userId, modelId);
                    
                    const model = config.FREE_MODELS.find(m => m.id === modelId);
                    const modelName = model ? model.name : modelId;
                    
                    await bot.deleteMessage(chatId, messageId).catch(() => {});
                    
                    await bot.sendMessage(chatId, `✅ Выбрано: *${modelName}*\n${model?.desc || ''}\n\nТеперь задай вопрос!`, {
                        reply_markup: getMainKeyboard(username, modelId),
                        parse_mode: "Markdown"
                    });
                    bot.answerCallbackQuery(callbackQuery.id, { text: `Выбрано: ${model.name}` });
                }
                break;
        }
    } catch (error) {
        console.error('Callback error:', error);
        bot.answerCallbackQuery(callbackQuery.id, { text: "Ошибка" });
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
                { role: 'system', content: 'Ты полезный помощник. Отвечай на русском языке, кратко и по делу.' },
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
                'X-Title': 'AI Assistant Bot',
            }
        };

        const req = https.request(options, (res) => {
            let responseData = '';
            
            res.on('data', (chunk) => { responseData += chunk; });

            res.on('end', () => {
                try {
                    const parsedData = JSON.parse(responseData);
                    
                    if (res.statusCode === 200) {
                        if (parsedData.choices && parsedData.choices[0]?.message?.content) {
                            resolve({ success: true, text: parsedData.choices[0].message.content });
                        } else {
                            resolve({ success: false, text: "Пустой ответ. Переформулируй вопрос." });
                        }
                    } else if (res.statusCode === 401) {
                        resolve({ success: false, text: "❌ Неверный API ключ. Напиши админу." });
                    } else if (res.statusCode === 429) {
                        resolve({ success: false, text: "⏰ Лимит запросов. Подожди минуту." });
                    } else if (res.statusCode === 404) {
                        resolve({ success: false, text: `❌ Модель недоступна.\n\nНажми 🔄 Сменить модель и выбери другую.` });
                    } else {
                        const errorMsg = parsedData.error?.message || `Код: ${res.statusCode}`;
                        resolve({ success: false, text: `❌ Ошибка:\n${errorMsg}\n\nПопробуй другую модель.` });
                    }
                } catch (e) {
                    resolve({ success: false, text: `Ошибка обработки: ${e.message}` });
                }
            });
        });

        req.on('error', (error) => {
            resolve({ success: false, text: `❌ Ошибка сети: ${error.message}` });
        });

        req.setTimeout(60000, () => {
            req.abort();
            resolve({ success: false, text: "⏰ Время ожидания истекло." });
        });

        req.write(postData);
        req.end();
    });
}

// ==================== КЛАВИАТУРА ОШИБКИ ====================

function getErrorKeyboard(userId) {
    const currentModel = getUserModel(userId);
    const modelInfo = getModelInfo(currentModel);
    
    return {
        inline_keyboard: [
            [{ text: `🔄 Сменить модель (${modelInfo.name})`, callback_data: "select_model" }],
            [
                { text: "❓ Помощь", callback_data: "help" },
                { text: "🔁 Повторить", callback_data: "retry_question" }
            ],
            [{ text: "⬅️ В меню", callback_data: "back_to_main" }],
        ]
    };
}

// ==================== СООБЩЕНИЯ ====================

bot.on('message', async (msg) => {
    if (msg.text && msg.text.startsWith('/')) return;

    // Состояние ожидания API ключа
    const userState = getUserState(msg.from.id);
    if (userState.state === 'waiting_for_api_key') {
        const newApiKey = msg.text.trim();
        if (!newApiKey) {
            bot.sendMessage(msg.chat.id, "🔑 Ключ пустой. Повтори или /cancel.");
            return;
        }
        if (!newApiKey.startsWith('sk-or-v1-') && !newApiKey.startsWith('sk-')) {
            bot.sendMessage(msg.chat.id, "⚠️ Ключ не похож на OpenRouter. Установить? (Да/Нет)");
            setUserState(msg.from.id, 'confirm_invalid_api', { tempApiKey: newApiKey });
            return;
        }
        setAdminApiKey(newApiKey);
        clearUserState(msg.from.id);
        const maskedKey = `${newApiKey.slice(0, 10)}...${newApiKey.slice(-5)}`;
        bot.sendMessage(msg.chat.id, `✅ API ключ обновлён!\n\`${maskedKey}\``, {
            parse_mode: "Markdown",
            reply_markup: getMainKeyboard(msg.from.username, getUserModel(msg.from.id))
        });
        return;
    }

    if (userState.state === 'confirm_invalid_api') {
        if (msg.text.toLowerCase() === 'да') {
            setAdminApiKey(userState.data.tempApiKey);
            clearUserState(msg.from.id);
            const maskedKey = `${userState.data.tempApiKey.slice(0, 10)}...${userState.data.tempApiKey.slice(-5)}`;
            bot.sendMessage(msg.chat.id, `✅ API ключ обновлён!\n\`${maskedKey}\``, {
                parse_mode: "Markdown",
                reply_markup: getMainKeyboard(msg.from.username, getUserModel(msg.from.id))
            });
        } else {
            clearUserState(msg.from.id);
            bot.sendMessage(msg.chat.id, "❌ Отменено.");
        }
        return;
    }

    if (!msg.text) return;

    const userText = msg.text.trim();
    const isPrivate = msg.chat.type === 'private';
    
    let questionText = userText;
    
    // В чатах - триггер на точку
    if (!isPrivate) {
        if (!userText.startsWith('.')) return;
        questionText = userText.substring(1).trim();
    }
    
    if (!questionText) {
        if (!isPrivate) {
            bot.sendMessage(msg.chat.id, "✏️ Напиши `.вопрос` после точки", { parse_mode: "Markdown" });
        }
        return;
    }

    const chatId = msg.chat.id;
    const userId = msg.from.id;

    let thinkingMsg;
    try {
        thinkingMsg = await bot.sendMessage(chatId, "⏳ Думаю...");
    } catch (e) {
        return;
    }

    userStates[userId] = userStates[userId] || {};
    userStates[userId].lastQuestion = questionText;

    const result = await askOpenRouter(questionText, chatId, thinkingMsg.message_id, msg.from.username, userId);

    try {
        if (result.success) {
            await bot.deleteMessage(chatId, thinkingMsg.message_id);
            await bot.sendMessage(chatId, result.text, {
                reply_markup: getMainKeyboard(msg.from.username, getUserModel(userId))
            });
        } else {
            try {
                await bot.editMessageText(result.text, {
                    chat_id: chatId,
                    message_id: thinkingMsg.message_id,
                    reply_markup: getErrorKeyboard(userId)
                });
            } catch (e) {
                await bot.sendMessage(chatId, result.text, {
                    reply_markup: getErrorKeyboard(userId)
                });
            }
        }
    } catch (e) {
        bot.sendMessage(chatId, result.text);
    }
});

// ==================== ОШИБКИ ====================

bot.on('polling_error', (error) => {
    console.error('Polling error:', error.message);
});

bot.on('error', (error) => {
    console.error('Bot error:', error.message);
});

process.on('SIGINT', () => {
    console.log('\n⏹️ Остановка...');
    bot.stopPolling();
    process.exit(0);
});
