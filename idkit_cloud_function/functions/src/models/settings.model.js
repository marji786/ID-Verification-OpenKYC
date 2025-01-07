class Settings {
    constructor() {
        this.SERVER_URL = "";
        this.ACCESS_TOKEN = "";
        this.DOCUMENT_LIVENESS_SERVER_URL = "";
        this.LIVENESS_CHECK_DOCUMENT = false;
        this.sessionSiteUrl = "";
        this.api_keys = [];
        this.webhook_url = "";
        this.webhook_secret = "";
        this.webhook_enabled = false;
        this.allowedOrigins = [];
    }

    static fromFirestore(data) {
        const settings = new Settings();
        settings.SERVER_URL = data.server_url || "";
        settings.ACCESS_TOKEN = data.access_token || "";
        settings.DOCUMENT_LIVENESS_SERVER_URL = data.document_liveness_server_url || "";
        settings.LIVENESS_CHECK_DOCUMENT = data.liveness_check_document || false;
        settings.sessionSiteUrl = data.sessionSiteUrl || "";
        settings.api_keys = data.api_keys || [];
        settings.webhook_url = data.webhook_url || "";
        settings.webhook_secret = data.webhook_secret || "";
        settings.webhook_enabled = data.webhook_enabled || false;
        settings.allowedOrigins = data.allowed_origins || ['https://admin.idv.services'];
        return settings;
    }
}

module.exports = Settings;

