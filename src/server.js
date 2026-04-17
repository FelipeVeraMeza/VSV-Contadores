// Core
import 'dotenv/config';
import express from 'express';
import puppeteer from "puppeteer";

// Seguridad y middlewares
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { corsOptions, apiLimiter } from './config/security.js';

import fs, { mkdir } from 'node:fs';

// Database
import { pool } from "./database/db.js";

// Routes
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/users.routes.js';
import companyRoutes from './routes/company.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import clientesRoutes from './routes/clientes.routes.js';
import dteRoutes from "./routes/dte.routes.js";
import accountingRoutes from './routes/accounting.routes.js';
import rrhhRoutes from './routes/rrhh.routes.js';
import rentaRoutes from './routes/renta.routes.js';
import bancoRoutes from './routes/bancos.routes.js';
import dteConsultaRoutes from "./routes/dteConsulta.routes.js";

// --- Inicialización del Servidor ---
const app = express();
const PORT = process.env.PORT || 4000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Middlewares Globales ---
app.use(helmet()); 
app.use(compression()); 
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(cors(corsOptions));

// --- Ruta de Health Check ---
app.get('/health', async (req, res) => {
  try {
    const dbStatus = await pool.query('SELECT 1');
    res.status(200).json({ 
      status: 'OK', 
      database: 'CONNECTED', 
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('❌ Error en Health Check:', err.message);
    res.status(503).json({ status: 'ERROR', database: 'DISCONNECTED' });
  }
});

// --- Rutas de la API ---
app.use('/api/auth', apiLimiter, authRoutes);
app.use('/api/users', apiLimiter, userRoutes);
app.use('/api/companies', apiLimiter, companyRoutes);

app.use('/api/dashboard', apiLimiter, dashboardRoutes);
app.use('/api/clientes', apiLimiter, clientesRoutes);
app.use('/api/accounting', apiLimiter, accountingRoutes);
app.use('/api/rrhh', apiLimiter, rrhhRoutes);
app.use('/api/renta', apiLimiter, rentaRoutes);
app.use('/api/bancos', apiLimiter, bancoRoutes);

app.use('/api/dte', apiLimiter, dteRoutes);

app.use("/api/dte-consulta", apiLimiter, dteConsultaRoutes);

// --- Archivos Estáticos ---
app.use('/static', express.static(path.join(process.cwd(), 'tmp')));

// --- Eliminación de Archivos Temporales ---W
const cleanTmpFolder = () => {
  const folderPath = path.join(process.cwd(), 'tmp');

  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
    console.log("📁 La carpeta 'tmp' no existía y fue creada.");
  }

  const files = fs.readdirSync(folderPath);
  const now = Date.now();
  const ONE_HOUR = 60 * 60 * 1000; // 1 hora

  files.forEach(file => {
    const filePath = path.join(folderPath, file);
    const stats = fs.statSync(filePath);
    
    if (now - stats.mtimeMs > ONE_HOUR) {
      fs.unlinkSync(filePath);
      console.log(`🧹 Limpieza: ${file} eliminado.`);
    }
  });
};

setInterval(cleanTmpFolder, 30 * 60 * 1000); // Cada 30 minutos


// --- Manejo de Errores Global ---
app.use((err, req, res, next) => {
  console.error(`❌ [Error]: ${err.message}`);
  res.status(err.statusCode || 500).json({
    status: 'error',
    message: err.message || 'Error interno del servidor',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

const server = app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en el puerto ${PORT}`);
});

// --- Cierre Seguro ---
process.on('unhandledRejection', (err) => {
  console.error('⚠️ UNHANDLED REJECTION! Apagado de seguridad iniciado...');
  console.error(err);
  server.close(() => process.exit(1));
});

process.on('uncaughtException', (err) => {
  console.error('⚠️ UNCAUGHT EXCEPTION! Apagado de seguridad iniciado...');
  console.error(err);
  server.close(() => process.exit(1));
});

const gracefulShutdown = () => {
  console.log('\n🛑 Apagado de seguridad iniciado...');
  server.close(async () => {
    await pool.end();
    console.log('✅ Servidor finalizado.');
    process.exit(0);
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);