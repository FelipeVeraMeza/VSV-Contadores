import { Router } from 'express';
import {
    getEmployees,
    getDocuments,
} from '../controllers/rrhh.controllers.js';
import {
    listAsistencia,
    upsertAsistencia,
    deleteAsistencia,
} from '../controllers/asistencia.controllers.js';
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
    generarMasivo,
    listLiquidaciones,
    getLiquidacion,
    getPayslip,
    enviarLiquidacion,
    getCertificado,
    cambiarEstadoLiquidacion,
    deleteLiquidacion,
    libroRemuneraciones,
    marcarPeriodoPagado,
    listFijos,
    createFijo,
    deleteFijo,
    listLicencias,
    createLicencia,
    deleteLicencia,
} from '../controllers/liquidaciones.controllers.js';
import {
    previewCentralizacion,
    getCentralizacion,
    centralizarPeriodo,
    reversarCentralizacion,
} from '../controllers/centralizacion.controllers.js';
import {
    getCausales,
    getVacaciones,
    registrarVacaciones,
    getVacacionesTrabajador,
    previewFiniquito,
    guardarFiniquito,
    listFiniquitos,
    getFiniquito,
} from '../controllers/finiquitos.controllers.js';
import { listCompaniesLista } from '../controllers/companies.controllers.js';
import { requireSession, requireAdmin } from "../middleware/auth.js";

const router = Router();

router.use(requireSession);
router.use(requireAdmin);

router.get('/metrics', getMetrics);
router.get('/dashboard', getDashboard);

router.get('/empleados', getEmployees);
router.get('/documentos', getDocuments);

// ── Asistencia (registro de jornada por período) ────────────────────────────
router.get('/asistencia', listAsistencia);
router.post('/asistencia', upsertAsistencia);
router.delete('/asistencia/:id', deleteAsistencia);

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

// ── Remuneraciones (Fase 6: vacaciones y finiquitos) ────────────────────────
router.get('/causales', getCausales);
router.get('/vacaciones', getVacaciones);
router.post('/vacaciones', registrarVacaciones);
router.get('/vacaciones/:id', getVacacionesTrabajador);
router.post('/finiquitos/preview', previewFiniquito);
router.post('/finiquitos', guardarFiniquito);
router.get('/finiquitos', listFiniquitos);
router.get('/finiquitos/:id', getFiniquito);

// ── Remuneraciones (Fase 1: ficha de trabajadores) ──────────────────────────
router.get('/catalogos', getCatalogos);
// Alias de la lista canónica (misma respuesta que GET /api/companies/lista).
router.get('/empresas', listCompaniesLista);
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
router.post('/liquidaciones/masivo', generarMasivo);
router.post('/liquidaciones', guardarLiquidacion);
router.get('/liquidaciones', listLiquidaciones);
router.get('/liquidaciones/:id/payslip', getPayslip);
router.post('/liquidaciones/:id/enviar', enviarLiquidacion);
router.get('/liquidaciones/:id', getLiquidacion);
router.patch('/liquidaciones/:id/estado', cambiarEstadoLiquidacion);
router.delete('/liquidaciones/:id', deleteLiquidacion);

// ── Remuneraciones (Fase 7: haberes/descuentos fijos y licencias médicas) ────
router.get('/haberes-fijos', listFijos);
router.post('/haberes-fijos', createFijo);
router.delete('/haberes-fijos/:id', deleteFijo);

router.get('/licencias', listLicencias);
router.post('/licencias', createLicencia);
router.delete('/licencias/:id', deleteLicencia);

// ── Certificados (antigüedad / renta) ───────────────────────────────────────
router.get('/certificado/:trabajadorId', getCertificado);

export default router;