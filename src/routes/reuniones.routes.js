import { Router } from 'express';
import {
    listarReuniones, obtenerReunion, crearReunion,
    entrarReunion, salirReunion, terminarReunion, cancelarReunion,
    agregarParticipante, quitarParticipante, editarNotas, eliminarReunion,
} from '../controllers/reuniones.controllers.js';
import { requireSession } from '../middleware/auth.js';

// Sin `requireModulo`: reunirse es transversal, como los tickets. Recortarlo
// por módulo dejaría a alguien sin poder entrar a una reunión a la que lo
// invitaron, que es el peor error posible en algo que pasa a una hora fija.
const router = Router();

router.get('/',            requireSession, listarReuniones);
router.post('/',           requireSession, crearReunion);
router.get('/:id',         requireSession, obtenerReunion);
router.post('/:id/entrar', requireSession, entrarReunion);
router.post('/:id/salir',  requireSession, salirReunion);
router.post('/:id/terminar', requireSession, terminarReunion);
router.post('/:id/cancelar', requireSession, cancelarReunion);

// Invitados. Sumar puede cualquiera que esté en la reunión; sacar, solo quien
// la convocó (ver el controlador).
router.post('/:id/participantes', requireSession, agregarParticipante);
router.delete('/:id/participantes/:usuarioId', requireSession, quitarParticipante);

// La nota de lo acordado se puede corregir después; el historial se puede
// limpiar. Las dos con sus candados en el controlador.
router.patch('/:id/notas', requireSession, editarNotas);
router.delete('/:id', requireSession, eliminarReunion);

export default router;
