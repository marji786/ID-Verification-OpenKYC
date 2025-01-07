const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { getFirestore, Timestamp, FieldValue } = require("firebase-admin/firestore");
const admin = require("firebase-admin");
const axios = require("axios");
const crypto = require('crypto');

// Import your services
const ApiService = require("./src/services/api.service");
const WebhookService = require("./src/services/webhook.service");
const VerificationService = require("./src/services/verification.service");
const SessionController = require("./src/controllers/session.controller");
const ModeratorController = require("./src/controllers/moderator.controller");
const WebhookController = require("./src/controllers/webhook.controller");

// Initialize Firebase Admin
admin.initializeApp();

// Global settings object
let settings = {
  SERVER_URL: "",
  ACCESS_TOKEN: "",
  DOCUMENT_LIVENESS_SERVER_URL: "",
  LIVENESS_CHECK_DOCUMENT: false,
  sessionSiteUrl: "",
  api_keys: [],
  webhook_url: "",
  webhook_secret: "",
  webhook_enabled: false,
  allowedOrigins: ['https://admin.idv.services'],
};

// Set up settings listener immediately
const settingsRef = getFirestore().collection("settings").doc("all");
settingsRef.onSnapshot((snapshot) => {
  if (snapshot.exists) {
    const data = snapshot.data();
    settings = {
      SERVER_URL: data.server_url || "",
      ACCESS_TOKEN: data.access_token || "",
      DOCUMENT_LIVENESS_SERVER_URL: data.document_liveness_server_url || "",
      LIVENESS_CHECK_DOCUMENT: data.liveness_check_document || false,
      sessionSiteUrl: data.sessionSiteUrl || "",
      api_keys: data.api_keys || [],
      webhook_url: data.webhook_url || "",
      webhook_secret: data.webhook_secret || "",
      webhook_enabled: data.webhook_enabled || false,
      allowedOrigins: data.allowed_origins || ['https://admin.idv.services']
    };

    // Reset service instances when settings change
    initializeServices();
  }
});

let apiService;
let webhookService;
let verificationService;
let sessionController;
let moderatorController;
let webhookController;

// Function to initialize services with current settings
function initializeServices() {
  apiService = new ApiService(settings);
  webhookService = new WebhookService(settings);
  verificationService = new VerificationService(apiService, webhookService);
  sessionController = new SessionController(verificationService, webhookService, settings);
  moderatorController = new ModeratorController(settings);
  webhookController = new WebhookController(settings);
}

// Initial services initialization
initializeServices();

// Export Cloud Functions
exports.onSessionUpdate = onDocumentUpdated(
  "sessions/{sessionId}",
  (event) => sessionController.handleSessionUpdate(event.data)
);

exports.createSession = onRequest(
  (req, res) => sessionController.createSession(req, res)
);

exports.createModerator = onRequest(
  (req, res) => moderatorController.createModerator(req, res)
);

exports.deleteModerator = onRequest(
  (req, res) => moderatorController.deleteModerator(req, res)
);

exports.toggleModeratorBlock = onRequest(
  (req, res) => moderatorController.toggleModeratorBlock(req, res)
);

exports.testWebhook = onRequest(
  (req, res) => webhookController.testWebhook(req, res)
);