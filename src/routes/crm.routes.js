import { Router } from 'express';
import {
    listarTareas, crearTarea, actualizarTarea, eliminarTarea, eliminarTareasCompletadas, archivarTarea,
    obtenerTarea, agregarComentario, eliminarComentario,
    subirAdjunto, descargarAdjunto, eliminarAdjunto,
    listarProyectos, crearProyecto, actualizarProyecto, eliminarProyecto,
    agregarIntegrante, quitarIntegrante,
    metricasDashboard, guardarMeta, resumenInicio,
    listarNotificaciones, marcarNotificaciones, canalDeAvisos, quienEstaConectado,
} from '../controllers/crm.controllers.js';
import {
    listarPlantillas, crearPlantilla, actualizarPlantilla, eliminarPlantilla, usarPlantilla,
} from '../controllers/plantillas.controllers.js';
import { requireSession, requireModulo } from '../middleware/auth.js';
import { uuidValido } from '../middleware/uuid.middleware.js';
import { exigirPermisoTarea } from '../utils/permisosTarea.js';

const router = Router();

// Notificaciones (la campana). Van antes de /tareas/:id para no confundirse.
//
// El canal en vivo: el servidor deja esta conexión abierta y manda el aviso en
// cuanto ocurre, para que a quien le asignan una tarea se entere sin refrescar.
// Es la única ruta que acepta la sesión por la URL, porque `EventSource` no
// puede mandar cabeceras.
router.get('/notificaciones/stream',
    (req, _res, next) => { req.permitirSesionEnUrl = true; next(); },
    requireSession, canalDeAvisos);
// Quién está conectado, solo de tu organización (el filtro sale de la sesión,
// nunca de un parámetro). Cualquier rol puede verlo: es presencia del equipo,
// no un dato administrativo.
router.get('/conectados', requireSession, quienEstaConectado);

router.get('/notificaciones', requireSession, listarNotificaciones);
router.patch('/notificaciones/leer', requireSession, marcarNotificaciones);
router.patch('/notificaciones/:id/leer', requireSession, uuidValido('id'), marcarNotificaciones);

// Resumen de la pantalla Inicio del módulo de Tareas
router.get('/tareas/inicio', requireSession, resumenInicio);

// Métricas del dashboard
router.get('/metricas', requireSession, metricasDashboard);
router.put('/meta', requireSession, guardarMeta);

// Proyectos
router.get('/proyectos', requireSession, listarProyectos);
router.post('/proyectos', requireSession, crearProyecto);
router.put('/proyectos/:id', requireSession, uuidValido('id'), actualizarProyecto);
router.delete('/proyectos/:id', requireSession, uuidValido('id'), eliminarProyecto);
// Integrantes: quién pertenece al proyecto y por lo tanto qué puede ver.
router.post('/proyectos/:id/integrantes', requireSession, uuidValido('id'), agregarIntegrante);
router.delete('/proyectos/:id/integrantes/:usuarioId', requireSession, uuidValido('id', 'usuarioId'), quitarIntegrante);

// Plantillas de tareas. Van antes de /tareas/:id porque comparten prefijo de
// módulo pero no de ruta; acá el orden no las cruza, se dejan juntas por claridad.
router.get('/plantillas', requireSession, listarPlantillas);
router.post('/plantillas', requireSession, crearPlantilla);
router.put('/plantillas/:id', requireSession, uuidValido('id'), actualizarPlantilla);
router.delete('/plantillas/:id', requireSession, uuidValido('id'), eliminarPlantilla);
// Usar una plantilla CREA una tarea: por eso es POST y devuelve 201.
router.post('/plantillas/:id/usar', requireSession, uuidValido('id'), usarPlantilla);

// Comentarios de tarea
router.delete('/comentarios/:comentarioId', requireSession, uuidValido('comentarioId'), eliminarComentario);

// Adjuntos (binario en la base)
router.get('/adjuntos/:adjuntoId', requireSession, uuidValido('adjuntoId'), descargarAdjunto);
router.delete('/adjuntos/:adjuntoId', requireSession, uuidValido('adjuntoId'), eliminarAdjunto);

// Tareas / actividades
router.get('/tareas', requireSession, listarTareas);
router.post('/tareas', requireSession, crearTarea);
// Rutas específicas antes de la genérica /:id para que no las capture como id.
router.delete('/tareas/completadas', requireSession, eliminarTareasCompletadas);
// RF-14 · Permisos por tarea. Arrancan en MODO PERMISIVO: registran en la
// bitacora lo que habrian bloqueado y dejan pasar. Se activan de verdad con
// PERMISOS_TAREA_ESTRICTO=true, despues de revisar unos dias que no corten nada
// legitimo. Ver utils/permisosTarea.js.
router.get('/tareas/:id', requireSession, uuidValido('id'), exigirPermisoTarea('ver'), obtenerTarea);
router.post('/tareas/:id/comentarios', requireSession, uuidValido('id'), exigirPermisoTarea('editar'), agregarComentario);
router.post('/tareas/:id/adjuntos', requireSession, uuidValido('id'), exigirPermisoTarea('editar'), subirAdjunto);
router.put('/tareas/:id', requireSession, uuidValido('id'), exigirPermisoTarea('editar'), actualizarTarea);
// Archivar es "editar", no "eliminar": no se pierde nada y se puede deshacer.
router.patch('/tareas/:id/archivar', requireSession, uuidValido('id'), exigirPermisoTarea('editar'), archivarTarea);
router.delete('/tareas/:id', requireSession, uuidValido('id'), exigirPermisoTarea('eliminar'), eliminarTarea);

export default router;
