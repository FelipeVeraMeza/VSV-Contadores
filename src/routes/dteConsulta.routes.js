import { Router } from "express";
import {
    consultarHistorialBunkerController,
    consultarComprasBunkerController,
    crearMovimientoManual,
    eliminarMovimiento,
    editarMovimiento,
} from "../controllers/dteConsulta.controllers.js";
import { requireSession } from "../middleware/auth.js";

const dteConsultaRoutes = Router();

dteConsultaRoutes.get('/historial', consultarHistorialBunkerController);
dteConsultaRoutes.get('/compras', consultarComprasBunkerController);
dteConsultaRoutes.post('/movimiento', requireSession, crearMovimientoManual);
dteConsultaRoutes.put('/movimiento/:id', requireSession, editarMovimiento);
dteConsultaRoutes.delete('/movimiento/:id', requireSession, eliminarMovimiento);

export default dteConsultaRoutes;