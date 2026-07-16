import { Router } from 'express'
import {
  getSesiones, crearSesion, getEstado, iniciar, cerrar, eliminarSesion, setAutoSesion,
  getConversaciones, getMensajes, enviarMensaje, setAutoConversacion,
} from '../controllers/whatsapp.controllers.js'
import { requireSession } from '../middleware/auth.js'

const router = Router()

// Todas exigen sesión válida. El alcance (qué sesiones ve cada quien) se
// resuelve dentro del controlador: Administrador ve las de su organización,
// Cliente solo la de su empresa.

// Sesiones (números de WhatsApp)
router.get('/sesiones', requireSession, getSesiones)
router.post('/sesiones', requireSession, crearSesion)
router.get('/sesiones/:id/estado', requireSession, getEstado)
router.post('/sesiones/:id/iniciar', requireSession, iniciar)
router.post('/sesiones/:id/cerrar', requireSession, cerrar)
router.delete('/sesiones/:id', requireSession, eliminarSesion)
router.patch('/sesiones/:id/auto', requireSession, setAutoSesion)

// Conversaciones de una sesión
router.get('/sesiones/:id/conversaciones', requireSession, getConversaciones)

// Mensajes de una conversación
router.get('/conversaciones/:convId/mensajes', requireSession, getMensajes)
router.post('/conversaciones/:convId/mensajes', requireSession, enviarMensaje)
router.patch('/conversaciones/:convId/auto', requireSession, setAutoConversacion)

export default router
