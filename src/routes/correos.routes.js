// Envío de correos personalizados a un conjunto de clientes.
// Todo pide sesión y rol Administrador: escribirle a la cartera completa es una
// acción sobre los clientes de la firma, no sobre una empresa propia.
import { Router } from 'express';
import {
    camposDisponibles, previewCampana, enviarCampana, progresoCampana,
    listarPlantillasCorreo, guardarPlantillaCorreo, eliminarPlantillaCorreo,
    miPerfilCorreo, guardarPerfilCorreo,
    detenerCampanaController, historialCampanas, detalleCampana, enviosDeEmpresa,
    listarBajas, quitarBaja, cuotaController, empresasConImpaga,
} from '../controllers/correos.controllers.js';
import {
    listarBandeja, detalleCorreoRecibido, marcarCorreoRecibido,
    sincronizarBandejaController, progresoBandeja, responderCorreoRecibido,
    listarEnviados, detalleEnviado,
} from '../controllers/bandeja.controllers.js';
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

// Quiénes tienen facturas sin pagar. Para marcarlas de una en vez de buscarlas
// a mano entre toda la cartera, que es donde se cuela el «le cobré a uno que ya
// había pagado».
router.get('/impagas', requireAdmin, empresasConImpaga);

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

// ---------------------------------------------------------------------------
// BANDEJA DE ENTRADA · lo que contestan los clientes, leído por IMAP
// ---------------------------------------------------------------------------
// Cuelga de `/api/correos` para no partir los permisos: es el mismo módulo
// —hablarle al cliente— y así hereda el `requireModulo('crm')` del montaje.
// El `requireAdmin` va igual que el resto: la casilla es de la firma completa.
//
// OJO CON EL ORDEN: `/bandeja/progreso` tiene que ir ANTES que `/bandeja/:id`,
// o Express tomaría «progreso» como si fuera un id y respondería 404.
router.get('/bandeja', requireAdmin, listarBandeja);
router.get('/bandeja/progreso', requireAdmin, progresoBandeja);
router.post('/bandeja/sincronizar', requireAdmin, sincronizarBandejaController);
router.get('/bandeja/:id', requireAdmin, detalleCorreoRecibido);
router.patch('/bandeja/:id', requireAdmin, marcarCorreoRecibido);
// Responder y reenviar. Sale por la misma vía y con el remitente de quien
// contesta, para que la respuesta no quede fuera del sistema.
router.post('/bandeja/:id/responder', requireAdmin, responderCorreoRecibido);

// Enviados, en lista plana: una fila por correo en vez de agrupados por
// campaña. La vista por campaña sigue en `/campanas`.
router.get('/enviados', requireAdmin, listarEnviados);
router.get('/enviados/:id', requireAdmin, detalleEnviado);

export default router;
