import crypto from 'crypto';
import 'dotenv/config';
import { cleanRut } from '../lib/rut.js';

const ALGORITHM = 'aes-256-cbc';
// ⚠️ Si la variable no está, NO tumbamos el server al importar: avisamos y dejamos KEY null.
// Buffer.from(undefined) lanzaría error y crashearía todo el backend al boot.
const KEY = process.env.ENCRYPTION_KEY ? Buffer.from(process.env.ENCRYPTION_KEY) : null;
if (!KEY) {
    console.error("⚠️ [CRYPTO] Falta la variable de entorno ENCRYPTION_KEY. El cifrado/descifrado no funcionará hasta configurarla.");
}

const IV_LENGTH = 16;

export const encrypt = (text) => {
    if (!text) return null;
    try {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return `${iv.toString('hex')}:${encrypted}`;
    } catch (error) {
        console.error("❌ Fallo en encriptación:", error.message);
        return null;
    }
};

export const decrypt = (hash) => {
    if (!hash || !hash.includes(':')) return null;
    try {
        const [ivHex, encryptedText] = hash.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        return null; 
    }
};

export const generateHash = (text) => {
    if (!text) return null;
    return crypto.createHash('sha256').update(text).digest('hex');
};