"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptToken = encryptToken;
exports.decryptToken = decryptToken;
const crypto_1 = require("crypto");
const ALGORITHM = 'aes-256-gcm';
const ENC_PREFIX = 'enc:';
function getKey() {
    const hex = process.env.TOKEN_ENCRYPTION_KEY;
    if (!hex || hex.length !== 64)
        return null;
    return Buffer.from(hex, 'hex');
}
function encryptToken(plaintext) {
    const key = getKey();
    if (!key)
        return plaintext;
    const iv = (0, crypto_1.randomBytes)(12);
    const cipher = (0, crypto_1.createCipheriv)(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${ENC_PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}
function decryptToken(stored) {
    if (!stored.startsWith(ENC_PREFIX))
        return stored;
    const key = getKey();
    if (!key)
        return stored;
    const rest = stored.slice(ENC_PREFIX.length).split(':');
    if (rest.length !== 3)
        return stored;
    try {
        const [ivHex, tagHex, ciphertextHex] = rest;
        const decipher = (0, crypto_1.createDecipheriv)(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
        decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
        return decipher.update(Buffer.from(ciphertextHex, 'hex')).toString('utf8') + decipher.final('utf8');
    }
    catch {
        throw new Error('Failed to decrypt token — TOKEN_ENCRYPTION_KEY may have changed');
    }
}
