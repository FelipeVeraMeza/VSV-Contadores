import { Router } from "express";
import {
    consultarHistorialBunkerController,
    consultarComprasBunkerController,
    crearMovimientoManual,
    eliminarMovimiento,
    descontabilizarMovimiento,
    editarMovimiento,
} from "../controllers/dteConsulta.controllers.js";
import { requireSession } from "../middleware/auth.js";

const dteConsultaRoutes = Router();

// Exigen sesión: sin ella cualquiera podía descargar las compras y ventas de todas
// las empresas, y además hace falta req.user para acotar a su organización.
dteConsultaRoutes.get('/historial', requireSession, consultarHistorialBunkerController);
dteConsultaRoutes.get('/compras', requireSession, consultarComprasBunkerController);
dteConsultaRoutes.post('/movimiento', requireSession, crearMovimientoManual);
dteConsultaRoutes.put('/movimiento/:id', requireSession, editarMovimiento);
dteConsultaRoutes.delete('/movimiento/:id', requireSession, eliminarMovimiento);
// Deshace la contabilización sin borrar el documento (vuelve a "Pendiente").
dteConsultaRoutes.delete('/movimiento/:id/asiento', requireSession, descontabilizarMovimiento);

export default dteConsultaRoutes;