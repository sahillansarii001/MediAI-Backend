import crypto from 'crypto';

// The encryption key should be 32 bytes for aes-256-cbc.
// In a real app, this MUST be in process.env.ENCRYPTION_KEY
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const IV_LENGTH = 16; // For AES, this is always 16

/**
 * Encrypts a string (like a JSON stringified array of floats)
 * @param {string} text - The text to encrypt
 * @returns {string} - The encrypted string format `iv:encryptedData`
 */
export function encryptData(text) {
    if (!text) return text;
    // ensure key is exactly 32 bytes Buffer
    const keyBuffer = Buffer.from(ENCRYPTION_KEY, 'hex');
    if (keyBuffer.length !== 32) {
        throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
    }

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, iv);
    
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

/**
 * Decrypts text encrypted by encryptData
 * @param {string} text - The encrypted string format `iv:encryptedData`
 * @returns {string} - The original text
 */
export function decryptData(text) {
    if (!text) return text;
    try {
        const keyBuffer = Buffer.from(ENCRYPTION_KEY, 'hex');
        const textParts = text.split(':');
        const iv = Buffer.from(textParts.shift(), 'hex');
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');
        
        const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, iv);
        
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        
        return decrypted.toString();
    } catch (error) {
        console.error('Error decrypting data:', error);
        return null;
    }
}
