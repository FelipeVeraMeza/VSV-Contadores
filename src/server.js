// PRIMERO DE TODO: la zona horaria del proceso. Va antes que cualquier otro
// import porque fija cómo se escribe cada fecha que salga del backend.
import './config/zonaHoraria.js';

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
import { requireSession, requireAdmin , requireModulo } from './middleware/auth.js';

// Routes
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/users.routes.js';
import companyRoutes from './routes/company.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import clientesRoutes from './routes/clientes.routes.js';
import personasRoutes from './routes/personas.routes.js';
import crmRoutes from './routes/crm.routes.js';
import reunionesRoutes from './routes/reuniones.routes.js';
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
import correosRoutes from "./routes/correos.routes.js";
import bajaRoutes from "./routes/baja.routes.js";
import asistenteRoutes from "./routes/asistente.routes.js";
import { cerrarCampanasZombi } from "./controllers/correos.controllers.js";
import { reconectarSesionesGuardadas } from "./services/whatsapp/whatsappBot.js";

// Importación del Robot Manual
import { ejecutarRobotSII } from './components/contabilidad/scripts/sincronizador_sii.mjs';
import { credencialesSiiDeEmpresa } from './utils/credencialesSii.js';
import { cargarJSONaBD } from './components/contabilidad/scripts/subir_documentos_db.mjs';

// 🔒 Estado del Facturador Masivo: si está activo, NO sincronizamos el SII (misma cuenta = se botan la sesión)
import { estadoRobot } from './components/facturacion/scripts/factura_masiva.mjs';
import { iniciarRecordatoriosReunion } from './utils/recordatorioReunion.js';
import {
    estadoSincronizacion, comenzarSincronizacion,
    avanzarSincronizacion, terminarSincronizacion,
} from './utils/estadoSincronizacion.js';
import { mesesAtras } from './sii_core/rangoSincronizacion.mjs';

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
app.use('/api/clientes', apiLimiter, requireSession, requireModulo('crm'), clientesRoutes);
app.use('/api/personas', apiLimiter, personasRoutes);
// El canal de avisos en vivo necesita marcarse ANTES de requireSession, porque
// éste corre acá arriba y no dentro del router. Lo abre `EventSource`, que no
// puede mandar cabeceras, así que su sesión viaja en la URL — y solo la suya.
app.use('/api/crm', (req, _res, next) => {
    if (req.path === '/notificaciones/stream') req.permitirSesionEnUrl = true;
    next();
});
app.use('/api/crm', apiLimiter, requireSession, requireModulo('crm'), crmRoutes);

// Reuniones. Sin recorte por modulo, igual que los tickets: a una reunion se
// entra a una hora fija y quedarse afuera por un permiso mal puesto no tiene
// arreglo en el momento. El video no pasa por aca, solo el contexto.
app.use('/api/reuniones', apiLimiter, requireSession, reunionesRoutes);

// ============================================================================
// 🔐 RECORTE DE MÓDULOS POR USUARIO
// ----------------------------------------------------------------------------
// `requireSession` va acá, ANTES de requireModulo, porque el candado necesita
// saber quién es para leer sus banderas. Montarlo dentro de cada router lo
// dejaba corriendo demasiado temprano: `req.user` todavía no existía y dejaba
// pasar a todos. requireSession es idempotente, así que el que ya hace cada
// router no vuelve a consultar la base.
// ============================================================================
app.use('/api/accounting', apiLimiter, requireSession, requireModulo('contabilidad'), accountingRoutes);
app.use('/api/rrhh', apiLimiter, requireSession, requireModulo('rrhh'), rrhhRoutes);
app.use('/api/renta', apiLimiter, requireSession, requireModulo('operacion_renta'), rentaRoutes);
app.use('/api/bancos', apiLimiter, bancoRoutes);
app.use('/api/dte', apiLimiter, requireSession, requireModulo('facturacion'), dteRoutes);
app.use("/api/dte-consulta", apiLimiter, dteConsultaRoutes);
app.use("/api/caja", apiLimiter, cajaRoutes);
app.use('/api/credenciales', apiLimiter, credencialesRoutes);
app.use('/api/cobros', apiLimiter, requireSession, requireModulo('facturacion'), cobrosRoutes);
app.use('/api/whatsapp', apiLimiter, whatsappRoutes);
// Correos personalizados a un conjunto de clientes. Va bajo el módulo `crm`
// porque se escribe a la cartera, no a los documentos tributarios.
app.use('/api/correos', apiLimiter, requireSession, requireModulo('crm'), correosRoutes);

// Desuscripción: PÚBLICA a propósito, sin `requireSession`. Quien pulsa
// «cancelar suscripción» al pie de un correo es un cliente que no tiene cuenta
// en el sistema; un enlace de baja que exige iniciar sesión no sirve de nada.
// La protección está en la firma del token, no en la sesión.
app.use('/api/baja', apiLimiter, bajaRoutes);

// VSV AI · el asistente. Este backend hace de PUENTE hacia el servicio de IA,
// que corre en su propio contenedor porque está en Python.
//
// Así el frontend tiene una sola dirección que configurar, y el asistente queda
// detrás de la misma autenticación que todo lo demás. Ver
// asistente.controllers.js para el porqué de la separación.
app.use('/api/asistente', apiLimiter, asistenteRoutes);

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
                    // EL MENSAJE DICE LO QUE PASÓ DE VERDAD.
                    //
                    // Antes una extracción que no trajo NADA respondía «Datos
                    // extraídos y guardados con éxito», igual que una de
                    // doscientos documentos. El usuario veía el visto verde,
                    // buscaba las compras y no había ninguna, sin forma de saber
                    // si el SII no tenía nada o si el robot se había roto en
                    // silencio. Pasó con A&L SOLUCIONES el 27-08-2026.
                    const { compras = 0, ventas = 0, omitidos = 0 } = cargaExitosa;
                    const total = compras + ventas;
                    let message;
                    if (total > 0) {
                        message = `Se agregaron ${compras} compra(s) y ${ventas} venta(s).`;
                        if (omitidos) message += ` Otros ${omitidos} ya estaban registrados.`;
                    } else if (omitidos > 0) {
                        message = `Sin novedades: los ${omitidos} documentos del periodo ya estaban registrados.`;
                    } else {
                        message = 'El SII no tiene documentos registrados en ese periodo, así que no se agregó nada. Revisa que el rango de meses sea el correcto.';
                    }
                    return res.json({ success: true, message, compras, ventas, omitidos });
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

    // ========================================================================
    // 2. MODO GLOBAL · ventas + compras, EN SEGUNDO PLANO
    // ------------------------------------------------------------------------
    // Antes esto corría dentro de la petición: dos robots del SII en cadena,
    // varios minutos, con el navegador esperando la respuesta. Si el usuario
    // cerraba la pestaña o se le caía la conexión, quedaba sin saber si había
    // terminado —el robot seguía vivo en el servidor, invisible— y con un proxy
    // de por medio la petición se cortaba sola por timeout igual.
    //
    // Ahora se responde al toque y el avance se consulta en /sincronizar-sii/
    // progreso, que es como ya funcionaba el facturador masivo.
    // ========================================================================
    if (tipo !== 'VENTAS' && tipo !== 'COMPRAS' && tipo !== 'TODO') {
        return res.status(400).json({ success: false, message: "Tipo inválido." });
    }

    if (estadoSincronizacion.activo) {
        return res.status(409).json({
            success: false,
            message: `Ya hay una sincronización en curso${
                estadoSincronizacion.lanzadoPor ? ` (la lanzó ${estadoSincronizacion.lanzadoPor})` : ''
            }. Espera a que termine.`,
        });
    }
    // El mismo candado que ya tenía `ejecutarSincronizacion`, pero comprobado
    // ANTES de responder: así el usuario se entera al apretar y no minutos
    // después. Las dos cosas usan la misma cuenta del SII y se botan la sesión.
    if (estadoRobot.activo) {
        return res.status(409).json({
            success: false,
            message: 'El facturador masivo está emitiendo ahora. No se puede tocar el SII hasta que termine.',
        });
    }

    // CUÁNTOS MESES HACIA ATRÁS · lo elige quien aprieta el botón.
    // Viaja al robot por variable de entorno porque los orquestadores corren en
    // OTRO proceso (`exec`), así que no se les puede pasar un argumento normal.
    // Se valida acá igual que en rangoSincronizacion.mjs: un valor raro cae al
    // de siempre en vez de dejar la sincronización sin correr.
    const mesesPedidos = Number.parseInt(req.body?.meses, 10);
    const meses = Number.isFinite(mesesPedidos) && mesesPedidos >= 1
        ? Math.min(mesesPedidos, 24)
        : undefined;

    comenzarSincronizacion(req.user?.nombre || null);
    res.status(202).json({
        success: true,
        message: 'La sincronización arrancó. Puedes seguir trabajando; el avance se ve en la pantalla.',
    });

    // A partir de acá ya se respondió: esto corre solo. Nada de lo que pase
    // puede escribir en `res`, y por eso todo va envuelto en try/catch —una
    // excepción suelta acá tumbaría el proceso entero.
    (async () => {
        const partes = tipo === 'TODO' ? ['VENTAS', 'COMPRAS'] : [tipo];
        estadoSincronizacion.total = partes.length;
        estadoSincronizacion.meses = meses ?? mesesAtras();
        // El robot corre en otro proceso y lee SII_MESES_ATRAS del entorno. Se
        // fija acá para esta corrida y se restaura al final: dejarlo cambiado
        // afectaría a la próxima sincronización sin que nadie lo pidiera.
        const mesesPrevios = process.env.SII_MESES_ATRAS;
        if (meses) process.env.SII_MESES_ATRAS = String(meses);
        try {
            for (let i = 0; i < partes.length; i++) {
                const parte = partes[i];
                avanzarSincronizacion(
                    parte.toLowerCase(), i + 1,
                    `Extrayendo ${parte.toLowerCase()} desde el SII…`);
                const exito = await ejecutarSincronizacion(parte);
                if (!exito) {
                    terminarSincronizacion(false,
                        `Falló la extracción de ${parte.toLowerCase()}.`,
                        'El robot no pudo completar la extracción en el portal del SII.');
                    return;
                }
            }
            terminarSincronizacion(true,
                partes.length > 1
                    ? 'Ventas y compras actualizadas.'
                    : `${partes[0].charAt(0)}${partes[0].slice(1).toLowerCase()} actualizadas.`);
        } catch (error) {
            console.error('❌ Error en la sincronización de fondo:', error);
            terminarSincronizacion(false, 'La sincronización se cortó por un error.', error.message);
        } finally {
            // Se deja el entorno como estaba, pase lo que pase.
            if (mesesPrevios === undefined) delete process.env.SII_MESES_ATRAS;
            else process.env.SII_MESES_ATRAS = mesesPrevios;
        }
    })();
});

// El avance de la sincronización. Se consulta cada pocos segundos mientras
// corre; devuelve el estado tal cual, incluido el resultado de la última vez,
// para que la pantalla pueda mostrarlo aunque el usuario no estuviera mirando.
app.get('/api/sincronizar-sii/progreso', requireSession, (req, res) => {
    res.json({ success: true, ...estadoSincronizacion });
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

// RECORDATORIO DE REUNIONES · este SÍ corre solo, y es la excepción a la regla
// de arriba. Los dos cron comentados son robots del SII: pesados, lentos y con
// efectos hacia afuera, por eso se dejaron a mano. Este es lo contrario —una
// consulta a un índice parcial que casi siempre devuelve cero filas y, cuando
// devuelve algo, solo escribe una notificación interna—. Y a mano no serviría:
// el sentido del aviso es que llegue 15 minutos antes sin que nadie lo pida.
iniciarRecordatoriosReunion();

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

  // Cuando express rechaza el cuerpo por tamaño, el mensaje que sale es
  // "request entity too large": correcto y completamente inútil para quien
  // acaba de intentar subir un archivo. Se traduce a algo accionable.
  if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({
      status: 'error',
      success: false,
      message: 'El archivo es demasiado grande para enviarlo. El máximo por archivo es 7 MB.',
    });
  }

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

// ============================================================================
// ARRANQUE BLINDADO
// ----------------------------------------------------------------------------
// Al levantarse, el servidor dispara tres trabajos pesados: verificar el
// esquema, reconectar las sesiones de WhatsApp y cerrar campañas de correo que
// quedaron a medias. Ninguno es indispensable para atender peticiones.
//
// El problema: más abajo hay un `process.on('unhandledRejection')` que apaga el
// proceso entero. Si cualquiera de estos tres falla —y en el servidor de
// producción el entorno NO es el mismo que en el computador de uno: puede
// faltar Chrome para WhatsApp, o la base puede tardar—, el servidor se cae
// apenas parte y la página entera queda con "Búnker inaccesible", aunque el
// login y todo lo demás estuvieran perfectos.
//
// Acá cada trabajo se ejecuta aislado: si se cae, se anota y el servidor sigue
// atendiendo. Un WhatsApp que no reconecta es un problema de WhatsApp, no una
// razón para dejar a la oficina sin sistema.
const alArrancar = (nombre, fn) => {
  try {
    Promise.resolve(fn()).catch((e) =>
      console.error(`⚠️  [arranque] ${nombre} falló, el servidor sigue en pie:`, e?.message || e));
  } catch (e) {
    console.error(`⚠️  [arranque] ${nombre} falló, el servidor sigue en pie:`, e?.message || e);
  }
};

const server = app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en el puerto ${PORT}`);
  alArrancar('verificar esquema', ensureSchema);
  // Vuelve a levantar las sesiones de WhatsApp ya vinculadas (las credenciales
  // viven en la BD). Las que nunca se escanearon esperan al botón "Conectar".
  alArrancar('reconectar WhatsApp', reconectarSesionesGuardadas);

  // Si el servidor se cayó (o se desplegó) a mitad de un envío masivo, la
  // campaña quedó en 'enviando' en la base aunque en memoria ya no hay nada
  // corriendo. Se cierran acá para que el registro no mienta y para saber a
  // quiénes NO les llegó.
  alArrancar('cerrar campañas a medias', cerrarCampanasZombi);
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