const axios = require("axios");


class ApiService {
    constructor(settings) {
        this.settings = settings;
        this.apiClient = null;
        this.documentLivenessApiClient = null;
    }

    getApiClient() {
        if (!this.apiClient ||
            this.apiClient.defaults.baseURL !== this.settings.SERVER_URL ||
            !this.apiClient.defaults.headers.Authorization.includes(this.settings.ACCESS_TOKEN)) {

            this.apiClient = axios.create({
                baseURL: this.settings.SERVER_URL,
                headers: {
                    Authorization: `Bearer ${this.settings.ACCESS_TOKEN}`,
                    "Content-Type": "application/json",
                },
            });
        }
        return this.apiClient;
    }

    getDocumentLivenessApiClient() {
        if (!this.documentLivenessApiClient ||
            this.documentLivenessApiClient.defaults.baseURL !== this.settings.DOCUMENT_LIVENESS_SERVER_URL ||
            !this.documentLivenessApiClient.defaults.headers.Authorization.includes(this.settings.ACCESS_TOKEN)) {

            this.documentLivenessApiClient = axios.create({
                baseURL: this.settings.DOCUMENT_LIVENESS_SERVER_URL,
                headers: {
                    Authorization: `Bearer ${this.settings.ACCESS_TOKEN}`,
                    "Content-Type": "application/json",
                },
            });
        }
        return this.documentLivenessApiClient;
    }
}

module.exports = ApiService;

