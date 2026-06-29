import { Router } from "express";
import path from 'path';
import fs from 'fs';

// ==========================================
// 🧠 CONTROLADORES
// ==========================================
import { 
    emitirDTE, 
    cerrarSesion,
    emitirManualController,
    emitirMasivoController,
    reenviarCorreoController,
    reenviarCorreosMasivoController,
    getCorreosLogController,
    emitirExentaManualController,
    emitirExentaMasivaController,
    emitirNotaController, // <-- NUEVO CONTROLADOR INTEGRADO
    getDtesEmitidos,
    testConnection,
    loginDTE,
    checkSIIStatus,
    getSessionData,
    verificarSesion,
    obtenerPDF,
    emitirBoletaHonorarios,
    getHistorialController 
} from "../controllers/dte.controllers.js";

// ==========================================
// 🛑 BOTONES DE PÁNICO (TRACKERS)
// ==========================================
import { estadoRobot, detenerRobot } from '../components/facturacion/scripts/factura_masiva.mjs';
import { estadoRobotExenta, detenerRobotExenta } from '../components/facturacion/scripts/exenta_masiva.mjs';

const dteRoutes = Router();

// ==========================================
// 🔗 RUTAS BÁSICAS DEL SISTEMA
// ==========================================
dteRoutes.post('/login', loginDTE);
dteRoutes.post('/cerrar-sesion', cerrarSesion);
dteRoutes.get('/status', checkSIIStatus);
dteRoutes.get('/session-data', getSessionData);
dteRoutes.get('/verificar-sesion', verificarSesion);
dteRoutes.get('/test-conexion', testConnection);

// ==========================================
// 🚀 RUTAS DE PUPPETEER: DTE 33 (AFECTA)
// ==========================================
dteRoutes.post('/emitir-manual', emitirManualController);
dteRoutes.post('/emitir-masivo', emitirMasivoController);
dteRoutes.get('/progreso-masivo', (req, res) => res.json(estadoRobot));
dteRoutes.post('/detener-masivo', (req, res) => {
    detenerRobot();
    res.json({ ok: true, message: "Orden de detención enviada (DTE 33)." });
});

// 📧 Reenviar manualmente el correo de una factura (por folio)
dteRoutes.post('/reenviar-correo', reenviarCorreoController);

// 📧 Reenvío MASIVO de los correos seleccionados
dteRoutes.post('/reenviar-correos-masivo', reenviarCorreosMasivoController);

// 📒 Registro de correos enviados (desde la BD)
dteRoutes.get('/correos-log', getCorreosLogController);

// ==========================================
// 🌟 RUTAS DE PUPPETEER: DTE 34 (EXENTA)
// ==========================================
dteRoutes.post('/emitir-exenta-manual', emitirExentaManualController);
dteRoutes.post('/emitir-masivo-exenta', emitirExentaMasivaController);
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
dteRoutes.get('/historial', getHistorialController);
dteRoutes.post('/emitir-dte', emitirDTE);
dteRoutes.post('/dtes-emitidos', getDtesEmitidos);
dteRoutes.post('/obtener-pdf', obtenerPDF);
dteRoutes.post('/emitir-boleta', emitirBoletaHonorarios);

dteRoutes.get('/download/:fileName', (req, res) => {
    const { fileName } = req.params;
    const filePath = path.resolve(process.cwd(), 'tmp', fileName);
    if (fs.existsSync(filePath)) {
        res.download(filePath, fileName, (err) => {
            if (err && !res.headersSent) res.status(500).send("Error de descarga.");
        });
    } else {
        res.status(404).send("El archivo no existe.");
    }
});

export default dteRoutes;