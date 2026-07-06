import { Router } from 'express';
import { 
    getRrhhMetrics, 
    getEmployees, 
    getLiquidaciones,
    getDocuments,
    getAsistencia,
    generateReport,
    getRrhhConfig,
    updateRrhhConfig
} from '../controllers/rrhh.controllers.js';
import { requireSession, requireAdmin } from "../middleware/auth.js";

const router = Router();

router.use(requireSession);
router.use(requireAdmin);

router.get('/metrics', getRrhhMetrics);

router.get('/empleados', getEmployees);
router.get('/liquidaciones', getLiquidaciones);
router.get('/documentos', getDocuments);
router.get('/asistencia', getAsistencia);
router.get('/reportes/download', generateReport);

router.get('/config', getRrhhConfig);
router.put('/config', updateRrhhConfig);

export default router;