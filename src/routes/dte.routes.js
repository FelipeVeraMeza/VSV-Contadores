import { Router } from "express";
import path from 'path';
import fs from 'fs';

// ==========================================
// 🧠 CONTROLADORES
// ==========================================
import { 
    emitirDTE, 
    emitirManualController,
    emitirMasivoController,
    reenviarCorreoController,
    reenviarCorreosMasivoController,
    progresoReenvioController,
    getCorreosLogController,
    previewRecordatoriosController,
    facturasSinCobro,
    enviarRecordatoriosController,
    getProgresoRecordatoriosController,
    emitirExentaManualController,
    emitirExentaMasivaController,
    emitirNotaController, // <-- NUEVO CONTROLADOR INTEGRADO
} from "../controllers/dte.controllers.js";

// ==========================================
// 🛑 BOTONES DE PÁNICO (TRACKERS)
// ==========================================
import { estadoRobot, detenerRobot } from '../components/facturacion/scripts/factura_masiva.mjs';
import { estadoRobotExenta, detenerRobotExenta } from '../components/facturacion/scripts/exenta_masiva.mjs';
import { estadoFacturaManual } from '../components/facturacion/scripts/factura_manual.mjs';
import { buscarYDescargarPdf, estadoDescarga } from '../components/facturacion/scripts/buscar_pdf_folio.mjs';
import { requireSession, requireAdmin, requireModulo } from '../middleware/auth.js';
import { envioMasivoLimiter } from '../config/security.js';

const dteRoutes = Router();

// ============================================================================
// 🔒 TODO EL FACTURADOR EXIGE SESIÓN
// ----------------------------------------------------------------------------
// Hasta el 31-jul-2026 solo `/correos-log` pedía sesión. Las otras 24 rutas
// estaban abiertas: cualquiera que alcanzara la dirección de la API podía
// emitir una factura real al SII, facturar en lote, mandarle correo a los 93
// clientes o frenar el robot a media corrida. Sin cuenta ni contraseña.
//
// Va como middleware del router completo y no ruta por ruta, para que una ruta
// nueva quede protegida por omisión en vez de quedar abierta por olvido.
//
// Requisito para que esto no rompa nada: TODAS las llamadas del frontend pasan
// por `src/services/apiDTE.js`, que adjunta la cabecera `x-session-id`.
// ============================================================================
dteRoutes.use(requireSession);

// Acciones sobre la cartera COMPLETA de la firma, no sobre una empresa: van
// además con rol Administrador. La emisión (individual o en lote) se queda solo
// con sesión a propósito, porque un Cliente factura para su propia empresa.
const soloAdmin = [requireAdmin];

// ==========================================
// 🗑️ RUTAS RETIRADAS EL 31-JUL-2026
// ------------------------------------------
// /login, /cerrar-sesion, /status, /session-data, /verificar-sesion,
// /test-conexion, /historial, /dtes-emitidos, /obtener-pdf y /emitir-boleta.
//
// Ninguna pantalla las llamaba y cuatro de ellas devolvían 500 con cualquier
// sesión. Eran superficie que había que mantener y proteger sin que nadie la
// usara. El historial que sí funciona vive en /api/dte-consulta/historial.
//
// Sus controladores siguen exportados en dte.controllers.js por si hay que
// reponer alguna.
// ==========================================

// ==========================================
// 🚀 RUTAS DE PUPPETEER: DTE 33 (AFECTA)
// ==========================================
dteRoutes.post('/emitir-manual', emitirManualController);
dteRoutes.post('/emitir-masivo', envioMasivoLimiter, emitirMasivoController);
dteRoutes.get('/progreso-masivo', (req, res) => res.json(estadoRobot));
// Avance de la factura INDIVIDUAL. Emitir una tarda entre 30 y 90 segundos y
// hasta ahora la pantalla no podia decir en que paso iba.
dteRoutes.get('/progreso-manual', (req, res) => res.json(estadoFacturaManual));

// ============================================================================
// DESCARGAR EL PDF DE UN FOLIO  ·  se va a buscar al SII en el momento
// ----------------------------------------------------------------------------
// No se guarda ningún documento: el robot entra al SII, busca el folio y
// devuelve el PDF. Tarda entre 30 y 90 segundos, que es el precio de tener
// siempre el documento oficial sin copias que puedan quedar viejas.
// ============================================================================
dteRoutes.get('/pdf/:folio', soloAdmin, async (req, res) => {
    const { folio } = req.params;
    const tipo = Number(req.query.tipo) || 33;
    // ?ver=1 abre el navegador a la vista para poder mirar qué hace el robot.
    // Solo tiene sentido con el servidor corriendo en el propio computador.
    const verNavegador = req.query.ver === '1';
    try {
        const { contenido, nombre } = await buscarYDescargarPdf(folio, tipo, { verNavegador });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
        res.setHeader('Content-Length', contenido.length);
        return res.end(contenido);
    } catch (err) {
        console.error(`❌ [PDF] Folio ${folio}: ${err.message}`);
        // JSON y no un PDF roto: la pantalla necesita poder mostrar el motivo.
        return res.status(502).json({ ok: false, error: err.message });
    }
});

// En qué va la descarga (la pantalla lo consulta mientras espera).
dteRoutes.get('/pdf-progreso', soloAdmin, (req, res) => res.json(estadoDescarga));
dteRoutes.post('/detener-masivo', (req, res) => {
    detenerRobot();
    res.json({ ok: true, message: "Orden de detención enviada (DTE 33)." });
});

// 📧 Reenviar manualmente el correo de una factura (por folio)
dteRoutes.post('/reenviar-correo', reenviarCorreoController);

// 📧 Reenvío MASIVO de los correos seleccionados
dteRoutes.post('/reenviar-correos-masivo', soloAdmin, envioMasivoLimiter, reenviarCorreosMasivoController);
// Progreso del reenvío en curso: la pantalla lo sondea para avisar al terminar.
dteRoutes.get('/progreso-reenvio', progresoReenvioController);

// 📒 Registro de correos enviados (desde la BD) — requiere sesión
dteRoutes.get('/correos-log', getCorreosLogController);

// 📢 Recordatorios de pago (módulo aparte)
dteRoutes.get('/recordatorios/preview', soloAdmin, previewRecordatoriosController);

// Facturas emitidas al SII que la cobranza no persigue. NO filtra por mes a
// propósito: el problema se veía repartido entre meses y nadie veía el total.
dteRoutes.get('/facturas-sin-cobro', soloAdmin, facturasSinCobro);
dteRoutes.post('/enviar-recordatorios', soloAdmin, envioMasivoLimiter, enviarRecordatoriosController);
dteRoutes.get('/recordatorios/progreso', soloAdmin, getProgresoRecordatoriosController);

// ==========================================
// 🌟 RUTAS DE PUPPETEER: DTE 34 (EXENTA)
// ==========================================
dteRoutes.post('/emitir-exenta-manual', emitirExentaManualController);
dteRoutes.post('/emitir-masivo-exenta', envioMasivoLimiter, emitirExentaMasivaController);
dteRoutes.get('/progreso-masivo-exenta', (req, res) => res.json(estadoRobotExenta));
dteRoutes.post('/detener-robot-exenta', (req, res) => {
    detenerRobotExenta();
    res.json({ ok: true, message: "Orden de detención enviada (DTE 34)." });
});

// ==========================================
// 🔄 RUTAS DE PUPPETEER: DTE 61 / 56 (NOTAS C/D)
// ==========================================
dteRoutes.post('/emitir-nota', emitirNotaController);

// ==========================================
// 📊 RUTAS DE HISTORIAL Y DESCARGAS
// ==========================================
dteRoutes.post('/emitir-dte', emitirDTE);

// Descarga de un PDF generado por el robot.
//
// ⚠️ Acá había una fuga grave: `fileName` se concatenaba tal cual a la ruta, así
// que `GET /api/dte/download/..%2F..%2F.env` salía de `tmp/` y entregaba
// cualquier archivo del servidor — incluido el `.env` con la clave de la base,
// la ENCRYPTION_KEY y las claves del SII. Comprobado: devolvía HTTP 200.
//
// Dos candados: se descarta el nombre si trae separadores de ruta, y después se
// verifica que la ruta final siga estando DENTRO de tmp/ (por si un `%2e%2e` o
// un enlace simbólico se cuela igual).
dteRoutes.get('/download/:fileName', (req, res) => {
    const { fileName } = req.params;

    if (!fileName || /[\\/]|\.\./.test(fileName)) {
        return res.status(400).send("Nombre de archivo no válido.");
    }

    const carpeta = path.resolve(process.cwd(), 'tmp');
    const filePath = path.resolve(carpeta, fileName);

    if (!filePath.startsWith(carpeta + path.sep)) {
        return res.status(400).send("Nombre de archivo no válido.");
    }

    if (!fs.existsSync(filePath)) {
        return res.status(404).send("El archivo no existe.");
    }

    res.download(filePath, fileName, (err) => {
        if (err && !res.headersSent) res.status(500).send("Error de descarga.");
    });
});

export default dteRoutes;