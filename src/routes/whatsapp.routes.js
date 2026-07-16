import { Router } from 'express'
import {
  getEstado, iniciar, getConversaciones, getMensajes,
  enviarMensaje, setAutoGlobal, setAutoConversacion,
} from '../controllers/whatsapp.controllers.js'
import { requireSession } from '../middleware/auth.js'

const router = Router()

router.get('/estado', requireSession, getEstado)
router.post('/iniciar', requireSession, iniciar)
router.patch('/auto', requireSession, setAutoGlobal)

router.get('/conversaciones', requireSession, getConversaciones)
router.get('/conversaciones/:jid/mensajes', requireSession, getMensajes)
router.post('/conversaciones/:jid/mensajes', requireSession, enviarMensaje)
router.patch('/conversaciones/:jid/auto', requireSession, setAutoConversacion)

export default router
