// ============================================================================
// DESUSCRIPCIÓN · RUTA PÚBLICA
// ----------------------------------------------------------------------------
// Va SEPARADA de /api/correos a propósito: esas rutas exigen sesión y rol
// Administrador, y quien se da de baja es un cliente que no tiene cuenta en el
// sistema. Un enlace de baja que pide iniciar sesión no es un enlace de baja.
//
// La seguridad no está en la sesión sino en la FIRMA del token: sin ella no se
// puede dar de baja a una dirección arbitraria escribiéndola en la URL.
// ============================================================================
import { Router } from 'express';
import { verBaja, confirmarBaja } from '../controllers/baja.controllers.js';

const router = Router();

// Qué correo es (para mostrarlo en la página antes de confirmar).
router.get('/', verBaja);

// La baja se hace con POST y no con GET a propósito: algunos clientes de correo
// y antivirus PRE-VISITAN los enlaces para revisarlos, y con un GET que da de
// baja, el cliente quedaría desuscrito sin haber pulsado nada.
router.post('/', confirmarBaja);

export default router;
