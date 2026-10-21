import User from '../models/User.js';
import ScanAuditLog from '../models/ScanAuditLog.js';
import { getFaceEmbedding, cosineSimilarity } from '../services/faceRecognition.service.js';
import { decryptData } from '../utils/encryption.js';

import fs from 'fs';

// Dynamic confidence thresholds
const HIGH_CONFIDENCE_THRESHOLD = 0.90; // 90%
const MEDIUM_CONFIDENCE_THRESHOLD = 0.82; // 82%

// Helper to mask names for medium confidence privacy
function maskName(name) {
    if (!name) return "Unknown";
    const parts = name.split(' ');
    return parts.map(p => {
        if (p.length <= 2) return p;
        return p[0] + '*'.repeat(p.length - 2) + p[p.length - 1];
    }).join(' ');
}

/**
 * Handle emergency face scan request
 * Public users get minimal info, authenticated doctors get full records.
 */
export const handleEmergencyScan = async (req, res) => {
    let auditLog = new ScanAuditLog({
        ipAddress: req.ip || req.connection?.remoteAddress || 'Unknown',
        scannedByRole: req.user ? req.user.role : 'guest',
        scannedById: req.user ? req.user._id : null,
        status: 'failed'
    });

    try {
        if (!req.file) {
            auditLog.errorMessage = 'Image file is required.';
            await auditLog.save();
            return res.status(400).json({ status: 'error', message: auditLog.errorMessage });
        }

        // Extract face embedding from uploaded image
        let buffer = req.file.buffer;
        if (!buffer && req.file.path) {
            buffer = fs.readFileSync(req.file.path);
        }
        const inputEmbedding = await getFaceEmbedding(buffer);

        if (!inputEmbedding) {
            auditLog.errorMessage = 'No face detected in the image.';
            await auditLog.save();
            return res.status(400).json({ status: 'error', message: auditLog.errorMessage });
        }

        // Fetch all users who have opted in for emergency discovery
        // Include the faceEmbedding field which is normally hidden
        const optedInUsers = await User.find({ faceEmbedding: { $exists: true, $ne: null } }).select('+faceEmbedding fullName bloodGroup allergies currentMedications previousDiseaseHistory emergencyContact familyContact');

        const candidates = [];

        for (const user of optedInUsers) {
            if (!user.faceEmbedding) continue;

            try {
                const decryptedStr = decryptData(user.faceEmbedding);
                if (!decryptedStr) continue;

                const storedEmbedding = JSON.parse(decryptedStr);
                const similarity = cosineSimilarity(inputEmbedding, storedEmbedding);
                
                // Convert to percentage (0 to 1 -> 0 to 100)
                const confidence = Math.max(0, similarity * 100);

                if (confidence >= MEDIUM_CONFIDENCE_THRESHOLD * 100) {
                    candidates.push({
                        user,
                        confidence: parseFloat(confidence.toFixed(1))
                    });
                }
            } catch (err) {
                console.error(`Error processing embedding for user ${user._id}:`, err);
            }
        }

        // Sort candidates descending by confidence
        candidates.sort((a, b) => b.confidence - a.confidence);

        auditLog.candidatesFound = candidates.length;

        // Fail-safe: No reliable match
        if (candidates.length === 0) {
            auditLog.status = 'low_confidence';
            auditLog.errorMessage = 'No candidates above medium confidence threshold.';
            await auditLog.save();
            return res.status(200).json({
                status: "no_reliable_match",
                message: "Unable to confirm identity safely. Please check manual ID."
            });
        }

        const topCandidate = candidates[0];
        const isVerifiedDoctor = req.user && req.user.role === 'doctor' && req.user.isVerified;

        // High Confidence Match
        if (topCandidate.confidence >= HIGH_CONFIDENCE_THRESHOLD * 100) {
            auditLog.status = 'high_confidence';
            auditLog.confidenceScore = topCandidate.confidence;
            auditLog.matchedUserId = topCandidate.user._id;
            await auditLog.save();

            if (isVerifiedDoctor) {
                return res.status(200).json({
                    status: "match_found",
                    level: "high",
                    confidence: topCandidate.confidence,
                    user_id: topCandidate.user._id,
                    name: topCandidate.user.fullName,
                    blood_group: topCandidate.user.bloodGroup || 'Unknown',
                    allergies: topCandidate.user.allergies || [],
                    medications: topCandidate.user.currentMedications || [],
                    conditions: topCandidate.user.previousDiseaseHistory || [],
                    emergency_contact: topCandidate.user.emergencyContact?.phone || null,
                    family_contact: topCandidate.user.familyContact?.phone || null
                });
            } else {
                return res.status(200).json({
                    status: "match_found",
                    level: "high",
                    confidence: topCandidate.confidence,
                    user_id: topCandidate.user._id,
                    emergency_contact: topCandidate.user.emergencyContact?.phone || null,
                    blood_group: topCandidate.user.bloodGroup || 'Unknown',
                    allergies: topCandidate.user.allergies || []
                });
            }
        }

        // Medium Confidence (Possible Matches)
        // Return top 3 candidates securely
        const top3 = candidates.slice(0, 3).map(c => ({
            user_id: c.user._id,
            confidence: c.confidence,
            masked_name: maskName(c.user.fullName)
        }));

        auditLog.status = 'medium_confidence';
        auditLog.confidenceScore = topCandidate.confidence; // Record highest
        await auditLog.save();

        return res.status(200).json({
            status: "possible_matches",
            level: "medium",
            candidates: top3
        });

    } catch (error) {
        console.error('Emergency Scan Error:', error);
        auditLog.errorMessage = error.message || 'Internal server error';
        await auditLog.save();
        res.status(500).json({ status: 'error', message: 'Internal server error processing scan.' });
    }
};

export const handleEmergencyScanFast = async (req, res) => {
    let auditLog = new ScanAuditLog({
        ipAddress: req.ip || req.connection?.remoteAddress || 'Unknown',
        scannedByRole: req.user ? req.user.role : 'guest',
        scannedById: req.user ? req.user._id : null,
        status: 'failed'
    });

    try {
        const inputEmbedding = req.body.embedding;
        if (!inputEmbedding || !Array.isArray(inputEmbedding)) {
            auditLog.errorMessage = 'Embedding array is required.';
            await auditLog.save();
            return res.status(400).json({ status: 'error', message: auditLog.errorMessage });
        }

        // Fetch all users who have opted in for emergency discovery
        // Include the faceEmbedding field which is normally hidden
        const optedInUsers = await User.find({ faceEmbedding: { $exists: true, $ne: null } }).select('+faceEmbedding fullName bloodGroup allergies currentMedications previousDiseaseHistory emergencyContact familyContact');

        const candidates = [];

        for (const user of optedInUsers) {
            if (!user.faceEmbedding) continue;

            try {
                const decryptedStr = decryptData(user.faceEmbedding);
                if (!decryptedStr) continue;

                const storedEmbedding = JSON.parse(decryptedStr);
                const similarity = cosineSimilarity(inputEmbedding, storedEmbedding);
                
                // Convert to percentage (0 to 1 -> 0 to 100)
                const confidence = Math.max(0, similarity * 100);

                if (confidence >= MEDIUM_CONFIDENCE_THRESHOLD * 100) {
                    candidates.push({
                        user,
                        confidence: parseFloat(confidence.toFixed(1))
                    });
                }
            } catch (err) {
                console.error(`Error processing embedding for user ${user._id}:`, err);
            }
        }

        // Sort candidates descending by confidence
        candidates.sort((a, b) => b.confidence - a.confidence);

        auditLog.candidatesFound = candidates.length;

        // Fail-safe: No reliable match
        if (candidates.length === 0) {
            auditLog.status = 'low_confidence';
            auditLog.errorMessage = 'No candidates above medium confidence threshold.';
            await auditLog.save();
            return res.status(200).json({
                status: "no_reliable_match",
                message: "Unable to confirm identity safely. Please check manual ID."
            });
        }

        const topCandidate = candidates[0];
        const isVerifiedDoctor = req.user && req.user.role === 'doctor' && req.user.isVerified;

        // High Confidence Match
        if (topCandidate.confidence >= HIGH_CONFIDENCE_THRESHOLD * 100) {
            auditLog.status = 'high_confidence';
            auditLog.confidenceScore = topCandidate.confidence;
            auditLog.matchedUserId = topCandidate.user._id;
            await auditLog.save();

            if (isVerifiedDoctor) {
                return res.status(200).json({
                    status: "match_found",
                    level: "high",
                    confidence: topCandidate.confidence,
                    user_id: topCandidate.user._id,
                    name: topCandidate.user.fullName,
                    blood_group: topCandidate.user.bloodGroup || 'Unknown',
                    allergies: topCandidate.user.allergies || [],
                    medications: topCandidate.user.currentMedications || [],
                    conditions: topCandidate.user.previousDiseaseHistory || [],
                    emergency_contact: topCandidate.user.emergencyContact?.phone || null,
                    family_contact: topCandidate.user.familyContact?.phone || null
                });
            } else {
                return res.status(200).json({
                    status: "match_found",
                    level: "high",
                    confidence: topCandidate.confidence,
                    user_id: topCandidate.user._id,
                    emergency_contact: topCandidate.user.emergencyContact?.phone || null,
                    blood_group: topCandidate.user.bloodGroup || 'Unknown',
                    allergies: topCandidate.user.allergies || []
                });
            }
        }

        // Medium Confidence (Possible Matches)
        // Return top 3 candidates securely
        const top3 = candidates.slice(0, 3).map(c => ({
            user_id: c.user._id,
            confidence: c.confidence,
            masked_name: maskName(c.user.fullName)
        }));

        auditLog.status = 'medium_confidence';
        auditLog.confidenceScore = topCandidate.confidence; // Record highest
        await auditLog.save();

        return res.status(200).json({
            status: "possible_matches",
            level: "medium",
            candidates: top3
        });

    } catch (error) {
        console.error('Emergency Scan Error (Fast):', error);
        auditLog.errorMessage = error.message || 'Internal server error';
        await auditLog.save();
        res.status(500).json({ status: 'error', message: 'Internal server error processing scan.' });
    }
};
