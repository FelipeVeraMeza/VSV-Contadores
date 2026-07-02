import { Router } from 'express';
import { crearMovimientoCaja, crearMovimientosCajaLote, listarMovimientosCaja, editarMovimientoCaja, eliminarMovimientoCaja } from '../controllers/caja.controllers.js';
import { requireSession } from '../middleware/auth.js';

const router = Router();
router.use(requireSession);

router.post('/lote', crearMovimientosCajaLote);
router.post('/', crearMovimientoCaja);
router.get('/', listarMovimientosCaja);
router.patch('/:id', editarMovimientoCaja);
router.delete('/:id', eliminarMovimientoCaja);

export default router;
