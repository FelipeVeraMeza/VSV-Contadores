import { Router } from 'express';
import { requireSession, requireAdmin } from '../middleware/auth.js';
import {
  listarCobros, resumenCobros, generarCobros, emitirCobro, cambiarEstadoCobro,
  recalcularMontos, editarMontoCobro
} from '../controllers/cobros.controllers.js';

const router = Router();

// Ciclo de cobro mensual (solo administradores: es la facturación del despacho)
router.use(requireSession, requireAdmin);

router.get('/', listarCobros);                     // ?periodo=YYYY-MM&estado=...
router.get('/resumen', resumenCobros);             // KPIs + aviso del día 26
router.post('/generar', generarCobros);            // crea los POR_EMITIR del mes
router.post('/recalcular', recalcularMontos);      // recalcula montos desde el plan
router.put('/:id/emitir', emitirCobro);            // registra folio + monto emitido
router.put('/:id/estado', cambiarEstadoCobro);     // PAGADA | PENDIENTE_RECIBO | PENDIENTE_PAGO
router.put('/:id/monto', editarMontoCobro);        // corrige el monto a mano

export default router;
