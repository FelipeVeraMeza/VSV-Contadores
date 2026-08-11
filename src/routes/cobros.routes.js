import { Router } from 'express';
import { requireSession, requireAdmin, requireModulo } from '../middleware/auth.js';
import {
  listarCobros, resumenCobros, generarCobros, emitirCobro, cambiarEstadoCobro,
  recalcularMontos, editarMontoCobro,
  previsualizarFacturacion, facturarCobrosMasivo, progresoFacturacion, vincularFolios,
  sincronizarNotasCredito, registrarPagoCliente, conciliarCobranza
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

// Registrar el pago de un cliente completo, desde el CRM. Con ?soloVencidos=1
// salda únicamente los meses ya vencidos y deja lo que aún está en plazo.
router.put('/empresa/:empresaId/pagar', registrarPagoCliente);

// Conciliar el mes contra la planilla de cobranza: los que vienen en la
// planilla deben, el resto queda pagado. Arranca en modo SIMULACIÓN: sin
// `simular: false` no escribe nada.
router.post('/conciliar', conciliarCobranza);

// Facturación masiva (robot SII): previsualizar, disparar, seguir progreso y vincular folios
router.get('/previsualizar-facturacion', previsualizarFacturacion);
router.post('/facturar-masivo', facturarCobrosMasivo);
router.get('/progreso', progresoFacturacion);
router.post('/vincular-folios', vincularFolios);

// Descuenta del ciclo las notas de crédito emitidas (anulaciones y rebajas)
router.post('/sincronizar-notas-credito', sincronizarNotasCredito);

export default router;
