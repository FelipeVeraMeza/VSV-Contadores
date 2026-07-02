import { Router } from 'express';
import {
    addNotaCRM, editarNotaCRM, eliminarNotaCRM, getClientesCRM, updateClienteCRM,
    cambiarPlanCRM, addServicioCRM, removeServicioCRM, reactivarServicioCRM, toggleTicketCRM,
    crearEmpresaCRM, eliminarEmpresaCRM
} from '../controllers/clientes.controllers.js';
import { requireSession } from '../middleware/auth.js';

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

// Servicios contratados
router.post('/crm/:empresaId/servicios', requireSession, addServicioCRM);
router.delete('/crm/servicios/:empresaServicioId', requireSession, removeServicioCRM);
router.patch('/crm/servicios/:empresaServicioId/reactivar', requireSession, reactivarServicioCRM);

export default router;
