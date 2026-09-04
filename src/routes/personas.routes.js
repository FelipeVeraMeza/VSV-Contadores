import { Router } from 'express';
import {
    crearPersona, listarPersonas, buscarDuplicadosCRM,
    obtenerPersona, actualizarPersona, agregarNotaPersona, cambiarEstadoPersona, eliminarPersona,
    catalogosCRM, empresasLista, editarNotaPersona, eliminarNotaPersona, asociarEmpresa, desasociarEmpresa, fusionarPersona, crearEmpresaParaPersona,
    listarAcciones, crearAccion, completarAccion, eliminarAccion, crearServicioCRM
} from '../controllers/personas.controllers.js';
import { previsualizarImportacion, importarProspectos } from '../controllers/importarProspectos.controllers.js';
import { requireSession } from '../middleware/auth.js';
import { uuidValido } from '../middleware/uuid.middleware.js';

const router = Router();

// Importar desde planilla. Van ANTES de /:id para que "importar" no se lea
// como el id de una persona.
router.post('/importar/previsualizar', requireSession, previsualizarImportacion);
router.post('/importar', requireSession, importarProspectos);

router.get('/', requireSession, listarPersonas);
router.post('/', requireSession, crearPersona);
router.get('/duplicados', requireSession, buscarDuplicadosCRM);
router.get('/catalogos', requireSession, catalogosCRM);
router.post('/catalogos/servicio', requireSession, crearServicioCRM);   // crear servicio al vuelo (#4)
router.get('/empresas-lista', requireSession, empresasLista);

router.patch('/notas/:notaId', requireSession, uuidValido('notaId'), editarNotaPersona);
router.delete('/notas/:notaId', requireSession, uuidValido('notaId'), eliminarNotaPersona);

// Agenda de acciones del prospecto (#5/#6/#7). Las de :accionId van antes de /:id.
router.patch('/acciones/:accionId', requireSession, uuidValido('accionId'), completarAccion);
router.delete('/acciones/:accionId', requireSession, uuidValido('accionId'), eliminarAccion);

router.get('/:id', requireSession, uuidValido('id'), obtenerPersona);
router.put('/:id', requireSession, uuidValido('id'), actualizarPersona);
router.post('/:id/notas', requireSession, uuidValido('id'), agregarNotaPersona);
router.get('/:id/acciones', requireSession, uuidValido('id'), listarAcciones);
router.post('/:id/acciones', requireSession, uuidValido('id'), crearAccion);
router.put('/:id/estado', requireSession, uuidValido('id'), cambiarEstadoPersona);
router.delete('/:id', requireSession, uuidValido('id'), eliminarPersona);
router.post('/:id/empresas', requireSession, uuidValido('id'), asociarEmpresa);
router.post('/:id/empresas/nueva', requireSession, uuidValido('id'), crearEmpresaParaPersona);
router.delete('/:id/empresas/:empresaId', requireSession, uuidValido('id', 'empresaId'), desasociarEmpresa);
router.post('/:id/fusionar', requireSession, uuidValido('id'), fusionarPersona);

export default router;
