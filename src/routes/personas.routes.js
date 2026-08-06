import { Router } from 'express';
import {
    crearPersona, listarPersonas, buscarDuplicadosCRM,
    obtenerPersona, actualizarPersona, agregarNotaPersona, cambiarEstadoPersona, eliminarPersona,
    catalogosCRM, empresasLista, editarNotaPersona, eliminarNotaPersona, asociarEmpresa, desasociarEmpresa, fusionarPersona, crearEmpresaParaPersona
} from '../controllers/personas.controllers.js';
import { previsualizarImportacion, importarProspectos } from '../controllers/importarProspectos.controllers.js';
import { requireSession } from '../middleware/auth.js';

const router = Router();

// Importar desde planilla. Van ANTES de /:id para que "importar" no se lea
// como el id de una persona.
router.post('/importar/previsualizar', requireSession, previsualizarImportacion);
router.post('/importar', requireSession, importarProspectos);

router.get('/', requireSession, listarPersonas);
router.post('/', requireSession, crearPersona);
router.get('/duplicados', requireSession, buscarDuplicadosCRM);
router.get('/catalogos', requireSession, catalogosCRM);
router.get('/empresas-lista', requireSession, empresasLista);

router.patch('/notas/:notaId', requireSession, editarNotaPersona);
router.delete('/notas/:notaId', requireSession, eliminarNotaPersona);

router.get('/:id', requireSession, obtenerPersona);
router.put('/:id', requireSession, actualizarPersona);
router.post('/:id/notas', requireSession, agregarNotaPersona);
router.put('/:id/estado', requireSession, cambiarEstadoPersona);
router.delete('/:id', requireSession, eliminarPersona);
router.post('/:id/empresas', requireSession, asociarEmpresa);
router.post('/:id/empresas/nueva', requireSession, crearEmpresaParaPersona);
router.delete('/:id/empresas/:empresaId', requireSession, desasociarEmpresa);
router.post('/:id/fusionar', requireSession, fusionarPersona);

export default router;
