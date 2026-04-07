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
    DEFAULT_MODEL: "google/gemma-3n-e4b-it:free",

    // Лучшие бесплатные модели OpenRouter (актуальные 2026)
    FREE_MODELS: [
        { id: "google/gemma-3n-e4b-it:free", name: "✨ Gemma 3n (Google)" },
        { id: "meta-llama/llama-3.3-70b-instruct:free", name: "🦙 Llama 3.3 70B" },
        { id: "mistralai/mistral-small-3.1:free", name: "💨 Mistral Small 3.1" },
        { id: "deepseek/deepseek-r1:free", name: "🔥 DeepSeek R1" },
        { id: "qwen/qwen3-coder:free", name: "💻 Qwen3 Coder" },
        { id: "google/gemma-3-12b-it:free", name: "🌟 Gemma 3 12B" },
    ],

    // Файл для хранения настроек пользователей
    USER_SETTINGS_FILE: "user_settings.json"
};

module.exports = config;
