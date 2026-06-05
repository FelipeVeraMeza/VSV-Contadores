import { Router } from "express";
import {
    consultarHistorialBunkerController,
    consultarComprasBunkerController,
    crearMovimientoManual,
    eliminarMovimiento,
    editarMovimiento,
} from "../controllers/dteConsulta.controllers.js";

const dteConsultaRoutes = Router();

dteConsultaRoutes.get('/historial', consultarHistorialBunkerController);
dteConsultaRoutes.get('/compras', consultarComprasBunkerController);
dteConsultaRoutes.post('/movimiento', crearMovimientoManual);
dteConsultaRoutes.put('/movimiento/:id', editarMovimiento);
dteConsultaRoutes.delete('/movimiento/:id', eliminarMovimiento);

export default dteConsultaRoutes;