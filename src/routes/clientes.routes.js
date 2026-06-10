import { Router } from 'express';
import {
    addNotaCRM, getClientesCRM, updateClienteCRM,
    cambiarPlanCRM, addServicioCRM, removeServicioCRM, toggleTicketCRM
} from '../controllers/clientes.controllers.js';
import { requireSession } from '../middleware/auth.js';

const router = Router();

router.get('/crm', requireSession, getClientesCRM);
router.put('/crm/:empresaId', requireSession, updateClienteCRM);

// Bitácora (conversaciones / tickets)
router.post('/crm/:empresaId/notas', requireSession, addNotaCRM);
router.patch('/crm/notas/:notaId/resuelto', requireSession, toggleTicketCRM);

// Administración de planes
router.put('/crm/:empresaId/plan', requireSession, cambiarPlanCRM);

// Servicios contratados
router.post('/crm/:empresaId/servicios', requireSession, addServicioCRM);
router.delete('/crm/servicios/:empresaServicioId', requireSession, removeServicioCRM);

export default router;
