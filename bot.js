const TelegramBot = require('node-telegram-bot-api');
const https = require('https');
const fs = require('fs');
const path = require('path');
const config = require('./config');

// Инициализация бота
const bot = new TelegramBot(config.BOT_TOKEN, { polling: true });
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
    return config.MODELS.find(m => m.id === id) || { name: id, desc: "Описание" };
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

// Состояния
const userStates = {};
function setUserState(uid, state, data = {}) { userStates[uid] = { state, data }; }
function getUserState(uid) { return userStates[uid] || { state: null, data: {} }; }
function clearUserState(uid) { delete userStates[uid]; }

// ==================== КЛАВИАТУРЫ ====================

function mainKB(username, modelId) {
    const kb = {
        inline_keyboard: [
            [{ text: "💬 Задать вопрос", callback_data: "prompt_help" }],
            [{ text: "🤖 Модель", callback_data: "select_model" },
             { text: "📖 Помощь", callback_data: "help" }],
        ]
    };
    if (username === config.ADMIN_USERNAME) {
        kb.inline_keyboard.push([{ text: "⚙️ Админ", callback_data: "admin" }]);
    }
    return kb;
}

// Постоянная нижняя панель
function replyKB() {
    return {
        keyboard: [
            [{ text: "🤖 Модель" }, { text: "📖 Помощь" }],
            [{ text: "💬 Задать вопрос" }],
        ],
        resize_keyboard: true,
        persistent: true,
        one_time_keyboard: false,
        input_field_placeholder: "Напиши вопрос или выбери кнопку..."
    };
}

function modelsKB() {
    const btns = config.MODELS.map(m => [{ text: m.name, callback_data: `model_${m.id}` }]);
    btns.push([{ text: "⬅️ Назад", callback_data: "back_to_main" }]);
    return { inline_keyboard: btns };
}

function adminKB() {
    return {
        inline_keyboard: [
            [{ text: "🔑 Сменить API ключ", callback_data: "admin_change_api" }],
            [{ text: "👁️ Показать API", callback_data: "admin_show_api" }],
            [{ text: "⬅️ Назад", callback_data: "back_to_main" }],
        ]
    };
}

function errorKB(uid) {
    const mi = getModelInfo(getUserModel(uid));
    return {
        inline_keyboard: [
            [{ text: `🔄 Сменить модель (${mi.name})`, callback_data: "select_model" }],
            [{ text: "🔁 Повторить", callback_data: "retry_question" }],
            [{ text: "⬅️ В меню", callback_data: "back_to_main" }],
        ]
    };
}

// ==================== ЗАПРОС К GOOGLE AI ====================

function askGoogle(question, userId) {
    return new Promise((resolve) => {
        const model = getUserModel(userId);
        const apiKey = getAdminApiKey();
        
        const postData = JSON.stringify({
            contents: [{
                parts: [{ text: question }]
            }],
            systemInstruction: {
                parts: [{ text: "Ты полезный помощник. Отвечай на русском языке, кратко и по делу." }]
            },
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 2048,
            }
        });

        const reqUrl = `${config.GOOGLE_API_URL}/${model}:generateContent?key=${apiKey}`;
        const url = new URL(reqUrl);

        const options = {
            hostname: url.hostname,
            port: 443,
            path: url.pathname + url.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    
                    if (res.statusCode === 200 && data.candidates?.[0]?.content?.parts?.[0]?.text) {
                        resolve({ success: true, text: data.candidates[0].content.parts[0].text });
                    } else if (res.statusCode === 429) {
                        resolve({ success: false, text: "⏰ Лимит запросов. Подожди минуту." });
                    } else if (res.statusCode === 403) {
                        resolve({ success: false, text: "❌ Неверный API ключ. Напиши админу." });
                    } else if (res.statusCode === 404) {
                        resolve({ success: false, text: `❌ Модель "${model}" не найдена.\n\nВыбери другую модель.` });
                    } else {
                        const err = data.error?.message || `Код: ${res.statusCode}`;
                        resolve({ success: false, text: `❌ Ошибка:\n${err}` });
                    }
                } catch (e) {
                    resolve({ success: false, text: `Ошибка обработки: ${e.message}` });
                }
            });
        });

        req.on('error', (e) => resolve({ success: false, text: `❌ Ошибка сети: ${e.message}` }));
        req.setTimeout(60000, () => { req.abort(); resolve({ success: false, text: "⏰ Время истекло." }); });
        req.write(postData);
        req.end();
    });
}

// ==================== КОМАНДЫ ====================

bot.onText(/\/start/, (msg) => {
    const model = getUserModel(msg.from.id);
    const mi = getModelInfo(model);
    bot.sendMessage(msg.chat.id,
        `👋 Привет, ${msg.from.first_name}!\n\n` +
        `🧠 Я твой карманный помощник.\n` +
        `⚡ Сейчас: *${mi.name}*\n\n` +
        `💬 Напиши вопрос — и я помогу!\n` +
        `👇 Кнопки внизу всегда доступны:`,
        { reply_markup: mainKB(msg.from.username, model), parse_mode: "Markdown" }
    );
});

bot.onText(/\/help/, (msg) => sendHelp(msg));

bot.onText(/\/cancel/, (msg) => {
    clearUserState(msg.from.id);
    bot.sendMessage(msg.chat.id, "❌ Отменено.", {
        reply_markup: mainKB(msg.from.username, getUserModel(msg.from.id))
    });
});

function sendHelp(msg) {
    const isPrivate = msg.chat.type === 'private';
    const tip = isPrivate
        ? "💬 В личке — просто напиши вопрос"
        : "💬 В чатах — начни с точки: `.вопрос`";

    bot.sendMessage(msg.chat.id,
        `📖 Справка:\n\n` +
        `${tip}\n\n` +
        `🔹 *Модель* — выбор нейросети\n` +
        `🔹 *Помощь* — эта справка\n\n` +
        `💡 Примеры:\n` +
        `• Сколько лап у паука?\n` +
        `• Столица Франции?\n` +
        `• Помоги с кодом на Python`,
        { reply_markup: replyKB(), parse_mode: "Markdown" }
    );
}

// ==================== ТЕКСТОВЫЕ КНОПКИ (нижняя панель) ====================

bot.on('text', async (msg) => {
    if (msg.text?.startsWith('/')) return;
    if (msg.text === '🤖 Модель') {
        const list = config.MODELS.map((m, i) => `*${m.name}*\n${m.desc}`).join('\n\n');
        await bot.sendMessage(msg.chat.id, `🤖 Модели:\n\n${list}\n\nВыбери:`, {
            reply_markup: modelsKB(), parse_mode: "Markdown"
        });
        return;
    }
    if (msg.text === '📖 Помощь') {
        sendHelp(msg);
        return;
    }
    if (msg.text === '💬 Задать вопрос') {
        const isP = msg.chat.type === 'private';
        const txt = isP
            ? `✏️ Напиши любой вопрос!\n\nПримеры:\n• Сколько лап у паука?\n• Расскажи о космосе`
            : `✏️ Напиши *.вопрос* (с точкой)!\n\nПример:\n• \`.сколько лап у паука?\``;
        await bot.sendMessage(msg.chat.id, txt, { reply_markup: replyKB(), parse_mode: "Markdown" });
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

    try {
        switch (data) {
            case 'prompt_help': {
                const isP = msg.chat.type === 'private';
                const txt = isP
                    ? `✏️ Напиши любой вопрос в чат!\n\nПримеры:\n• Сколько лап у паука?\n• Расскажи о космосе\n• Помоги с задачей`
                    : `✏️ Напиши *.вопрос* (с точкой)!\n\nПримеры:\n• \`.сколько лап у паука?\`\n• \`.расскажи о космосе\``;
                await bot.deleteMessage(chatId, mid);
                await bot.sendMessage(chatId, txt, { reply_markup: mainKB(uname, getUserModel(uid)), parse_mode: "Markdown" });
                bot.answerCallbackQuery(cq.id, { text: "Подсказка" });
                break;
            }

            case 'help':
                await bot.deleteMessage(chatId, mid);
                sendHelp({ chat: msg.chat, from: cq.from });
                bot.answerCallbackQuery(cq.id, { text: "Справка" });
                break;

            case 'select_model': {
                await bot.deleteMessage(chatId, mid);
                const list = config.MODELS.map((m, i) => `*${m.name}*\n${m.desc}`).join('\n\n');
                await bot.sendMessage(chatId, `🤖 Модели:\n\n${list}\n\nВыбери кнопку:`, {
                    reply_markup: modelsKB(), parse_mode: "Markdown"
                });
                bot.answerCallbackQuery(cq.id, { text: "Выбор модели" });
                break;
            }

            case 'back_to_main':
                await bot.deleteMessage(chatId, mid).catch(() => {});
                await bot.sendMessage(chatId, "🏠 Меню:", { reply_markup: replyKB() });
                bot.answerCallbackQuery(cq.id, { text: "В меню" });
                break;

            case 'admin':
                if (uname !== config.ADMIN_USERNAME) {
                    bot.answerCallbackQuery(cq.id, { text: "Доступ запрещён!", show_alert: true });
                    return;
                }
                await bot.deleteMessage(chatId, mid);
                await bot.sendMessage(chatId, "⚙️ Админ-панель:", { reply_markup: adminKB() });
                bot.answerCallbackQuery(cq.id, { text: "Админ" });
                break;

            case 'admin_show_api':
                if (uname !== config.ADMIN_USERNAME) { bot.answerCallbackQuery(cq.id, { text: "Нет доступа!", show_alert: true }); return; }
                const k = getAdminApiKey();
                const mk = k.length > 15 ? `${k.slice(0,8)}...${k.slice(-4)}` : k;
                bot.answerCallbackQuery(cq.id, { text: "API ключ" });
                await bot.sendMessage(chatId, `🔑 API:\n\`${mk}\``, { parse_mode: "Markdown" });
                break;

            case 'admin_change_api':
                if (uname !== config.ADMIN_USERNAME) { bot.answerCallbackQuery(cq.id, { text: "Нет доступа!", show_alert: true }); return; }
                await bot.deleteMessage(chatId, mid);
                await bot.sendMessage(chatId, "🔑 Отправь новый API ключ:\n(/cancel — отмена)");
                setUserState(uid, 'wait_api');
                bot.answerCallbackQuery(cq.id, { text: "Введи ключ" });
                break;

            case 'retry_question': {
                const lq = userStates[uid]?.lastQuestion;
                if (!lq) { bot.answerCallbackQuery(cq.id, { text: "Нет вопроса", show_alert: true }); return; }
                await bot.deleteMessage(chatId, mid);
                const th = await bot.sendMessage(chatId, "⏳ Повтор...");
                const res = await askGoogle(lq, uid);
                if (res.success) {
                    await bot.deleteMessage(chatId, th.message_id);
                    await bot.sendMessage(chatId, res.text, { reply_markup: mainKB(uname, getUserModel(uid)) });
                } else {
                    await bot.editMessageText(res.text, { chat_id: chatId, message_id: th.message_id, reply_markup: errorKB(uid) });
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
                    await bot.sendMessage(chatId, `✅ Выбрано: *${m.name}*\n${m.desc}\n\nЗадавай вопрос!`, {
                        reply_markup: replyKB(), parse_mode: "Markdown"
                    });
                    bot.answerCallbackQuery(cq.id, { text: `Выбрано: ${m.name}` });
                }
        }
    } catch (e) {
        console.error('CB error:', e);
    }
});

// ==================== СООБЩЕНИЯ ====================

bot.on('message', async (msg) => {
    if (msg.text?.startsWith('/')) return;

    // Ожидание API ключа
    const st = getUserState(msg.from.id);
    if (st.state === 'wait_api') {
        const key = msg.text.trim();
        if (!key) { bot.sendMessage(msg.chat.id, "Пусто. Повтори или /cancel."); return; }
        setAdminApiKey(key);
        clearUserState(msg.from.id);
        const mk = `${key.slice(0,8)}...${key.slice(-4)}`;
        bot.sendMessage(msg.chat.id, `✅ API обновлён!\n\`${mk}\``, {
            parse_mode: "Markdown", reply_markup: replyKB()
        });
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
        if (!isPrivate) bot.sendMessage(msg.chat.id, "✏️ `.вопрос` после точки", { parse_mode: "Markdown" });
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
            await bot.sendMessage(msg.chat.id, result.text, {
                reply_markup: replyKB()
            });
        } else {
            try {
                await bot.editMessageText(result.text, {
                    chat_id: msg.chat.id, message_id: th.message_id, reply_markup: errorKB(uid)
                });
            } catch {
                await bot.sendMessage(msg.chat.id, result.text, { reply_markup: errorKB(uid) });
            }
        }
    } catch (e) {
        bot.sendMessage(msg.chat.id, result.text);
    }
});

// ==================== ОШИБКИ ====================

bot.on('polling_error', (e) => console.error('Polling:', e.message));
bot.on('error', (e) => console.error('Bot:', e.message));

process.on('SIGINT', () => { bot.stopPolling(); process.exit(0); });
