import { Router } from 'express';

// Controllers
import { getDashboardData } from '../controllers/dashboard.controllers.js';

// Middlewares
import { requireSession, requireAdmin } from "../middleware/auth.js";
import { apiLimiter } from '../config/security.js';

const router = Router();

router.get('/',
    apiLimiter,
    requireSession,
    requireAdmin,
    getDashboardData
);

export default router;