import { Router } from 'express';
import {
    listarTareas, crearTarea, actualizarTarea, eliminarTarea, eliminarTareasCompletadas, archivarTarea,
    obtenerTarea, agregarComentario, eliminarComentario,
    subirAdjunto, descargarAdjunto, eliminarAdjunto,
    listarProyectos, crearProyecto, actualizarProyecto, eliminarProyecto,
    agregarIntegrante, quitarIntegrante,
    metricasDashboard, guardarMeta, resumenInicio,
    listarNotificaciones, marcarNotificaciones,
} from '../controllers/crm.controllers.js';
import { requireSession, requireModulo } from '../middleware/auth.js';
import { exigirPermisoTarea } from '../utils/permisosTarea.js';

const router = Router();

// Notificaciones (la campana). Van antes de /tareas/:id para no confundirse.
router.get('/notificaciones', requireSession, listarNotificaciones);
router.patch('/notificaciones/leer', requireSession, marcarNotificaciones);
router.patch('/notificaciones/:id/leer', requireSession, marcarNotificaciones);

// Resumen de la pantalla Inicio del módulo de Tareas
router.get('/tareas/inicio', requireSession, resumenInicio);

// Métricas del dashboard
router.get('/metricas', requireSession, metricasDashboard);
router.put('/meta', requireSession, guardarMeta);

// Proyectos
router.get('/proyectos', requireSession, listarProyectos);
router.post('/proyectos', requireSession, crearProyecto);
router.put('/proyectos/:id', requireSession, actualizarProyecto);
router.delete('/proyectos/:id', requireSession, eliminarProyecto);
// Integrantes: quién pertenece al proyecto y por lo tanto qué puede ver.
router.post('/proyectos/:id/integrantes', requireSession, agregarIntegrante);
router.delete('/proyectos/:id/integrantes/:usuarioId', requireSession, quitarIntegrante);

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
// RF-14 · Permisos por tarea. Arrancan en MODO PERMISIVO: registran en la
// bitacora lo que habrian bloqueado y dejan pasar. Se activan de verdad con
// PERMISOS_TAREA_ESTRICTO=true, despues de revisar unos dias que no corten nada
// legitimo. Ver utils/permisosTarea.js.
router.get('/tareas/:id', requireSession, exigirPermisoTarea('ver'), obtenerTarea);
router.post('/tareas/:id/comentarios', requireSession, exigirPermisoTarea('editar'), agregarComentario);
router.post('/tareas/:id/adjuntos', requireSession, exigirPermisoTarea('editar'), subirAdjunto);
router.put('/tareas/:id', requireSession, exigirPermisoTarea('editar'), actualizarTarea);
// Archivar es "editar", no "eliminar": no se pierde nada y se puede deshacer.
router.patch('/tareas/:id/archivar', requireSession, exigirPermisoTarea('editar'), archivarTarea);
router.delete('/tareas/:id', requireSession, exigirPermisoTarea('eliminar'), eliminarTarea);

export default router;
