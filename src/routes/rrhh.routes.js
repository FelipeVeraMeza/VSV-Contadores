import { Router } from 'express';
import {
    getEmployees,
    getDocuments,
    getAsistencia,
} from '../controllers/rrhh.controllers.js';
import {
    getMetrics,
    getDashboard,
    getParametros,
    upsertParametros,
    updateAfpComision,
    getConfigEmpresa,
    updateConfigEmpresa,
    getPlanCuentas,
    getCatalogos,
    listTrabajadores,
    getTrabajador,
    createTrabajador,
    updateTrabajador,
    deleteTrabajador,
} from '../controllers/remuneraciones.controllers.js';
import {
    listMovimientos,
    createMovimiento,
    deleteMovimiento,
    previewLiquidacion,
    guardarLiquidacion,
    listLiquidaciones,
    getLiquidacion,
    cambiarEstadoLiquidacion,
    deleteLiquidacion,
    libroRemuneraciones,
    marcarPeriodoPagado,
} from '../controllers/liquidaciones.controllers.js';
import {
    previewCentralizacion,
    getCentralizacion,
    centralizarPeriodo,
    reversarCentralizacion,
} from '../controllers/centralizacion.controllers.js';
import { requireSession, requireAdmin } from "../middleware/auth.js";

const router = Router();

router.use(requireSession);
router.use(requireAdmin);

router.get('/metrics', getMetrics);
router.get('/dashboard', getDashboard);

router.get('/empleados', getEmployees);
router.get('/documentos', getDocuments);
router.get('/asistencia', getAsistencia);

// ── Remuneraciones (Fase 3: indicadores y reportes) ─────────────────────────
router.get('/parametros', getParametros);
router.put('/parametros', upsertParametros);
router.put('/afp/:id', updateAfpComision);
router.get('/reportes/libro', libroRemuneraciones);
router.post('/liquidaciones/marcar-pagado', marcarPeriodoPagado);

// ── Remuneraciones (Fase 4: config contable y centralización) ───────────────
router.get('/config-empresa', getConfigEmpresa);
router.put('/config-empresa', updateConfigEmpresa);
router.get('/plan-cuentas', getPlanCuentas);
router.get('/centralizacion/preview', previewCentralizacion);
router.get('/centralizacion', getCentralizacion);
router.post('/centralizacion', centralizarPeriodo);
router.post('/centralizacion/reversar', reversarCentralizacion);

// ── Remuneraciones (Fase 1: ficha de trabajadores) ──────────────────────────
router.get('/catalogos', getCatalogos);
router.get('/trabajadores', listTrabajadores);
router.get('/trabajadores/:id', getTrabajador);
router.post('/trabajadores', createTrabajador);
router.put('/trabajadores/:id', updateTrabajador);
router.delete('/trabajadores/:id', deleteTrabajador);

// ── Remuneraciones (Fase 2: novedades y liquidaciones) ──────────────────────
router.get('/movimientos', listMovimientos);
router.post('/movimientos', createMovimiento);
router.delete('/movimientos/:id', deleteMovimiento);

router.post('/liquidaciones/preview', previewLiquidacion);
router.post('/liquidaciones', guardarLiquidacion);
router.get('/liquidaciones', listLiquidaciones);
router.get('/liquidaciones/:id', getLiquidacion);
router.patch('/liquidaciones/:id/estado', cambiarEstadoLiquidacion);
router.delete('/liquidaciones/:id', deleteLiquidacion);

export default router;