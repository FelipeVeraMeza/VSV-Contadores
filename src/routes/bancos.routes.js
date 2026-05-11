import { Router } from 'express';
import { 
    getConnectedBanks,
    getMovimientosBancarios, 
    uploadCartola, 
    connectBank
} from '../controllers/bancos.controllers.js';

const router = Router();

// Revisar si la empresa ya tiene el banco conectado
router.get('/connected', getConnectedBanks);

// Obtener los movimientos de la empresa
router.get('/movimientos', getMovimientosBancarios);

// Subir Excel a la empresa
router.post('/cartola', uploadCartola);

// Conectar robot a la empresa
router.post('/connect', connectBank);

export default router;