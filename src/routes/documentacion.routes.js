// =====================================================================
// DOCUMENTACIÓN · rutas
// ---------------------------------------------------------------------
// Solo lectura, y solo para quien tiene sesión. No hay POST ni PUT: la
// documentación se edita en los archivos .md junto al código, para que no
// existan dos versiones de la misma verdad.
// =====================================================================
import { Router } from 'express';
import { listarDocumentos, obtenerDocumento } from '../controllers/documentacion.controllers.js';
import { requireSession } from '../middleware/auth.js';

const router = Router();

router.get('/', requireSession, listarDocumentos);
router.get('/:id', requireSession, obtenerDocumento);

export default router;
