import { Router } from 'express';
import { 
    getRentaMetrics, 
    getAnalisisRenta, 
    getCalculoImpuestos, 
    getAnalisisSocios, 
    getDeclaracionesRenta 
} from '../controllers/renta.controllers.js';
import { requireSession, requireAdmin, requireModulo } from "../middleware/auth.js";


const router = Router();

router.use(requireSession);
router.use(requireAdmin);

router.get('/metrics', getRentaMetrics);
router.get('/analisis', getAnalisisRenta);
router.get('/calculo', getCalculoImpuestos);
router.get('/socios', getAnalisisSocios);
router.get('/declaraciones', getDeclaracionesRenta);

export default router;