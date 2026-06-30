import { Router } from 'express';
import { crearMovimientoCaja, crearMovimientosCajaLote, listarMovimientosCaja, eliminarMovimientoCaja } from '../controllers/caja.controllers.js';
import { requireSession } from '../middleware/auth.js';

const router = Router();
router.use(requireSession);

router.post('/lote', crearMovimientosCajaLote);
router.post('/', crearMovimientoCaja);
router.get('/', listarMovimientosCaja);
router.delete('/:id', eliminarMovimientoCaja);

export default router;
