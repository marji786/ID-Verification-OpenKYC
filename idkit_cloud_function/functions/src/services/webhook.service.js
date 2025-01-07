const crypto = require('crypto');
const axios = require('axios');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

class WebhookService {
    constructor(settings) {
        this.settings = settings;
    }

    createSignature(payload) {
        return crypto
            .createHmac('sha256', this.settings.webhook_secret)
            .update(JSON.stringify(payload))
            .digest('hex');
    }

    async sendNotification(sessionId, event, data) {
        if (!this.settings.webhook_enabled || !this.settings.webhook_url || !this.settings.webhook_secret) {
            console.log('Webhooks not configured or disabled');
            return;
        }

        const payload = {
            event,
            session_id: sessionId,
            timestamp: Date.now(),
            data
        };

        const signature = this.createSignature(payload);

        try {
            const response = await axios.post(this.settings.webhook_url, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Webhook-Signature': signature,
                    'X-Webhook-Event': event
                },
                timeout: 10000
            });

            await this.logWebhookDelivery(sessionId, event, 'success', response.status);
            return true;

        } catch (error) {
            console.error(`Failed to send webhook notification for session ${sessionId}:`, error);
            await this.logWebhookDelivery(sessionId, event, 'failed', null, error.message);
            return false;
        }
    }

    async logWebhookDelivery(sessionId, event, status, responseStatus, errorMessage = null) {
        const logData = {
            session_id: sessionId,
            event,
            status,
            timestamp: FieldValue.serverTimestamp()
        };

        if (responseStatus) logData.response_status = responseStatus;
        if (errorMessage) logData.error = errorMessage;

        await getFirestore().collection('webhook_logs').add(logData);
    }
}

module.exports = WebhookService;