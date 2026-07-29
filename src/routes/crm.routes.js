import { Router } from 'express';
import {
    listarTareas, crearTarea, actualizarTarea, eliminarTarea, eliminarTareasCompletadas,
    obtenerTarea, agregarComentario, eliminarComentario,
    subirAdjunto, descargarAdjunto, eliminarAdjunto,
    listarProyectos, crearProyecto, actualizarProyecto, eliminarProyecto,
    metricasDashboard, guardarMeta
} from '../controllers/crm.controllers.js';
import { requireSession } from '../middleware/auth.js';

const router = Router();

// Métricas del dashboard
router.get('/metricas', requireSession, metricasDashboard);
router.put('/meta', requireSession, guardarMeta);

// Proyectos
router.get('/proyectos', requireSession, listarProyectos);
router.post('/proyectos', requireSession, crearProyecto);
router.put('/proyectos/:id', requireSession, actualizarProyecto);
router.delete('/proyectos/:id', requireSession, eliminarProyecto);

// Comentarios de tarea
router.delete('/comentarios/:comentarioId', requireSession, eliminarComentario);

// Adjuntos (binario en la base)
router.get('/adjuntos/:adjuntoId', requireSession, descargarAdjunto);
router.delete('/adjuntos/:adjuntoId', requireSession, eliminarAdjunto);

// Tareas / actividades
router.get('/tareas', requireSession, listarTareas);
router.post('/tareas', requireSession, crearTarea);
// Rutas específicas antes de la genérica /:id para que no las capture como id.
router.delete('/tareas/completadas', requireSession, eliminarTareasCompletadas);
router.get('/tareas/:id', requireSession, obtenerTarea);
router.post('/tareas/:id/comentarios', requireSession, agregarComentario);
router.post('/tareas/:id/adjuntos', requireSession, subirAdjunto);
router.put('/tareas/:id', requireSession, actualizarTarea);
router.delete('/tareas/:id', requireSession, eliminarTarea);

export default router;
