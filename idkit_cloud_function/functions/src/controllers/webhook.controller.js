// src/controllers/webhook.controller.js
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const crypto = require('crypto');
const axios = require('axios');

class WebhookController {
    constructor(settings) {
        this.settings = settings;
    }

    async testWebhook(req, res) {
        if (req.method !== 'POST') {
            return res.status(405).json({
                success: false,
                error: 'Method not allowed'
            });
        }

        try {
            // Detailed webhook configuration validation
            if (!this.settings.webhook_enabled) {
                return res.status(400).json({
                    success: false,
                    error: 'Webhooks are not enabled in settings'
                });
            }

            if (!this.settings.webhook_url) {
                return res.status(400).json({
                    success: false,
                    error: 'Webhook URL is not configured in settings'
                });
            }

            if (!this.settings.webhook_secret) {
                return res.status(400).json({
                    success: false,
                    error: 'Webhook secret is not configured in settings'
                });
            }

            // Validate webhook URL format
            try {
                new URL(this.settings.webhook_url);
            } catch (e) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid webhook URL format in settings'
                });
            }

            // Create test payload with a unique ID
            const testId = crypto.randomBytes(8).toString('hex');
            const payload = {
                event: 'webhook.test',
                timestamp: Date.now(),
                data: {
                    message: 'This is a test webhook notification',
                    test_id: testId
                }
            };

            // Create signature
            const signature = crypto
                .createHmac('sha256', this.settings.webhook_secret)
                .update(JSON.stringify(payload))
                .digest('hex');

            // Log attempt
            console.log('Attempting to send webhook to:', this.settings.webhook_url);

            try {
                // Send test webhook with increased timeout
                const response = await axios.post(this.settings.webhook_url, payload, {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Webhook-Signature': signature,
                        'X-Webhook-Event': 'webhook.test'
                    },
                    timeout: 15000, // 15 second timeout
                    validateStatus: function (status) {
                        return status >= 200 && status < 300; // Only accept 2xx status codes
                    }
                });

                // Log successful webhook test
                await getFirestore().collection('webhook_logs').add({
                    event: 'webhook.test',
                    status: 'success',
                    timestamp: FieldValue.serverTimestamp(),
                    response_status: response.status,
                    test: true,
                    test_id: testId,
                    webhook_url: this.settings.webhook_url
                });

                return res.status(200).json({
                    success: true,
                    message: 'Test webhook sent successfully',
                    details: {
                        status: response.status,
                        test_id: testId
                    }
                });

            } catch (error) {
                // More detailed error handling
                let errorMessage = 'Failed to deliver webhook';
                if (error.code === 'ECONNREFUSED') {
                    errorMessage = 'Connection refused - check if the webhook server is running';
                } else if (error.code === 'ENOTFOUND') {
                    errorMessage = 'Invalid webhook URL - domain could not be found';
                } else if (error.response) {
                    errorMessage = `Webhook server responded with status ${error.response.status}`;
                } else if (error.request) {
                    errorMessage = 'No response received from webhook server';
                }

                // Log webhook delivery failure with detailed error info
                await getFirestore().collection('webhook_logs').add({
                    event: 'webhook.test',
                    status: 'failed',
                    error: errorMessage,
                    error_code: error.code,
                    error_response: error.response ? {
                        status: error.response.status,
                        data: error.response.data
                    } : null,
                    timestamp: FieldValue.serverTimestamp(),
                    test: true,
                    test_id: testId,
                    webhook_url: this.settings.webhook_url
                });

                return res.status(500).json({
                    success: false,
                    error: errorMessage,
                    details: {
                        error_code: error.code,
                        response_status: error.response?.status,
                        test_id: testId
                    }
                });
            }
        } catch (error) {
            console.error('Error in testWebhook function:', error);

            return res.status(500).json({
                success: false,
                error: 'Internal server error while testing webhook',
                details: error.message
            });
        }
    }
}

module.exports = WebhookController;