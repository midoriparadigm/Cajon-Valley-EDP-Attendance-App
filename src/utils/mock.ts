// src/utils/mock.ts — Mock services for development/testing
import type { Student } from '../types';

// =============================================================================
// MOCK DATABASE
// =============================================================================

/**
 * MockDatabase: Decoupled data layer for functional demonstration.
 * Stores pre-assigned photos for students to simulate matching and anomaly detection.
 */
export class MockDatabase {
    static getPhotosForStudent(student: Student) {
        // Demo photos using DiceBear for consistent visuals
        // Ensure "same base subject" by using the same seed for both
        const baseSeed = student.firstName;
        const genderParam = (['William', 'Liam', 'Noah'].includes(student.firstName)) ? '&gender=male' : '';

        return {
            yearbook: `https://api.dicebear.com/7.x/avataaars/svg?seed=${baseSeed}${genderParam}`,
            previous: `https://api.dicebear.com/7.x/avataaars/svg?seed=${baseSeed}${genderParam}`, // Same base subject
        };
    }
}

// =============================================================================
// PASSKEY SERVICE
// =============================================================================

/**
 * PasskeyService: Platform-aware authentication.
 * - iOS/Android: Face ID / Touch ID (platform authenticator)
 * - Mac: Touch ID (platform authenticator)
 * - Chromebook: Falls back to email/password (no passkey)
 */
export class PasskeyService {
    /**
     * Performs biometric identity verification for student check-in.
     */
    static async processVerification(livePhoto: string, student: Student): Promise<{
        matchScore: number;
        anomalyScore: number;
        anomalyDetected: boolean;
    }> {
        await new Promise(resolve => setTimeout(resolve, 1500));
        const matchScore = 0.85 + (Math.random() * 0.1);
        const anomalyScore = Math.random();
        const anomalyDetected = anomalyScore > 0.8;

        return {
            matchScore: Number(matchScore.toFixed(2)),
            anomalyScore: Number(anomalyScore.toFixed(2)),
            anomalyDetected
        };
    }

    /**
     * Registers a new passkey using platform authenticator (Face ID, Touch ID).
     */
    static async registerPasskey() {
        if (!window.PublicKeyCredential) return null;

        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);

        const createOptions: PublicKeyCredentialCreationOptions = {
            challenge,
            rp: { name: "EDP Attendance", id: window.location.hostname },
            user: {
                id: new Uint8Array(16),
                name: "staff@cajonvalley.net",
                displayName: "Staff Member"
            },
            pubKeyCredParams: [{ alg: -7, type: "public-key" }, { alg: -257, type: "public-key" }],
            timeout: 60000,
            attestation: "direct",
            // Force platform authenticator (Face ID, Touch ID) - no QR codes or security keys
            authenticatorSelection: {
                authenticatorAttachment: "platform",
                userVerification: "required",
                residentKey: "preferred"
            }
        };

        try {
            const credential = await navigator.credentials.create({ publicKey: createOptions });
            return credential;
        } catch (err) {
            console.error("Passkey registration failed:", err);
            return null;
        }
    }

    /**
     * Authenticates using platform authenticator (Face ID, Touch ID).
     */
    static async authenticate() {
        if (!window.PublicKeyCredential) return null;

        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);

        const getOptions: PublicKeyCredentialRequestOptions = {
            challenge,
            timeout: 60000,
            userVerification: "required",
            rpId: window.location.hostname
            // Note: allowCredentials is empty to allow any registered credential
        };

        try {
            const assertion = await navigator.credentials.get({ publicKey: getOptions });
            // ⚠️ PRODUCTION TODO: Send `assertion` to a backend endpoint that
            // verifies the authenticatorData, clientDataJSON, and signature
            // against the stored public key for this rpId, then returns the
            // verified user email. NEVER trust the client to identify itself.
            //
            // Example backend flow:
            //   POST /api/auth/passkey/verify
            //   Body: { assertion: JSON.stringify(assertion) }
            //   Returns: { email: "verified@cajonvalley.net" }
            //
            // Until backend verification is implemented, throw so this code
            // path is never silently used as real authentication.
            throw new Error(
                'PasskeyService.authenticate(): backend assertion verification not implemented. ' +
                'Do not use this as real authentication until a server-side verifier is in place.'
            );
        } catch (err) {
            console.error("Passkey authentication failed:", err);
            return null;
        }

    }

    /**
     * Detects if device is an iOS device (iPhone, iPad, iPod).
     */
    static isIOS(): boolean {
        return /iPhone|iPad|iPod/i.test(navigator.userAgent);
    }

    /**
     * Detects if device is an Android device.
     */
    static isAndroid(): boolean {
        return /Android/i.test(navigator.userAgent);
    }

    /**
     * Detects if device is a Mac (for Touch ID support).
     */
    static isMac(): boolean {
        return /Macintosh|MacIntel|MacPPC|Mac68K/i.test(navigator.userAgent) && !this.isIOS();
    }

    /**
     * Detects if device is a Chromebook (should use email/password only).
     */
    static isChromebook(): boolean {
        return /CrOS/i.test(navigator.userAgent);
    }

    /**
     * Returns true if platform authenticator (Face ID, Touch ID) is supported.
     * Chromebooks explicitly return false to force email/password login.
     */
    static isSupported(): boolean {
        if (this.isChromebook()) return false;
        if (!window.PublicKeyCredential) return false;
        // Supported on iOS, Android, and Mac with Touch ID
        return this.isIOS() || this.isAndroid() || this.isMac();
    }

    /**
     * Returns the appropriate authentication label based on platform.
     */
    static getAuthLabel(): string {
        if (this.isIOS()) return 'Face ID / Touch ID';
        if (this.isAndroid()) return 'Fingerprint / Biometrics';
        if (this.isMac()) return 'Touch ID';
        return 'Passkey';
    }

    static uploadToDrive(photo: string, studentId: string) {
        // Future Google Drive integration
    }
}
