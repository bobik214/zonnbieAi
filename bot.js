const TelegramBot = require('node-telegram-bot-api');
const https = require('https');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const bot = new TelegramBot(config.BOT_TOKEN, { polling: true });

// Время запуска бота (чтобы не отвечать на старые сообщения)
const BOT_START_TIME = Date.now();

console.log('✅ Бот запущен...');

// ==================== ХРАНИЛИЩЕ ====================

function loadSettings() {
    const f = path.join(__dirname, config.USER_SETTINGS_FILE);
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
    return {};
}

function saveSettings(s) {
    fs.writeFileSync(path.join(__dirname, config.USER_SETTINGS_FILE), JSON.stringify(s, null, 2), 'utf8');
}

function getUserModel(uid) {
    return loadSettings()[uid]?.model || config.DEFAULT_MODEL;
}

function setUserModel(uid, model) {
    const s = loadSettings();
    if (!s[uid]) s[uid] = {};
    s[uid].model = model;
    saveSettings(s);
}

function getModelInfo(id) {
    return config.MODELS.find(m => m.id === id) || { name: id, desc: "" };
}

function getAdminApiKey() {
    const s = loadSettings();
    return s.admin?.api_key || config.GOOGLE_API_KEY;
}

function setAdminApiKey(key) {
    const s = loadSettings();
    if (!s.admin) s.admin = {};
    s.admin.api_key = key;
    saveSettings(s);
}

const userStates = {};
function setUserState(uid, state, data = {}) { userStates[uid] = { state, data }; }
function getUserState(uid) { return userStates[uid] || { state: null, data: {} }; }
function clearUserState(uid) { delete userStates[uid]; }

// ==================== КЛАВИАТУРЫ ====================

// Главное меню (первая кнопка - Главное меню)
function replyKB(isAdmin) {
    const kb = {
        keyboard: [
            [{ text: "🏠 Главное меню" }],
            [{ text: "💬 Задать вопрос" }, { text: "🤖 Выбрать модель" }],
            [{ text: "📖 Помощь" }],
        ],
        resize_keyboard: true,
        one_time_keyboard: false
    };
    if (isAdmin) {
        kb.keyboard.push([{ text: "⚙️ Админ-панель" }]);
    }
    return kb;
}

// Клавиатура главного меню (inline)
function mainMenuKB() {
    return {
        inline_keyboard: [
            [{ text: "💬 Задать вопрос", callback_data: "menu_ask" }],
            [{ text: "🤖 Выбрать модель", callback_data: "menu_models" }],
            [{ text: "📖 Помощь", callback_data: "menu_help" }],
        ]
    };
}

function modelsKB() {
    const btns = config.MODELS.map(m => [{ text: m.name, callback_data: `model_${m.id}` }]);
    return { inline_keyboard: btns };
}

function adminKB() {
    return {
        inline_keyboard: [
            [{ text: "🔑 Вставить API ключ", callback_data: "admin_set_api" }],
            [{ text: "⬅️ Назад", callback_data: "close_admin" }],
        ]
    };
}

// ==================== GOOGLE AI ЗАПРОС ====================

function askGoogle(question, userId) {
    return new Promise((resolve) => {
        const model = getUserModel(userId);
        const apiKey = getAdminApiKey();

        console.log(`🔍 Запрос: модель=${model}, ключ=${apiKey ? apiKey.substring(0, 8) + '...' : 'НЕ УСТАНОВЛЕН'}`);

        const postData = JSON.stringify({
            contents: [{ parts: [{ text: question }] }],
            systemInstruction: { parts: [{ text: "Ты полезный помощник. Отвечай на русском языке, кратко и по делу." }] },
            generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
        });

        const reqUrl = `${config.GOOGLE_API_URL}/${model}:generateContent?key=${apiKey}`;
        const url = new URL(reqUrl);

        const options = {
            hostname: url.hostname, port: 443,
            path: url.pathname + url.search, method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    console.log(`📡 Ответ API: статус=${res.statusCode}`, JSON.stringify(data).substring(0, 200));

                    if (res.statusCode === 200 && data.candidates?.[0]?.content?.parts?.[0]?.text) {
                        resolve({ success: true, text: data.candidates[0].content.parts[0].text });
                    } else if (res.statusCode === 429) {
                        resolve({ success: false, text: "⏰ Много запросов. Подожди минуту." });
                    } else {
                        const errMsg = data.error?.message || 'Неизвестная ошибка';
                        console.error(`❌ API Error: ${res.statusCode} - ${errMsg}`);
                        resolve({ success: false, text: `⚠️ Ошибка API: ${errMsg}` });
                    }
                } catch (e) {
                    console.error('❌ Parse error:', e.message);
                    resolve({ success: false, text: "⚠️ Ошибка обработки ответа." });
                }
            });
        });

        req.on('error', (e) => {
            console.error('❌ Network error:', e.message);
            resolve({ success: false, text: "⚠️ Ошибка сети." });
        });
        req.setTimeout(60000, () => { req.abort(); resolve({ success: false, text: "⏰ Долго думаю..." }); });
        req.write(postData);
        req.end();
    });
}

// ==================== КОМАНДЫ ====================

bot.onText(/\/start/, (msg) => {
    const model = getUserModel(msg.from.id);
    const mi = getModelInfo(model);
    const isAdmin = msg.from.username === config.ADMIN_USERNAME;
    bot.sendMessage(msg.chat.id,
        `👋 Привет, ${msg.from.first_name}!\n\n` +
        `🧠 Я твой карманный помощник.\n` +
        `⚡ Модель: *${mi.name}*\n\n` +
        `Напиши вопрос — и я помогу!`,
        { reply_markup: replyKB(isAdmin), parse_mode: "Markdown" }
    );
});

bot.onText(/\/help/, (msg) => sendHelp(msg));
bot.onText(/\/cancel/, (msg) => {
    clearUserState(msg.from.id);
    const isAdmin = msg.from.username === config.ADMIN_USERNAME;
    bot.sendMessage(msg.chat.id, "❌ Отменено.", { reply_markup: replyKB(isAdmin) });
});

function sendHelp(msg) {
    const isAdmin = msg.from.username === config.ADMIN_USERNAME;
    bot.sendMessage(msg.chat.id,
        `📖 *Как пользоваться*\n\n` +
        `💬 *В личке* — просто напиши вопрос\n` +
        `👥 *В чате* — начни с точки: .вопрос\n\n` +
        `*Примеры:*\n` +
        `• Сколько лап у паука?\n` +
        `• Столица Франции?\n` +
        `• Помоги с кодом на Python\n\n` +
        `🚀 Просто напиши — и я помогу!`,
        { reply_markup: replyKB(isAdmin), parse_mode: "Markdown" }
    );
}

// ==================== ТЕКСТОВЫЕ КНОПКИ ====================

bot.on('text', async (msg) => {
    if (msg.text?.startsWith('/')) return;
    const isAdmin = msg.from.username === config.ADMIN_USERNAME;

    if (msg.text === '🏠 Главное меню') {
        const model = getUserModel(msg.from.id);
        const mi = getModelInfo(model);
        await bot.sendMessage(msg.chat.id,
            `🏠 *Главное меню*\n\n` +
            `🧠 Текущая модель: *${mi.name}*\n\n` +
            `Выбери действие:`,
            { reply_markup: mainMenuKB(), parse_mode: "Markdown" });
        return;
    }

    if (msg.text === '💬 Задать вопрос') {
        const isP = msg.chat.type === 'private';
        const txt = isP
            ? `✏️ Напиши свой вопрос!\n\nПример: Сколько лап у паука?`
            : `✏️ Напиши *.вопрос* (с точкой в начале)!\n\nПример: \`.сколько лап у паука?\``;
        await bot.sendMessage(msg.chat.id, txt, { reply_markup: replyKB(isAdmin), parse_mode: "Markdown" });
        return;
    }

    if (msg.text === '🤖 Выбрать модель') {
        await bot.sendMessage(msg.chat.id, `🤖 *Выбери модель:*\n\n` +
            config.MODELS.map(m => `*${m.name}*\n${m.desc}`).join('\n'),
            { reply_markup: modelsKB(), parse_mode: "Markdown" });
        return;
    }

    if (msg.text === '📖 Помощь') {
        sendHelp(msg);
        return;
    }

    if (msg.text === '⚙️ Админ-панель') {
        if (!isAdmin) return;
        await bot.sendMessage(msg.chat.id, "⚙️ Админ-панель:", { reply_markup: adminKB() });
        return;
    }
});

// ==================== INLINE КНОПКИ ====================

bot.on('callback_query', async (cq) => {
    const msg = cq.message;
    const chatId = msg.chat.id;
    const mid = msg.message_id;
    const data = cq.data;
    const uid = cq.from.id;
    const uname = cq.from.username;
    const isAdmin = uname === config.ADMIN_USERNAME;

    try {
        switch (data) {
            case 'menu_ask':
                await bot.deleteMessage(chatId, mid);
                const isP = msg.chat.type === 'private';
                const askTxt = isP
                    ? `✏️ Напиши свой вопрос!\n\nПример: Сколько лап у паука?`
                    : `✏️ Напиши *.вопрос* (с точкой в начале)!\n\nПример: \`.сколько лап у паука?\``;
                await bot.sendMessage(chatId, askTxt, { parse_mode: "Markdown" });
                bot.answerCallbackQuery(cq.id);
                break;

            case 'menu_models':
                await bot.deleteMessage(chatId, mid);
                await bot.sendMessage(chatId, `🤖 *Выбери модель:*\n\n` +
                    config.MODELS.map(m => `*${m.name}*\n${m.desc}`).join('\n'),
                    { reply_markup: modelsKB(), parse_mode: "Markdown" });
                bot.answerCallbackQuery(cq.id);
                break;

            case 'menu_help':
                await bot.deleteMessage(chatId, mid);
                await bot.sendMessage(chatId,
                    `📖 *Как пользоваться*\n\n` +
                    `💬 *В личке* — просто напиши вопрос\n` +
                    `👥 *В чате* — начни с точки: .вопрос\n\n` +
                    `*Примеры:*\n` +
                    `• Сколько лап у паука?\n` +
                    `• Столица Франции?\n` +
                    `• Помоги с кодом на Python\n\n` +
                    `🚀 Просто напиши — и я помогу!`,
                    { reply_markup: replyKB(isAdmin), parse_mode: "Markdown" });
                bot.answerCallbackQuery(cq.id);
                break;

            case 'admin':
                if (!isAdmin) { bot.answerCallbackQuery(cq.id, { text: "Нет доступа!", show_alert: true }); return; }
                await bot.deleteMessage(chatId, mid);
                await bot.sendMessage(chatId, "⚙️ Админ-панель:", { reply_markup: adminKB() });
                bot.answerCallbackQuery(cq.id);
                break;

            case 'admin_set_api':
                if (!isAdmin) { bot.answerCallbackQuery(cq.id, { text: "Нет доступа!", show_alert: true }); return; }
                await bot.deleteMessage(chatId, mid);
                await bot.sendMessage(chatId, "🔑 Отправь новый Google API ключ:\n(/cancel — отмена)");
                setUserState(uid, 'wait_api');
                bot.answerCallbackQuery(cq.id, { text: "Введи ключ" });
                break;

            case 'close_admin':
                if (!isAdmin) return;
                await bot.deleteMessage(chatId, mid);
                bot.answerCallbackQuery(cq.id, { text: "Закрыто" });
                break;

            case 'retry_question': {
                const lq = userStates[uid]?.lastQuestion;
                if (!lq) { bot.answerCallbackQuery(cq.id, { text: "Нет вопроса", show_alert: true }); return; }
                await bot.deleteMessage(chatId, mid);
                const th = await bot.sendMessage(chatId, "⏳ Повтор...");
                const res = await askGoogle(lq, uid);
                if (res.success) {
                    await bot.deleteMessage(chatId, th.message_id);
                    await bot.sendMessage(chatId, res.text, { reply_markup: replyKB(isAdmin) });
                } else {
                    try {
                        await bot.editMessageText(res.text, { chat_id: chatId, message_id: th.message_id });
                    } catch {
                        await bot.sendMessage(chatId, res.text);
                    }
                }
                bot.answerCallbackQuery(cq.id, { text: "Повтор" });
                break;
            }

            default:
                if (data.startsWith('model_')) {
                    const mid2 = data.replace('model_', '');
                    setUserModel(uid, mid2);
                    const m = config.MODELS.find(x => x.id === mid2);
                    await bot.deleteMessage(chatId, mid).catch(() => {});
                    await bot.sendMessage(chatId, `✅ Выбрано: *${m.name}*`, {
                        reply_markup: replyKB(isAdmin), parse_mode: "Markdown"
                    });
                    bot.answerCallbackQuery(cq.id, { text: `Выбрано: ${m.name}` });
                }
                break;
        }
    } catch (e) {
        console.error('CB error:', e);
    }
});

// ==================== СООБЩЕНИЯ ====================

bot.on('message', async (msg) => {
    if (msg.text?.startsWith('/')) return;

    // Не отвечать на сообщения, отправленные до запуска бота
    if (msg.date * 1000 < BOT_START_TIME - 5000) {
        return;
    }

    const st = getUserState(msg.from.id);
    if (st.state === 'wait_api') {
        const isAdmin = msg.from.username === config.ADMIN_USERNAME;
        if (!isAdmin) return;
        
        const key = msg.text.trim();
        if (!key) { bot.sendMessage(msg.chat.id, "Пусто. /cancel"); return; }
        setAdminApiKey(key);
        clearUserState(msg.from.id);
        bot.sendMessage(msg.chat.id, `✅ API ключ обновлён!`, { reply_markup: replyKB(isAdmin) });
        return;
    }

    if (!msg.text) return;

    const text = msg.text.trim();
    const isPrivate = msg.chat.type === 'private';
    let question = text;

    if (!isPrivate) {
        if (!text.startsWith('.')) return;
        question = text.substring(1).trim();
    }

    if (!question) {
        if (!isPrivate) bot.sendMessage(msg.chat.id, "✏️ Напиши *.вопрос*", { parse_mode: "Markdown" });
        return;
    }

    const uid = msg.from.id;
    userStates[uid] = userStates[uid] || {};
    userStates[uid].lastQuestion = question;

    const th = await bot.sendMessage(msg.chat.id, "⏳ Думаю...");
    const result = await askGoogle(question, uid);

    try {
        if (result.success) {
            await bot.deleteMessage(msg.chat.id, th.message_id);
            await bot.sendMessage(msg.chat.id, result.text, { reply_markup: replyKB(msg.from.username === config.ADMIN_USERNAME) });
        } else {
            try {
                await bot.editMessageText(result.text, {
                    chat_id: msg.chat.id, message_id: th.message_id
                });
            } catch {
                await bot.sendMessage(msg.chat.id, result.text);
            }
        }
    } catch (e) {
        bot.sendMessage(msg.chat.id, result.text);
    }
});

// ==================== ОШИБКИ ====================

bot.on('polling_error', (e) => {
    if (!e.message.includes('409')) {
        console.error('Polling:', e.message);
    }
});
bot.on('error', (e) => console.error('Bot:', e.message));

// Graceful shutdown для Render
process.on('SIGINT', () => {
    console.log('⏹️ SIGINT — останавливаю бота...');
    bot.stopPolling();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('⏹️ SIGTERM — останавливаю бота...');
    bot.stopPolling();
    process.exit(0);
});
