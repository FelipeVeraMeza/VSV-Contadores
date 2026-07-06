import { Router } from 'express';
import { requireSession } from '../middleware/auth.js';
import { getCredencialGlobal, saveCredencialGlobal } from '../controllers/credenciales.controllers.js';

const router = Router();

// Credencial global del usuario (5 campos para facturar, por usuario)
router.get('/global', requireSession, getCredencialGlobal);
router.put('/global', requireSession, saveCredencialGlobal);

export default router;
