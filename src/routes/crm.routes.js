import { Router } from 'express';
import {
    listarTareas, crearTarea, actualizarTarea, eliminarTarea,
    metricasDashboard, guardarMeta
} from '../controllers/crm.controllers.js';
import { requireSession } from '../middleware/auth.js';

const router = Router();

// Métricas del dashboard
router.get('/metricas', requireSession, metricasDashboard);
router.put('/meta', requireSession, guardarMeta);

// Tareas / actividades
router.get('/tareas', requireSession, listarTareas);
router.post('/tareas', requireSession, crearTarea);
router.put('/tareas/:id', requireSession, actualizarTarea);
router.delete('/tareas/:id', requireSession, eliminarTarea);

export default router;
