import { Router } from 'express';
import {
    addNotaCRM, editarNotaCRM, eliminarNotaCRM, getClientesCRM, updateClienteCRM,
    cambiarPlanCRM, addServicioCRM, removeServicioCRM, reactivarServicioCRM,
    actualizarServicioCRM, representanteExistente, toggleTicketCRM,
    crearEmpresaCRM, eliminarEmpresaCRM
} from '../controllers/clientes.controllers.js';
import { requireSession, requireModulo } from '../middleware/auth.js';

const router = Router();

router.get('/crm', requireSession, getClientesCRM);
router.post('/crm', requireSession, crearEmpresaCRM);
router.put('/crm/:empresaId', requireSession, updateClienteCRM);
router.delete('/crm/:empresaId', requireSession, eliminarEmpresaCRM);

// Bitácora (conversaciones / tickets)
router.post('/crm/:empresaId/notas', requireSession, addNotaCRM);
router.patch('/crm/notas/:notaId/resuelto', requireSession, toggleTicketCRM);
router.patch('/crm/notas/:notaId', requireSession, editarNotaCRM);
router.delete('/crm/notas/:notaId', requireSession, eliminarNotaCRM);

// Administración de planes
router.put('/crm/:empresaId/plan', requireSession, cambiarPlanCRM);

// ¿El RUT que se está cargando ya es representante de otra empresa? Solo avisa;
// tener un representante en varias empresas es normal. Lo que previene es el
// cruce de RUT con nombres distintos, que hace que el robot del SII entre a la
// cuenta equivocada sin fallar.
router.get('/crm/representante-existente', requireSession, representanteExistente);

// Servicios contratados
router.post('/crm/:empresaId/servicios', requireSession, addServicioCRM);
router.delete('/crm/servicios/:empresaServicioId', requireSession, removeServicioCRM);
// Modificar precio, periodicidad o 1ª facturación de un servicio ya contratado.
// Antes no existía: para corregir un honorario había que dar de baja y volver a
// agregar, lo que reinicia la fecha de inicio y pierde el historial.
router.patch('/crm/servicios/:empresaServicioId', requireSession, actualizarServicioCRM);
router.patch('/crm/servicios/:empresaServicioId/reactivar', requireSession, reactivarServicioCRM);

export default router;
