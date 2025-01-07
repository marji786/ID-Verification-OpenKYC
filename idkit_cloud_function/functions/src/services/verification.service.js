const { getFirestore, FieldValue } = require("firebase-admin/firestore");

class VerificationService {
    constructor(apiService, webhookService) {
        this.apiService = apiService;
        this.webhookService = webhookService;
    }

    /**
     * Processes an ID document for verification
     * @param {string} frontImageBase64 - Front image of the document in base64
     * @param {string} backImageBase64 - Back image of the document in base64 (optional)
     * @returns {Promise<VerificationResult>}
     */
    async processIDDocument(frontImageBase64, backImageBase64 = null) {
        try {
            console.log("Starting processIDDocument with images:", {
                hasFrontImage: !!frontImageBase64?.length,
                hasBackImage: !!backImageBase64?.length,
            });

            const base64Images = backImageBase64 ? [frontImageBase64, backImageBase64] : [frontImageBase64];
            const eventId = await this.getEventId(base64Images);
            console.log("Received eventId:", eventId);

            const results = await this.getRecognitionResults(eventId, !backImageBase64);
            console.log("Recognition results structure:", {
                hasData: !!results,
                keys: results ? Object.keys(results) : [],
                hasOcr: !!results?.ocr,
                documentName: results?.documentName,
            });

            if (!results || Object.keys(results).length === 0) {
                throw new Error("Empty response received from API");
            }

            return new VerificationResult(results).validate();
        } catch (error) {
            console.error("Document processing failed:", error.message);
            throw error;
        }
    }

    /**
     * Gets an event ID for document recognition
     * @param {string[]} base64Images - Array of base64 encoded images
     * @returns {Promise<string>}
     */
    async getEventId(base64Images) {
        const endpoint = base64Images.length > 1 ? "id_recognition_base64" : "id_recognition_oneside_base64";

        try {
            const requestData = { data: base64Images };
            const api = this.apiService.getApiClient();
            const response = await api.post(`/gradio_api/call/${endpoint}`, requestData);
            return response.data.event_id;
        } catch (error) {
            console.error("Failed to get event ID:", error);
            throw new Error(`Failed to get event ID: ${error.message}`);
        }
    }

    /**
     * Gets recognition results for a given event ID
     * @param {string} eventId - The event ID to get results for
     * @param {boolean} isSingleSided - Whether the document is single-sided
     * @returns {Promise<object>}
     */
    async getRecognitionResults(eventId, isSingleSided = false) {
        const endpoint = isSingleSided ? "id_recognition_oneside_base64" : "id_recognition";
        const api = this.apiService.getApiClient();

        try {
            const response = await api.get(`/gradio_api/call/${endpoint}/${eventId}`, {
                headers: { Accept: "text/event-stream" },
                responseType: "stream",
                timeout: 30000,
            });

            return new Promise((resolve, reject) => {
                let buffer = "";
                let hasResolved = false;

                response.data.on("data", (chunk) => {
                    buffer += chunk.toString();
                    const events = buffer.split(/(\n\n|\r\n\r\n)/);
                    buffer = events.pop() || "";

                    for (const event of events) {
                        if (event.startsWith("event: complete")) {
                            try {
                                const data = event.split("data: ")[1];
                                const parsedData = JSON.parse(data);

                                if (parsedData[0]?.data) {
                                    hasResolved = true;
                                    resolve(parsedData[0].data);
                                    return;
                                }
                            } catch (err) {
                                console.error("JSON Parsing Error:", err);
                            }
                        }
                    }
                });

                response.data.on("end", () => {
                    if (!hasResolved) {
                        reject(new Error("Stream ended without valid data"));
                    }
                });

                response.data.on("error", (error) => {
                    reject(error);
                });
            });
        } catch (error) {
            throw new Error(`Recognition request failed: ${error.message}`);
        }
    }

    /**
     * Checks face liveness from a base64 image
     * @param {string} faceImageBase64 - Base64 encoded face image
     * @returns {Promise<object>}
     */
    async checkFaceLiveness(faceImageBase64) {
        try {
            const requestData = { data: [faceImageBase64] };
            const api = this.apiService.getApiClient();

            const response = await api.post("/gradio_api/call/face_liveness_base64", requestData);
            const eventId = response.data.event_id;

            await new Promise((resolve) => setTimeout(resolve, 5000));

            const resultResponse = await api.get(`/gradio_api/call/face_liveness_base64/${eventId}`, {
                headers: { Accept: "text/event-stream" },
                responseType: "stream",
                timeout: 30000,
            });

            return this.processLivenessStream(resultResponse);
        } catch (error) {
            console.error("Face liveness check failed:", error);
            throw new Error(`Face liveness check failed: ${error.message}`);
        }
    }

    /**
     * Checks document liveness
     * @param {string} documentImageBase64 - Base64 encoded document image
     * @returns {Promise<object>}
     */
    async checkDocumentLiveness(documentImageBase64) {
        try {
            const requestData = { data: [documentImageBase64] };
            const documentLivenessApi = this.apiService.getDocumentLivenessApiClient();

            const response = await documentLivenessApi.post("/gradio_api/call/id_liveness_base64", requestData);
            const eventId = response.data.event_id;

            await new Promise((resolve) => setTimeout(resolve, 5000));

            const resultResponse = await documentLivenessApi.get(`/gradio_api/call/id_liveness_base64/${eventId}`, {
                headers: { Accept: "text/event-stream" },
                responseType: "stream",
                timeout: 30000,
            });

            return this.processDocumentLivenessStream(resultResponse);
        } catch (error) {
            console.error("Document liveness check failed:", error);
            throw new Error(`Document liveness check failed: ${error.message}`);
        }
    }

    /**
     * Compares two face images
     * @param {string} face1Base64 - First face image in base64
     * @param {string} face2Base64 - Second face image in base64
     * @returns {Promise<object>}
     */
    async compareFaces(face1Base64, face2Base64) {
        try {
            const requestData = { data: [face1Base64, face2Base64] };
            const api = this.apiService.getApiClient();

            const response = await api.post("/gradio_api/call/compare_face_base64", requestData);
            const eventId = response.data.event_id;

            await new Promise((resolve) => setTimeout(resolve, 5000));

            const resultResponse = await api.get(`/gradio_api/call/compare_face_base64/${eventId}`, {
                headers: { Accept: "text/event-stream" },
                responseType: "stream",
                timeout: 30000,
            });

            return this.processFaceComparisonStream(resultResponse);
        } catch (error) {
            console.error("Face comparison failed:", error);
            throw new Error(`Face comparison failed: ${error.message}`);
        }
    }

    /**
     * Saves verification images to Firestore
     * @param {FirebaseFirestore.DocumentReference} sessionRef 
     * @param {VerificationResult} verificationResult 
     * @param {object} sessionData 
     */
    async saveVerificationImages(sessionRef, verificationResult, sessionData) {
        const imagesCollection = sessionRef.collection("images");
        const batch = getFirestore().batch();

        // Save verification result images
        const imageMappings = {
            portrait: verificationResult.image.portrait,
            signature: verificationResult.image.signature,
            documentFrontSide: verificationResult.image.documentFrontSide,
            documentBackSide: verificationResult.image.documentBackSide,
            face_image_base64: sessionData.face_image_base64,
            unCroppedIdFront: sessionData.id_image_front_base64,
            unCroppedIdBack: sessionData.id_image_back_base64,
        };

        for (const [key, value] of Object.entries(imageMappings)) {
            if (value) {
                batch.set(imagesCollection.doc(key), {
                    base64: value,
                    createdAt: FieldValue.serverTimestamp(),
                });
            }
        }

        await batch.commit();
    }

    /**
     * Processes the liveness check stream response
     * @private
     */
    async processLivenessStream(resultResponse) {
        return new Promise((resolve, reject) => {
            let buffer = "";
            let hasResolved = false;

            resultResponse.data.on("data", (chunk) => {
                buffer += chunk.toString();
                const events = buffer.split(/(\n\n|\r\n\r\n)/);
                buffer = events.pop() || "";

                for (const event of events) {
                    if (event.startsWith("event: complete")) {
                        try {
                            const data = event.split("data: ")[1];
                            const parsedData = JSON.parse(data);

                            if (parsedData[0]) {
                                const livenessData = parsedData[0];
                                hasResolved = true;

                                if (livenessData.data.result === "no face detected!") {
                                    resolve({
                                        status: "ok",
                                        result: {
                                            is_live: false,
                                            liveness_score: 0,
                                            face_rect: livenessData.data.face_rect,
                                            angles: livenessData.data.angles,
                                        },
                                    });
                                    return;
                                }

                                resolve({
                                    status: livenessData.status,
                                    result: {
                                        is_live: livenessData.data.result === "genuine",
                                        liveness_score: livenessData.data.liveness_score,
                                        face_rect: livenessData.data.face_rect,
                                        angles: livenessData.data.angles,
                                    },
                                });
                                return;
                            }
                        } catch (err) {
                            console.error("JSON Parsing Error:", err);
                        }
                    }
                }
            });

            resultResponse.data.on("end", () => {
                if (!hasResolved) {
                    reject(new Error("Stream ended without valid liveness data"));
                }
            });

            resultResponse.data.on("error", (error) => {
                reject(error);
            });
        });
    }

    /**
     * Processes the document liveness stream response
     * @private
     */
    async processDocumentLivenessStream(resultResponse) {
        return new Promise((resolve, reject) => {
            let buffer = "";
            let hasResolved = false;

            resultResponse.data.on("data", (chunk) => {
                buffer += chunk.toString();
                const events = buffer.split(/(\n\n|\r\n\r\n)/);
                buffer = events.pop() || "";

                for (const event of events) {
                    if (event.startsWith("event: complete")) {
                        try {
                            const data = event.split("data: ")[1];
                            const parsedData = JSON.parse(data);

                            if (parsedData[0]) {
                                const livenessData = parsedData[0];
                                hasResolved = true;
                                resolve({
                                    status: livenessData.status,
                                    result: {
                                        is_live: livenessData.data.result === "genuine",
                                        screenreplay_score: livenessData.data.screenreplay_integrity_score,
                                        portraitreplace_score: livenessData.data.portraitreplace_integrity_score,
                                        printedcutout_score: livenessData.data.printedcutout_integrity_score,
                                    },
                                });
                                return;
                            }
                        } catch (err) {
                            console.error("JSON Parsing Error:", err);
                        }
                    }
                }
            });

            resultResponse.data.on("end", () => {
                if (!hasResolved) {
                    reject(new Error("Stream ended without valid document liveness data"));
                }
            });

            resultResponse.data.on("error", (error) => {
                reject(error);
            });
        });
    }

    /**
     * Processes the face comparison stream response
     * @private
     */
    async processFaceComparisonStream(resultResponse) {
        return new Promise((resolve, reject) => {
            let buffer = "";
            let hasResolved = false;

            resultResponse.data.on("data", (chunk) => {
                buffer += chunk.toString();
                const events = buffer.split(/(\n\n|\r\n\r\n)/);
                buffer = events.pop() || "";

                for (const event of events) {
                    if (event.startsWith("event: complete")) {
                        try {
                            const data = event.split("data: ")[1];
                            const parsedData = JSON.parse(data);

                            if (parsedData[0]?.data) {
                                hasResolved = true;
                                resolve({
                                    result: parsedData[0].data.result,
                                    similarity: parsedData[0].data.similarity,
                                });
                                return;
                            }
                        } catch (err) {
                            console.error("JSON Parsing Error:", err);
                        }
                    }
                }
            });

            resultResponse.data.on("end", () => {
                if (!hasResolved) {
                    reject(new Error("Stream ended without valid face comparison data"));
                }
            });

            resultResponse.data.on("error", (error) => {
                reject(error);
            });
        });
    }
}

module.exports = VerificationService;

