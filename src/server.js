// Core
import cron from 'node-cron';
import 'dotenv/config';
import express from 'express';
import puppeteer from "puppeteer";
import { exec } from 'node:child_process'; // <-- Importación clave para correr los robots

// Seguridad y middlewares
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { corsOptions, apiLimiter } from './config/security.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Database
import { pool } from "./database/db.js";

// Routes
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

// 🟢 LA LÍNEA MÁGICA: Le dice a Express que confíe en el proxy de Railway/Render
app.set('trust proxy', 1); 

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

// ============================================================================
// 🤖 MOTOR CENTRAL DE SINCRONIZACIÓN (Reutilizable)
// ============================================================================
const ejecutarSincronizacion = async (tipo) => {
    console.log("\n==================================================");
    console.log(`🤖 [ROBOT] INICIANDO SINCRONIZACIÓN AUTOMÁTICA: ${tipo}`);
    console.log("==================================================");

    let orquestadorPath = '';
    let inyectorPath = '';

    // ✨ TU MEJORA: Rutas relativas (Más limpio y portable)
    if (tipo === 'VENTAS') {
        orquestadorPath = 'src/sii_core/sii_historial_DTE/documentos emitidos/sii_emitidos_orquestador.mjs';
        inyectorPath = 'src/components/facturacion/scripts/subir_facturas_emitidas.mjs';
    } else if (tipo === 'COMPRAS') {
        orquestadorPath = 'src/sii_core/sii_historial_DTE/documentos recibidos/sii_recibidos_orquestador.mjs';
        inyectorPath = 'src/components/facturacion/scripts/subir_facturas_recibidas.mjs';
    } else {
        console.error(`❌ Error: El tipo de sincronización "${tipo}" no existe.`);
        return false; // Cortamos la ejecución si llega basura
    }

    try {
        // PASO 1: Ejecutar el Scrapper
        console.log(`▶️  [1/2] Iniciando Scrapper de ${tipo}...`);
        await new Promise((resolve, reject) => {
            exec(`node "${orquestadorPath}"`, (error, stdout, stderr) => {
                if (error) return reject(error);
                console.log(stdout); // Imprime lo que dice el robot
                resolve(stdout);
            });
        });

        // PASO 2: Ejecutar el Inyector a Supabase
        console.log(`▶️  [2/2] Iniciando Inyección a la Base de Datos (${tipo})...`);
        await new Promise((resolve, reject) => {
            exec(`node "${inyectorPath}"`, (error, stdout, stderr) => {
                if (error) return reject(error);
                console.log(stdout); // Imprime el resumen de facturas subidas
                resolve(stdout);
            });
        });

        console.log(`✅ PROCESO ${tipo} COMPLETO FINALIZADO.`);
        return true;

    } catch (error) {
        console.error(`❌ Error crítico en ${tipo}:`, error.message);
        return false;
    }
};

// ============================================================================
// 🌐 RUTA API (Para cuando presionas el botón manual en React)
// ============================================================================
app.post('/api/sincronizar-sii', apiLimiter, async (req, res) => {
    const { tipo } = req.body; 
    
    if (tipo !== 'VENTAS' && tipo !== 'COMPRAS') {
        return res.status(400).json({ success: false, message: "Tipo inválido." });
    }

    const exito = await ejecutarSincronizacion(tipo);

    if (exito) {
        res.json({ success: true, message: `Historial de ${tipo.toLowerCase()} sincronizado correctamente.` });
    } else {
        res.status(500).json({ success: false, message: "Falla en el robot al sincronizar." });
    }
});

// ============================================================================
// ⏰ TAREAS PROGRAMADAS (PILOTO AUTOMÁTICO)
// ============================================================================

// TAREA 1: Sincronización Nocturna (Se ejecuta todos los días a las 02:00 AM)
cron.schedule('0 2 * * *', async () => {
    console.log('\n==================================================');
    console.log('⏰ [CRON] INICIANDO RUTINA NOCTURNA DEL SII');
    console.log('==================================================');
    
    // Ejecuta Ventas y luego Compras de forma ordenada
    const ventasOk = await ejecutarSincronizacion('VENTAS');
    if (ventasOk) {
        await ejecutarSincronizacion('COMPRAS');
    }
    
    console.log('🏁 [CRON] RUTINA NOCTURNA FINALIZADA.');
});

// ============================================================================
// ⏰ TAREAS PROGRAMADAS (PILOTO AUTOMÁTICO)
// ============================================================================

// Sincronización Automática: Se ejecuta cada 4 horas en punto
// (00:00, 04:00, 08:00, 12:00, 16:00, 20:00)
cron.schedule('0 */4 * * *', async () => {
    console.log('\n==================================================');
    console.log('⏰ [CRON] INICIANDO RUTINA DE SINCRONIZACIÓN (CADA 4 HORAS)');
    console.log('==================================================');
    
    // Ejecuta Ventas y luego Compras de forma ordenada
    const ventasOk = await ejecutarSincronizacion('VENTAS');
    if (ventasOk) {
        await ejecutarSincronizacion('COMPRAS');
    }
    
    console.log('🏁 [CRON] RUTINA DE 4 HORAS FINALIZADA.');
});


// --- Archivos Estáticos ---
app.use('/static', express.static(path.join(process.cwd(), 'tmp')));

// --- Eliminación de Archivos Temporales ---
const cleanTmpFolder = () => {
  const folderPath = path.join(process.cwd(), 'tmp');
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
    console.log("📁 La carpeta 'tmp' no existía y fue creada.");
  }
  const files = fs.readdirSync(folderPath);
  const now = Date.now();
  const ONE_HOUR = 60 * 60 * 1000;
  files.forEach(file => {
    const filePath = path.join(folderPath, file);
    const stats = fs.statSync(filePath);
    if (now - stats.mtimeMs > ONE_HOUR) {
      fs.unlinkSync(filePath);
      console.log(`🧹 Limpieza: ${file} eliminado.`);
    }
  });
};
setInterval(cleanTmpFolder, 30 * 60 * 1000);

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
const gracefulShutdown = () => {
  console.log('\n🛑 Apagado de seguridad iniciado...');
  server.close(async () => {
    await pool.end();
    console.log('✅ Servidor finalizado.');
    process.exit(0);
  });
};

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

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);