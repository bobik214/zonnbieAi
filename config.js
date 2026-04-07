// Конфигурация бота

const config = {
    // Telegram Bot Token
    BOT_TOKEN: process.env.BOT_TOKEN || "8541388104:AAECxzzmEiM0PbQOyozsj5JWIqLSdnI3Tlo",

    // Google AI Studio API
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || "AIzaSyBcqZyh9PGfLt_X65-Z5SS_KJ4Z1Tj0-y4",
    GOOGLE_API_URL: "https://generativelanguage.googleapis.com/v1beta/models",
    DEFAULT_MODEL: "gemini-2.5-flash",

    // Доступные модели Google
    MODELS: [
        { id: "gemini-2.5-flash", name: "⚡ Gemini 2.5 Flash", desc: "Быстрая и умная — для любых задач" },
        { id: "gemini-2.5-pro", name: "🧠 Gemini 2.5 Pro", desc: "Максимальное качество, глубже думает" },
        { id: "gemini-2.0-flash", name: "💬 Gemini 2.0 Flash", desc: "Лёгкая и моментально отвечает" },
    ],

    // Админ бота (username без @)
    ADMIN_USERNAME: "tcpdog",

    // Файл для хранения настроек пользователей
    USER_SETTINGS_FILE: "user_settings.json"
};

module.exports = config;
