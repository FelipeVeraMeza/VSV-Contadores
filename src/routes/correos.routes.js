// Envío de correos personalizados a un conjunto de clientes.
// Todo pide sesión y rol Administrador: escribirle a la cartera completa es una
// acción sobre los clientes de la firma, no sobre una empresa propia.
import { Router } from 'express';
import {
    camposDisponibles, previewCampana, enviarCampana, progresoCampana,
    listarPlantillasCorreo, guardarPlantillaCorreo, eliminarPlantillaCorreo,
    miPerfilCorreo, guardarPerfilCorreo,
    detenerCampanaController, historialCampanas, detalleCampana, enviosDeEmpresa,
    listarBajas, quitarBaja, cuotaController,
} from '../controllers/correos.controllers.js';
import { requireAdmin } from '../middleware/auth.js';
import { envioMasivoLimiter } from '../config/security.js';

const router = Router();

// Qué datos se pueden insertar en el texto ({{empresa}}, {{plan}}, …).
router.get('/campos', camposDisponibles);

// Cuántos correos quedan hoy. Se consulta al entrar y después de cada envío.
router.get('/cuota', requireAdmin, cuotaController);

// Qué recibiría cada empresa. NO manda nada, así que no lleva limitador.
router.post('/campana/preview', requireAdmin, previewCampana);

// El envío de verdad. Con el mismo limitador que el resto de los envíos
// masivos: 5 cada 15 minutos alcanzan de sobra y cortan el doble clic.
router.post('/campana', requireAdmin, envioMasivoLimiter, enviarCampana);

router.get('/campana/progreso', requireAdmin, progresoCampana);

// Detener lo que falta. Sin limitador: es el botón de pánico y tiene que
// responder siempre, incluso si se apretó varias veces por nervios.
router.post('/campana/detener', requireAdmin, detenerCampanaController);

// Registro: qué se envió, a quién y con qué resultado.
router.get('/campanas', requireAdmin, historialCampanas);
router.get('/campanas/:id', requireAdmin, detalleCampana);
// «¿le llegó a este cliente?» — la pregunta que motivó todo el registro.
router.get('/empresa/:empresaId/envios', requireAdmin, enviosDeEmpresa);

// Quiénes pidieron no recibir más, y reactivar a alguien a mano.
router.get('/bajas', requireAdmin, listarBajas);
router.post('/bajas/quitar', requireAdmin, quitarBaja);

// Mi remitente y mi firma. Cada uno manda desde su propia dirección: si el
// cliente responde, le responde a quien le escribió y no siempre a Matías.
router.get('/mi-perfil', requireAdmin, miPerfilCorreo);
router.put('/mi-perfil', requireAdmin, guardarPerfilCorreo);

// Plantillas. Cada uno ve LAS SUYAS más las que el equipo compartió.
router.get('/plantillas', requireAdmin, listarPlantillasCorreo);
router.post('/plantillas', requireAdmin, guardarPlantillaCorreo);
router.put('/plantillas/:id', requireAdmin, guardarPlantillaCorreo);
router.delete('/plantillas/:id', requireAdmin, eliminarPlantillaCorreo);

export default router;
