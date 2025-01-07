// src/controllers/session.controller.js
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');

class SessionController {
    constructor(verificationService, webhookService, settings) {
        this.verificationService = verificationService;
        this.webhookService = webhookService;
        this.settings = settings;
    }

    async handleSessionUpdate(event) {
        const newData = event.after.data();
        const ref = event.after.ref;

        if (!newData || !ref) return null;

        if ((newData.status !== "NOT_STARTED" && newData.status !== "IN_PROGRESS") ||
            !newData.id_image_front_base64) {
            return null;
        }

        try {
            await ref.update({
                status: "PROCESSING_IMAGES",
                updated_at: Timestamp.now(),
            });

            await this.webhookService.sendNotification(ref.id, 'session.processing.started', {
                status: 'PROCESSING_IMAGES'
            });

            const verificationResult = await this.verificationService.processIDDocument(
                newData.id_image_front_base64,
                newData.id_image_back_base64
            );

            await this.verificationService.saveImages(ref, verificationResult, newData);

            await ref.update({
                ...verificationResult,
                status: "IN_REVIEW",
                updated_at: Timestamp.now(),
                id_image_front_base64: FieldValue.delete(),
                id_image_back_base64: FieldValue.delete(),
                face_image_base64: verificationResult.image.portrait || null,
            });

            await this.webhookService.sendNotification(ref.id, 'session.completed', {
                status: 'IN_REVIEW',
                document_type: verificationResult.document_type,
                document_valid: verificationResult.document_valid
            });

            return { success: true, status: "IN_REVIEW" };
        } catch (error) {
            console.error("Processing failed:", error);

            await ref.update({
                status: "PROCESSING_FAILED",
                updated_at: Timestamp.now(),
                error_message: error.message,
            });

            await this.webhookService.sendNotification(ref.id, 'session.failed', {
                error: error.message
            });

            return { success: false, status: "PROCESSING_FAILED", error: error.message };
        }
    }

    async createSession(req, res) {
        if (req.method !== "POST") {
            return res.status(405).json({ success: false, error: "Method not allowed" });
        }

        try {
            const apiKey = req.headers.authorization?.split("Bearer ")[1];
            if (!apiKey || !this.settings.api_keys?.includes(apiKey)) {
                return res.status(401).json({ success: false, error: "Invalid API key" });
            }

            const { vendor_id } = req.body;
            const sessionsRef = getFirestore().collection("sessions");
            const newSessionRef = sessionsRef.doc();
            const sessionId = newSessionRef.id;

            const sessionData = {
                created_by: "api",
                status: "NOT_STARTED",
                session_id: sessionId,
                session_url: `${this.settings.sessionSiteUrl}/${sessionId}`,
                created_at: FieldValue.serverTimestamp(),
                updated_at: FieldValue.serverTimestamp(),
                vendor_id: vendor_id || null,
                searchableFields: [sessionId.toLowerCase()],
            };

            await newSessionRef.set(sessionData);
            await this.webhookService.sendNotification(sessionId, 'session.created', { status: 'NOT_STARTED' });

            return res.status(200).json({
                success: true,
                data: {
                    session_id: sessionId,
                    session_url: sessionData.session_url,
                    status: sessionData.status,
                    created_at: new Date().toISOString(),
                },
            });
        } catch (error) {
            console.error("Error creating session:", error);
            return res.status(500).json({ success: false, error: "Internal server error" });
        }
    }
}

module.exports = SessionController;