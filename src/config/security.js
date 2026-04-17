import rateLimit from 'express-rate-limit';
import { FRONTEND_URL } from '../../config.js';

// Configuración de CORS
// src/config/security.js

// src/config/security.js

const allowedOrigins = [
  FRONTEND_URL,              
  'http://localhost:5173',   
  'http://localhost:3000',   
  'http://127.0.0.1:5173'    
];

export const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('🛑 Origen bloqueado por CORS:', origin);
      callback(new Error('Bloqueado por seguridad VSV'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-session-id', 'x-company-id', 'x-company-rut'],
  exposedHeaders: ['x-session-id']
};

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 1000, 
  standardHeaders: true, 
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones. Intente más tarde.' }
});