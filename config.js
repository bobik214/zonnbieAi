// Конфигурация бота

const config = {
    // Telegram Bot Token
    BOT_TOKEN: process.env.BOT_TOKEN || "8541388104:AAECxzzmEiM0PbQOyozsj5JWIqLSdnI3Tlo",

    // OpenRouter API
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || "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",
    OPENROUTER_API_URL: "https://openrouter.ai/api/v1/chat/completions",
    OPENROUTER_SITE_URL: "https://openrouter.ai",

    // Админ бота (username без @)
    ADMIN_USERNAME: "tcpdog",

    // Модель по умолчанию
    DEFAULT_MODEL: "google/gemma-2-9b-it:free",

    // Лучшие бесплатные модели OpenRouter
    FREE_MODELS: [
        { id: "google/gemma-2-9b-it:free", name: "✨ Gemma 2 (Google)" },
        { id: "meta-llama/llama-3.1-8b-instruct:free", name: "🦙 Llama 3.1 (Meta)" },
        { id: "mistralai/mistral-7b-instruct:free", name: "💨 Mistral 7B" },
        { id: "qwen/qwen-2-7b-instruct:free", name: "🐉 Qwen 2 (Alibaba)" },
    ],

    // Файл для хранения настроек пользователей
    USER_SETTINGS_FILE: "user_settings.json"
};

module.exports = config;
