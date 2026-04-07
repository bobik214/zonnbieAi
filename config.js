const config = {
    BOT_TOKEN: process.env.BOT_TOKEN || "8541388104:AAECxzzmEiM0PbQOyozsj5JWIqLSdnI3Tlo",
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || "",
    GOOGLE_API_URL: "https://generativelanguage.googleapis.com/v1beta/models",
    DEFAULT_MODEL: "gemini-2.0-flash",

    MODELS: [
        { id: "gemini-2.0-flash", name: "⚡ Flash", desc: "Быстрая — для простых вопросов" },
        { id: "gemini-2.5-pro", name: "🧠 Pro", desc: "Умная — для сложных задач" },
    ],

    ADMIN_USERNAME: "tcpdog",
    USER_SETTINGS_FILE: "user_settings.json"
};

module.exports = config;
