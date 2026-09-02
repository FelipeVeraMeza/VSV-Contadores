import { Router } from 'express';
import { requireSession } from '../middleware/auth.js';
import { conversar, olvidarConversacion, estado } from '../controllers/asistente.controllers.js';

const router = Router();

// Toda consulta al asistente exige sesión. No se pide un módulo concreto: el
// asistente consulta lo que el usuario ya puede ver —las herramientas vuelven a
// pasar por estas mismas rutas, con sus propios requireModulo—, así que
// restringirlo acá dejaría fuera a alguien que sí puede preguntar por lo suyo.
router.use(requireSession);

router.get('/estado', estado);                              // ¿puede responder ahora?
router.post('/chat', conversar);                            // la consulta
router.delete('/chat/:conversacionId', olvidarConversacion); // borrar el hilo

export default router;
