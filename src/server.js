// Core
import cron from 'node-cron';
import 'dotenv/config';
import express from 'express';
import { exec } from 'node:child_process'; 

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
import { requireSession, requireAdmin } from './middleware/auth.js';

// Routes
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/users.routes.js';
import companyRoutes from './routes/company.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import clientesRoutes from './routes/clientes.routes.js';
import personasRoutes from './routes/personas.routes.js';
import crmRoutes from './routes/crm.routes.js';
import dteRoutes from "./routes/dte.routes.js";
import accountingRoutes from './routes/accounting.routes.js';
import rrhhRoutes from './routes/rrhh.routes.js';
import rentaRoutes from './routes/renta.routes.js';
import bancoRoutes from './routes/bancos.routes.js';
import dteConsultaRoutes from "./routes/dteConsulta.routes.js";
import cajaRoutes from "./routes/caja.routes.js";
import credencialesRoutes from "./routes/credenciales.routes.js";
import cobrosRoutes from "./routes/cobros.routes.js";
import whatsappRoutes from "./routes/whatsapp.routes.js";
import { reconectarSesionesGuardadas } from "./services/whatsapp/whatsappBot.js";

// Importación del Robot Manual
import { ejecutarRobotSII } from './components/contabilidad/scripts/sincronizador_sii.mjs';
import { credencialesSiiDeEmpresa } from './utils/credencialesSii.js';
import { cargarJSONaBD } from './components/contabilidad/scripts/subir_documentos_db.mjs';

// 🔒 Estado del Facturador Masivo: si está activo, NO sincronizamos el SII (misma cuenta = se botan la sesión)
import { estadoRobot } from './components/facturacion/scripts/factura_masiva.mjs';

// --- Inicialización del Servidor ---
const app = express();
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
app.use('/api/personas', apiLimiter, personasRoutes);
app.use('/api/crm', apiLimiter, crmRoutes);
app.use('/api/accounting', apiLimiter, accountingRoutes);
app.use('/api/rrhh', apiLimiter, rrhhRoutes);
app.use('/api/renta', apiLimiter, rentaRoutes);
app.use('/api/bancos', apiLimiter, bancoRoutes);
app.use('/api/dte', apiLimiter, dteRoutes);
app.use("/api/dte-consulta", apiLimiter, dteConsultaRoutes);
app.use("/api/caja", apiLimiter, cajaRoutes);
app.use('/api/credenciales', apiLimiter, credencialesRoutes);
app.use('/api/cobros', apiLimiter, cobrosRoutes);
app.use('/api/whatsapp', apiLimiter, whatsappRoutes);

// ============================================================================
// 🤖 MOTOR CENTRAL DE SINCRONIZACIÓN (Bóveda Global)
// ============================================================================
const ejecutarSincronizacion = async (tipo) => {
    // 🔒 CANDADO: si el Facturador Masivo está emitiendo, NO sincronizamos.
    // Ambos usan el SII con la MISMA cuenta y se botarían la sesión mutuamente.
    if (estadoRobot.activo) {
        console.log(`⏸️ [SYNC ${tipo}] OMITIDA: el Facturador Masivo está activo (no se toca el SII para no botar su sesión).`);
        return false;
    }

    console.log("\n==================================================");
    console.log(`🤖 [ROBOT GLOBAL] INICIANDO SINCRONIZACIÓN AUTOMÁTICA: ${tipo}`);
    console.log("==================================================");

    let orquestadorPath = '';
    let inyectorPath = '';

    // Mejora 1: Usamos path.join y process.cwd() para asegurar que la ruta absoluta 
    // funcione sin importar desde dónde inicies el servidor (nodemon, node directo, pm2, etc.)
    const basePath = process.cwd();

    if (tipo === 'VENTAS') {
        orquestadorPath = path.join(basePath, 'src', 'sii_core', 'sii_historial_DTE', 'documentos emitidos', 'sii_emitidos_orquestador.mjs');
        inyectorPath = path.join(basePath, 'src', 'components', 'facturacion', 'scripts', 'subir_facturas_emitidas.mjs');
    } else if (tipo === 'COMPRAS') {
        orquestadorPath = path.join(basePath, 'src', 'sii_core', 'sii_historial_DTE', 'documentos recibidos', 'sii_recibidos_orquestador.mjs');
        inyectorPath = path.join(basePath, 'src', 'components', 'facturacion', 'scripts', 'subir_facturas_recibidas.mjs');
    } else {
        console.error(`❌ Error: El tipo de sincronización "${tipo}" no existe.`);
        return false; 
    }

    try {
        // Ejecutar Scrapper
        console.log(`▶️  [1/2] Iniciando Scrapper de ${tipo}...`);
        await new Promise((resolve, reject) => {
            exec(`node "${orquestadorPath}"`, (error, stdout, stderr) => {
                if (error) {
                    console.error(`❌ Error ejecutando Scrapper ${tipo}:`, stderr);
                    return reject(error);
                }
                console.log(stdout); 
                resolve(stdout);
            });
        });

        // Ejecutar Inyector
        console.log(`▶️  [2/2] Iniciando Inyección a la Base de Datos (${tipo})...`);
        await new Promise((resolve, reject) => {
            exec(`node "${inyectorPath}"`, (error, stdout, stderr) => {
                if (error) {
                     console.error(`❌ Error ejecutando Inyector ${tipo}:`, stderr);
                     return reject(error);
                }
                console.log(stdout); 
                resolve(stdout);
            });
        });

        console.log(`✅ PROCESO GLOBAL ${tipo} FINALIZADO.`);
        return true;

    } catch (error) {
        console.error(`❌ Error crítico en sincronización global de ${tipo}:`, error.message);
        return false;
    }
};

// ============================================================================
// 🌐 RUTA API (Sincronización Manual - SOLO ADMINISTRADOR)
// ============================================================================
// La sesión se valida con el mismo middleware que el resto de la API, leyendo
// la cabecera 'x-session-id'. Antes se buscaba `sessionId` DENTRO del cuerpo del
// POST, pero ninguno de los tres botones que llaman a esta ruta lo enviaba: la
// consulta no encontraba sesión y devolvía siempre 403 "Solo administradores",
// incluso a un administrador legítimo. La sincronización nunca funcionó.
app.post('/api/sincronizar-sii', apiLimiter, requireSession, requireAdmin, async (req, res) => {
    const { tipo, mes, anio, mesDesde, anioDesde, mesHasta, anioHasta, empresaId } = req.body;

    // 1. MODO MANUAL: Extracción por rango de fechas para una empresa específica
    if (empresaId) {
        // Las credenciales se leen de la BD, NO del cuerpo del POST.
        //
        // Antes el frontend enviaba `rut` y `clave` desde el navegador: la clave
        // del SII de cada cliente viajaba al browser y quedaba a la vista en las
        // herramientas de desarrollo. Además mandaba el RUT de la EMPRESA como
        // usuario de login, cuando al SII se entra con el del representante legal.
        let credenciales;
        try {
            credenciales = await credencialesSiiDeEmpresa(empresaId, req.user?.organizacionId);
        } catch (error) {
            return res.status(400).json({ success: false, message: error.message });
        }

        const { rutEmpresa, rutRepresentante, clave, razonSocial } = credenciales;
        console.log(`\n👨‍💻 [MODO MANUAL] ${razonSocial} | representante ${rutRepresentante} → empresa ${rutEmpresa} | Rango: ${mesDesde}/${anioDesde} → ${mesHasta}/${anioHasta}`);
        try {
            const resultado = await ejecutarRobotSII({
                rutRepresentante, clave, rutEmpresa,
                mesDesde, anioDesde, mesHasta, anioHasta,
            });

            if (resultado.success) {
                console.log(`✅ Extracción completada. Subiendo a BD...`);
                
                // Inyectamos llamando a la función importada en lugar de usar exec
                const cargaExitosa = await cargarJSONaBD(empresaId);
                
                if (cargaExitosa) {
                    return res.json({ success: true, message: "Datos extraídos y guardados en tu base de datos con éxito." });
                } else {
                    return res.status(500).json({ success: false, message: "Los datos se extrajeron, pero falló la escritura en BD." });
                }
            } else {
                return res.status(500).json({
                    success: false,
                    message: resultado.error || "Fallo durante la ejecución del robot en el portal del SII.",
                });
            }
        } catch (error) {
            // El mensaje del robot VIAJA a la pantalla. Antes se reemplazaba por
            // "Error interno del servidor al iniciar Puppeteer", así que cuando el
            // SII decía "La Clave Tributaria ingresada no es correcta" el usuario
            // veía un error genérico y no tenía idea de qué corregir.
            console.error("❌ Error al ejecutar robot manual:", error);
            return res.status(500).json({
                success: false,
                message: error.message || "Error interno del servidor al iniciar Puppeteer.",
            });
        }
    }

    // 2. MODO GLOBAL (El que ya tenías)
    if (tipo !== 'VENTAS' && tipo !== 'COMPRAS') {
        return res.status(400).json({ success: false, message: "Tipo inválido." });
    }

    const exito = await ejecutarSincronizacion(tipo);

    if (exito) {
        res.json({ success: true, message: `Historial de ${tipo.toLowerCase()} sincronizado correctamente.` });
    } else {
        res.status(500).json({ success: false, message: "Falla en el robot global al sincronizar." });
    }
});

// ============================================================================
// ⏰ TAREAS PROGRAMADAS (DESHABILITADAS - Solo Manual para Administradores)
// ============================================================================
// ❌ Las tareas automáticas están comentadas
// ✅ Solo se ejecutan manualmente cuando un ADMINISTRADOR las solicita vía API

// Sincronización Nocturna (02:00 AM) - DESHABILITADA
// cron.schedule('0 2 * * *', async () => {
//     console.log('⏸️ [CRON NOCTURNO] Deshabilitado - Solo se ejecuta manualmente');
// });

// Sincronización cada 4 horas - DESHABILITADA
// cron.schedule('0 */4 * * *', async () => {
//     console.log('⏸️ [CRON 4H] Deshabilitado - Solo se ejecuta manualmente');
// });

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

// Verificación de esquema (idempotente) al arrancar
const ensureSchema = async () => {
  try {
    await pool.query(`ALTER TABLE documentos_emitidos ADD COLUMN IF NOT EXISTS razon_social_cliente TEXT`);
    await pool.query(`ALTER TABLE documentos_emitidos ADD COLUMN IF NOT EXISTS monto_iva NUMERIC DEFAULT 0`);
    await pool.query(`ALTER TABLE documentos_emitidos ADD COLUMN IF NOT EXISTS monto_total NUMERIC DEFAULT 0`);
    // Folios grandes (> 2.147.483.647) requieren BIGINT
    for (const t of ['documentos_emitidos', 'documentos_emitidos_empresa', 'documentos_recibidos', 'documentos_recibidos_empresa']) {
      await pool.query(`ALTER TABLE ${t} ALTER COLUMN folio TYPE BIGINT`);
    }
    // Auditoría de contabilización: quién y cuándo
    await pool.query(`ALTER TABLE comprobantes ADD COLUMN IF NOT EXISTS contabilizado_por TEXT`);
    await pool.query(`ALTER TABLE comprobantes ADD COLUMN IF NOT EXISTS contabilizado_por_id TEXT`);
    await pool.query(`ALTER TABLE comprobantes ADD COLUMN IF NOT EXISTS contabilizado_at TIMESTAMP`);
    // Recaudaciones y Pagos (caja)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS movimientos_caja (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id TEXT,
        tipo TEXT NOT NULL,
        fecha DATE NOT NULL DEFAULT CURRENT_DATE,
        rut TEXT, nombre TEXT, folio_asociado TEXT,
        monto NUMERIC NOT NULL DEFAULT 0,
        medio_pago TEXT, glosa TEXT, creado_por TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )`);
    // 📧 Registro de correos de facturas (1 fila por folio, se actualiza en cada envío/reenvío)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS correos_facturas (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        folio TEXT UNIQUE,
        rut TEXT,
        razon_social TEXT,
        correo TEXT,
        estado TEXT,
        motivo TEXT,
        datos JSONB,
        fecha TIMESTAMP DEFAULT NOW()
      )`);
    console.log('✅ Esquema verificado (documentos + comprobantes + caja + correos)');
  } catch (e) {
    console.error('⚠️ No se pudo verificar el esquema:', e.message);
  }
};

const server = app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en el puerto ${PORT}`);
  ensureSchema();
  // Vuelve a levantar las sesiones de WhatsApp ya vinculadas (las credenciales
  // viven en la BD). Las que nunca se escanearon esperan al botón "Conectar".
  reconectarSesionesGuardadas();
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