import { Router } from 'express';
import {
    addNotaCRM, editarNotaCRM, eliminarNotaCRM, getClientesCRM, updateClienteCRM,
    cambiarPlanCRM, addServicioCRM, removeServicioCRM, reactivarServicioCRM,
    actualizarServicioCRM, representanteExistente, toggleTicketCRM,
    crearEmpresaCRM, eliminarEmpresaCRM
} from '../controllers/clientes.controllers.js';
import {
    listarCatalogo, crearPlan, actualizarPlan, eliminarPlan, guardarTramos,
    crearServicio, actualizarServicio,
} from '../controllers/catalogo.controllers.js';
import {
    listarContactos, crearContacto, actualizarContacto, eliminarContacto,
    registrarPago, ultimasFacturas, buscarEmpresas,
} from '../controllers/contactos.controllers.js';
import { requireSession, requireModulo } from '../middleware/auth.js';
import { uuidValido } from '../middleware/uuid.middleware.js';

const router = Router();

router.get('/crm', requireSession, getClientesCRM);
router.post('/crm', requireSession, crearEmpresaCRM);
router.put('/crm/:empresaId', requireSession, updateClienteCRM);
router.delete('/crm/:empresaId', requireSession, eliminarEmpresaCRM);

// Bitácora (conversaciones / tickets)
router.post('/crm/:empresaId/notas', requireSession, addNotaCRM);
router.patch('/crm/notas/:notaId/resuelto', requireSession, toggleTicketCRM);
router.patch('/crm/notas/:notaId', requireSession, editarNotaCRM);
router.delete('/crm/notas/:notaId', requireSession, eliminarNotaCRM);

// Buscador liviano de empresas: solo id, razón social y RUT. Lo usa el
// formulario de tareas para vincular la tarea a un cliente.
router.get('/crm/buscar', requireSession, buscarEmpresas);

// ---- PERSONAS DE UNA EMPRESA · y quién pagó cada factura ----
// Distinto del representante legal (empresa_representante), que es quien firma
// ante el SII y de quien el robot toma el RUT. Acá van las personas con las que
// uno trata: quien paga, el contador externo, a quien se llama.
router.get('/crm/:empresaId/contactos', requireSession, uuidValido('empresaId'), listarContactos);
router.post('/crm/:empresaId/contactos', requireSession, uuidValido('empresaId'), crearContacto);
router.put('/crm/contactos/:contactoId', requireSession, uuidValido('contactoId'), actualizarContacto);
router.delete('/crm/contactos/:contactoId', requireSession, uuidValido('contactoId'), eliminarContacto);

// Las últimas facturas de la empresa, con quién pagó cada una y si quedó
// anulada por nota de crédito. Una empresa puede facturarse varias veces al mes.
router.get('/crm/:empresaId/facturas', requireSession, uuidValido('empresaId'), ultimasFacturas);

// Marcar pagada una factura dejando registrado QUIÉN la pagó.
router.patch('/crm/cobros/:cobroId/pago', requireSession, uuidValido('cobroId'), registrarPago);

// ---- CATÁLOGO · planes, sus tramos de precio y servicios ----
// El «menú para crear productos y variantes»: las variantes son los tramos
// (precio por nivel de facturación, trabajadores incluidos en RRHH). Antes solo
// se podían tocar entrando a la base a mano.
// Leer lo puede cualquiera —hace falta para dar de alta un cliente—; cambiar el
// catálogo es solo del administrador (se comprueba en el controlador).
router.get('/catalogo', requireSession, listarCatalogo);
router.post('/catalogo/planes', requireSession, crearPlan);
router.put('/catalogo/planes/:id', requireSession, uuidValido('id'), actualizarPlan);
router.delete('/catalogo/planes/:id', requireSession, uuidValido('id'), eliminarPlan);
// Los tramos se guardan todos juntos: es una escalera, no filas sueltas.
router.put('/catalogo/planes/:id/tramos', requireSession, uuidValido('id'), guardarTramos);
router.post('/catalogo/servicios', requireSession, crearServicio);
router.put('/catalogo/servicios/:id', requireSession, uuidValido('id'), actualizarServicio);

// Administración de planes
router.put('/crm/:empresaId/plan', requireSession, cambiarPlanCRM);

// ¿El RUT que se está cargando ya es representante de otra empresa? Solo avisa;
// tener un representante en varias empresas es normal. Lo que previene es el
// cruce de RUT con nombres distintos, que hace que el robot del SII entre a la
// cuenta equivocada sin fallar.
router.get('/crm/representante-existente', requireSession, representanteExistente);

// Servicios contratados
router.post('/crm/:empresaId/servicios', requireSession, addServicioCRM);
router.delete('/crm/servicios/:empresaServicioId', requireSession, removeServicioCRM);
// Modificar precio, periodicidad o 1ª facturación de un servicio ya contratado.
// Antes no existía: para corregir un honorario había que dar de baja y volver a
// agregar, lo que reinicia la fecha de inicio y pierde el historial.
router.patch('/crm/servicios/:empresaServicioId', requireSession, actualizarServicioCRM);
router.patch('/crm/servicios/:empresaServicioId/reactivar', requireSession, reactivarServicioCRM);

export default router;
