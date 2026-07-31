import rateLimit from 'express-rate-limit';
import { FRONTEND_URL } from '../../config.js';

// Configuración de CORS
// src/config/security.js

// src/config/security.js

const allowedOrigins = [
  FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000'
];

// ¿El origen está permitido?
const isAllowedOrigin = (origin) => {
  // Peticiones sin Origin (curl, server-to-server, health checks): permitidas.
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  try {
    const host = new URL(origin).hostname;
    // Cualquier despliegue de Vercel de ESTE proyecto (producción y previews):
    // vsv-contadores.vercel.app, vsv-contadores-git-xxx.vercel.app, etc.
    if (host.endsWith('.vercel.app') && host.startsWith('vsv-contadores')) return true;
  } catch (e) { /* origen mal formado */ }
  return false;
};

export const corsOptions = {
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      console.log('🛑 Origen bloqueado por CORS:', origin);
      // null + false: deniega sin lanzar error (evita 500 en el preflight).
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-session-id', 'x-company-id', 'x-company-rut'],
  exposedHeaders: ['x-session-id'],
  optionsSuccessStatus: 204
};

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones. Intente más tarde.' }
});

// ============================================================================
// LÍMITE PROPIO PARA LAS ACCIONES QUE SALEN AL MUNDO
// ----------------------------------------------------------------------------
// El limitador de arriba es global: 1000 peticiones cada 15 minutos compartidas
// por toda la API. Para consultar está bien, pero dispara igual de fácil un
// envío de 93 correos a clientes reales o un lote de facturas al SII.
//
// Estas acciones no se repiten: se hacen una vez al mes. Un puñado de intentos
// por ventana es de sobra, y corta el caso de apretar el botón dos veces por
// nervios o por un doble clic.
//
// Va POR USUARIO y no por IP: en una oficina todos salen por la misma IP, y no
// tiene sentido que el envío de uno le consuma el cupo al otro.
// ============================================================================
export const envioMasivoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.usuarioId || req.ip,
  message: {
    ok: false,
    error: 'Demasiados envíos masivos seguidos. Espera unos minutos: si el anterior salió bien, no hace falta repetirlo.'
  }
});