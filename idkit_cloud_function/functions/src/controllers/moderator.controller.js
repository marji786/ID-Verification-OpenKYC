// src/controllers/moderator.controller.js
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const admin = require('firebase-admin');

class ModeratorController {
    constructor(settings) {
        this.settings = settings;
    }

    async createModerator(req, res) {
        // Check origin
        const origin = req.headers.origin;
        if (this.settings.allowedOrigins.includes(origin)) {
            res.set('Access-Control-Allow-Origin', origin);
        }
        res.set('Access-Control-Allow-Methods', 'POST');
        res.set('Access-Control-Allow-Headers', 'authorization,content-type');

        if (req.method === 'OPTIONS') {
            res.status(204).send('');
            return;
        }

        if (req.method !== "POST") {
            return res.status(405).json({
                success: false,
                error: "Method not allowed",
            });
        }

        try {
            // Extract moderator data from request body
            const {
                email,
                password,
                firstName,
                lastName,
                phoneNumber,
                role = "moderator",
            } = req.body.data;

            // Additional validation for phone number
            if (phoneNumber && !phoneNumber.startsWith("+")) {
                return res.status(400).json({
                    success: false,
                    error: "Phone number must start with '+' and include country code",
                });
            }

            // Validate role
            const validRoles = ["moderator", "admin"];
            if (!validRoles.includes(role)) {
                return res.status(400).json({
                    success: false,
                    error: "Invalid role specified",
                });
            }

            // Validate required fields
            if (!email || !password || !firstName || !lastName) {
                return res.status(400).json({
                    success: false,
                    error: "Missing required fields: email, password, firstName, and lastName are required",
                });
            }

            // Validate password strength
            if (password.length < 6) {
                return res.status(400).json({
                    success: false,
                    error: "Password must be at least 6 characters long",
                });
            }

            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({
                    success: false,
                    error: "Invalid email format",
                });
            }

            // Create user in Firebase Auth
            const userRecord = await admin.auth().createUser({
                email: email.toLowerCase(),
                password,
                displayName: `${firstName} ${lastName}`,
                ...(phoneNumber && phoneNumber.startsWith("+") ? { phoneNumber } : {}),
                disabled: false,
            });

            // Set custom claims for role
            await admin.auth().setCustomUserClaims(userRecord.uid, {
                role: role,
                isModerator: true,
            });

            const moderatorsRef = getFirestore().collection("moderators");
            const newModeratorRef = moderatorsRef.doc(userRecord.uid);

            const moderatorData = {
                moderatorId: userRecord.uid,
                email: email.toLowerCase(),
                firstName,
                lastName,
                phoneNumber: phoneNumber || null,
                role,
                blocked: false,
                profileImageUrl: null,
                active: true,
                lastLoginAt: null,
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
                searchableFields: [
                    email.toLowerCase(),
                    firstName.toLowerCase(),
                    lastName.toLowerCase(),
                    userRecord.uid.toLowerCase(),
                ],
            };

            await newModeratorRef.set(moderatorData);

            return res.status(200).json({
                success: true,
                data: {
                    moderatorId: userRecord.uid,
                    email: moderatorData.email,
                    firstName: moderatorData.firstName,
                    lastName: moderatorData.lastName,
                    role: moderatorData.role,
                    createdAt: new Date().toISOString(),
                },
            });
        } catch (error) {
            console.error("Error creating moderator:", error);

            if (error.code === "auth/email-already-exists") {
                return res.status(400).json({
                    success: false,
                    error: "Email address is already in use",
                });
            }

            if (error.code === "auth/invalid-email") {
                return res.status(400).json({
                    success: false,
                    error: "Invalid email address format",
                });
            }

            if (error.code === "auth/invalid-phone-number") {
                return res.status(400).json({
                    success: false,
                    error: "Invalid phone number format",
                });
            }

            if (error.code === "auth/weak-password") {
                return res.status(400).json({
                    success: false,
                    error: "Password is too weak",
                });
            }

            return res.status(500).json({
                success: false,
                error: "Internal server error",
                details: error.message,
            });
        }
    }

    async deleteModerator(req, res) {
        // Check origin
        const origin = req.headers.origin;
        if (this.settings.allowedOrigins.includes(origin)) {
            res.set('Access-Control-Allow-Origin', origin);
        }
        res.set('Access-Control-Allow-Methods', 'POST');
        res.set('Access-Control-Allow-Headers', 'authorization,content-type');

        if (req.method === 'OPTIONS') {
            res.status(204).send('');
            return;
        }

        if (req.method !== "POST") {
            return res.status(405).json({
                data: {
                    success: false,
                    error: "Method not allowed",
                }
            });
        }

        try {
            const moderatorId = req.body.data.moderatorId;

            if (!moderatorId) {
                return res.status(400).json({
                    data: {
                        success: false,
                        error: "Moderator ID is required",
                    }
                });
            }

            // Delete from Firebase Auth
            await admin.auth().deleteUser(moderatorId);

            // Delete from Firestore
            const moderatorRef = getFirestore().collection("moderators").doc(moderatorId);
            await moderatorRef.delete();

            return res.status(200).json({
                data: {
                    success: true,
                    message: "Moderator deleted successfully"
                }
            });

        } catch (error) {
            console.error("Error deleting moderator:", error);

            if (error.code === "auth/user-not-found") {
                return res.status(404).json({
                    data: {
                        success: false,
                        error: "Moderator not found",
                    }
                });
            }

            return res.status(500).json({
                data: {
                    success: false,
                    error: "Internal server error",
                    details: error.message,
                }
            });
        }
    }

    async toggleModeratorBlock(req, res) {
        // Check origin
        const origin = req.headers.origin;
        if (this.settings.allowedOrigins.includes(origin)) {
            res.set('Access-Control-Allow-Origin', origin);
        }
        res.set('Access-Control-Allow-Methods', 'POST');
        res.set('Access-Control-Allow-Headers', 'authorization,content-type');

        if (req.method === 'OPTIONS') {
            res.status(204).send('');
            return;
        }

        if (req.method !== "POST") {
            return res.status(405).json({
                data: {
                    success: false,
                    error: "Method not allowed",
                }
            });
        }

        try {
            const { moderatorId, blocked } = req.body.data;

            if (!moderatorId) {
                return res.status(400).json({
                    data: {
                        success: false,
                        error: "Moderator ID is required",
                    }
                });
            }

            // Update Firebase Auth user
            await admin.auth().updateUser(moderatorId, {
                disabled: blocked
            });

            // Update Firestore document
            const moderatorRef = getFirestore().collection("moderators").doc(moderatorId);
            await moderatorRef.update({
                blocked: blocked,
                updatedAt: FieldValue.serverTimestamp()
            });

            return res.status(200).json({
                data: {
                    success: true,
                    message: `Moderator ${blocked ? 'blocked' : 'unblocked'} successfully`
                }
            });

        } catch (error) {
            console.error("Error toggling moderator block status:", error);

            if (error.code === "auth/user-not-found") {
                return res.status(404).json({
                    data: {
                        success: false,
                        error: "Moderator not found",
                    }
                });
            }

            return res.status(500).json({
                data: {
                    success: false,
                    error: "Internal server error",
                    details: error.message,
                }
            });
        }
    }
}

module.exports = ModeratorController;