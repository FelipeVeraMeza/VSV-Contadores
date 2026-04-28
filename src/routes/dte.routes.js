import { Router } from "express";
import { 
    emitirDTE, 
    cerrarSesion,
    emitirManualController,
    emitirMasivoController,
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
import path from 'path';
import fs from 'fs';

// 🔥 RUTA CORREGIDA: Salimos de routes (../) para entrar a components
// Añade detenerRobot a la importación
import { estadoRobot, detenerRobot } from '../components/facturacion/scripts/factura_masiva.mjs';

const dteRoutes = Router();

// ==========================================
// RUTAS ORIGINALES Y DE SESIÓN
// ==========================================
dteRoutes.post('/emitir-dte', emitirDTE);
dteRoutes.post('/cerrar-sesion', cerrarSesion);

// ==========================================
// OTRAS RUTAS BASE DEL SISTEMA
// ==========================================
dteRoutes.post('/login', loginDTE);
dteRoutes.get('/status', checkSIIStatus);
dteRoutes.get('/session-data', getSessionData);
dteRoutes.post('/dtes-emitidos', getDtesEmitidos);
dteRoutes.get('/test-conexion', testConnection);
dteRoutes.get('/verificar-sesion', verificarSesion);
dteRoutes.post('/obtener-pdf', obtenerPDF);
dteRoutes.post('/emitir-boleta', emitirBoletaHonorarios);

// ==========================================
// RUTAS PARA PUPPETEER (EMISIÓN)
// ==========================================
dteRoutes.post('/emitir-manual', emitirManualController);
dteRoutes.post('/emitir-masivo', emitirMasivoController);

// ==========================================
// 🔥 NUEVA RUTA PARA EL PROGRESS BAR
// ==========================================
dteRoutes.get('/progreso-masivo', (req, res) => {
    res.json(estadoRobot);
});

// 🔥 NUEVA RUTA PARA DETENER EL ROBOT
dteRoutes.post('/detener-masivo', (req, res) => {
    detenerRobot(); // Llamamos a la función de pánico
    res.json({ ok: true, message: "Orden de detención enviada." });
});

dteRoutes.get('/historial', getHistorialController);

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