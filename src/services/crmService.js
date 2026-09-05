import { fetchWithAuth } from './apiClient';

// `enCartera`: '' (la cartera vigente, por defecto) · 'fuera' (las que salieron
// de la planilla y no aparecían en ninguna pestaña) · 'todas'.
export const getCrmDataApi = (sessionId, empresaId = null, enCartera = '') => {
  const qs = enCartera ? `?enCartera=${encodeURIComponent(enCartera)}` : '';
  return fetchWithAuth(`/clientes/crm${qs}`, sessionId, {}, empresaId);
};

export const updateClienteApi = (sessionId, empresaId, clientData) => {
  return fetchWithAuth(`/clientes/crm/${empresaId}`, sessionId, {
    method: 'PUT',
    body: clientData
  });
};

export const crearEmpresaApi = (sessionId, empresaData) => {
  return fetchWithAuth('/clientes/crm', sessionId, {
    method: 'POST',
    body: empresaData
  });
};

export const eliminarEmpresaApi = (sessionId, empresaId) => {
  return fetchWithAuth(`/clientes/crm/${empresaId}`, sessionId, {
    method: 'DELETE'
  });
};

export const createNotaApi = (sessionId, empresaId, texto, tipo = 'conversacion', meta = {}) => {
  return fetchWithAuth(`/clientes/crm/${empresaId}/notas`, sessionId, {
    method: 'POST',
    body: { texto, tipo, ...meta }
  });
};

export const editarNotaApi = (sessionId, notaId, data) => {
  return fetchWithAuth(`/clientes/crm/notas/${notaId}`, sessionId, {
    method: 'PATCH',
    body: data
  });
};

export const eliminarNotaApi = (sessionId, notaId) => {
  return fetchWithAuth(`/clientes/crm/notas/${notaId}`, sessionId, {
    method: 'DELETE'
  });
};

export const toggleTicketApi = (sessionId, notaId, resuelto) => {
  return fetchWithAuth(`/clientes/crm/notas/${notaId}/resuelto`, sessionId, {
    method: 'PATCH',
    body: { resuelto }
  });
};

export const cambiarPlanApi = (sessionId, empresaId, planId, motivo = '') => {
  return fetchWithAuth(`/clientes/crm/${empresaId}/plan`, sessionId, {
    method: 'PUT',
    body: { planId, motivo }
  });
};

/**
 * ¿El RUT ya es representante legal de otra empresa? Devuelve las empresas y,
 * si el mismo RUT figura con nombres distintos, lo marca: eso es un error de
 * carga y hace que el robot del SII entre a la cuenta equivocada.
 */
export const representanteExistenteApi = (sessionId, rut, excluirEmpresaId = null) => {
  const p = new URLSearchParams({ rut });
  if (excluirEmpresaId) p.set('excluirEmpresaId', excluirEmpresaId);
  return fetchWithAuth(`/clientes/crm/representante-existente?${p}`, sessionId);
};

export const addServicioApi = (sessionId, empresaId, data) => {
  // data: { servicioId, precioPactado, periodicidad, primeraFacturacion }
  return fetchWithAuth(`/clientes/crm/${empresaId}/servicios`, sessionId, {
    method: 'POST',
    body: data
  });
};

export const removeServicioApi = (sessionId, empresaServicioId) => {
  return fetchWithAuth(`/clientes/crm/servicios/${empresaServicioId}`, sessionId, {
    method: 'DELETE'
  });
};

/**
 * Modifica un servicio ya contratado: precio, periodicidad o 1ª facturación.
 * Solo viaja lo que se quiere cambiar; lo que no se manda queda como estaba.
 */
export const editarServicioApi = (sessionId, empresaServicioId, data) => {
  return fetchWithAuth(`/clientes/crm/servicios/${empresaServicioId}`, sessionId, {
    method: 'PATCH',
    body: data
  });
};

export const reactivarServicioApi = (sessionId, empresaServicioId) => {
  return fetchWithAuth(`/clientes/crm/servicios/${empresaServicioId}/reactivar`, sessionId, {
    method: 'PATCH'
  });
};

// ============================================================
// Dashboard: métricas y meta mensual
// ============================================================
export const getMetricasCrmApi = (sessionId, { periodo = '', scope = '', seguimientoDias = '', desde = '', hasta = '' } = {}) => {
  const p = new URLSearchParams();
  if (periodo) p.set('periodo', periodo);
  if (scope) p.set('scope', scope);
  if (seguimientoDias) p.set('seguimientoDias', seguimientoDias);
  if (desde) p.set('desde', desde);
  if (hasta) p.set('hasta', hasta);
  const qs = p.toString();
  return fetchWithAuth(`/crm/metricas${qs ? `?${qs}` : ''}`, sessionId);
};

export const guardarMetaCrmApi = (sessionId, metaMensual) =>
  fetchWithAuth('/crm/meta', sessionId, { method: 'PUT', body: { metaMensual } });

// ============================================================
// Tareas / actividades (dashboard, WhatsApp, automatización)
// ============================================================
// Los filtros se pasan tal cual, sin lista blanca.
//
// Antes esta función destructuraba solo los parámetros que conocía, así que
// `proyectoId` y `soloRaiz` se perdían en silencio: filtrar por proyecto no
// hacía nada y las subtareas aparecían como filas sueltas en la lista
// principal. El backend ya valida cada parámetro; repetir la lista acá solo
// servía para que se desincronizaran.
export const listarTareasApi = (sessionId, filtros = {}) => {
  const p = new URLSearchParams();
  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor !== '' && valor !== null && valor !== undefined) p.set(clave, valor);
  }
  const qs = p.toString();
  return fetchWithAuth(`/crm/tareas${qs ? `?${qs}` : ''}`, sessionId);
};

// Buscar empresas por nombre o RUT, para vincular una tarea a un cliente.
export const buscarEmpresasApi = (sessionId, q) =>
  fetchWithAuth(`/clientes/crm/buscar?q=${encodeURIComponent(q)}`, sessionId);

// Personas de una empresa y quién pagó cada factura.
export const contactosApi = (sessionId, empresaId) =>
  fetchWithAuth(`/clientes/crm/${empresaId}/contactos`, sessionId);
export const crearContactoApi = (sessionId, empresaId, data) =>
  fetchWithAuth(`/clientes/crm/${empresaId}/contactos`, sessionId, { method: 'POST', body: data });
export const actualizarContactoApi = (sessionId, contactoId, data) =>
  fetchWithAuth(`/clientes/crm/contactos/${contactoId}`, sessionId, { method: 'PUT', body: data });
export const eliminarContactoApi = (sessionId, contactoId) =>
  fetchWithAuth(`/clientes/crm/contactos/${contactoId}`, sessionId, { method: 'DELETE' });
export const ultimasFacturasApi = (sessionId, empresaId, limite = 3) =>
  fetchWithAuth(`/clientes/crm/${empresaId}/facturas?limite=${limite}`, sessionId);
export const registrarPagoApi = (sessionId, cobroId, data) =>
  fetchWithAuth(`/clientes/crm/cobros/${cobroId}/pago`, sessionId, { method: 'PATCH', body: data });

// ---- DOCUMENTACIÓN · los .md del proyecto, dentro de la página ----
export const documentosApi = (sessionId) =>
  fetchWithAuth('/documentacion', sessionId);
export const documentoApi = (sessionId, id) =>
  fetchWithAuth(`/documentacion/${id}`, sessionId);

// ---- CATÁLOGO · planes, sus tramos de precio y servicios ----
export const catalogoApi = (sessionId) =>
  fetchWithAuth('/clientes/catalogo', sessionId);

export const crearPlanApi = (sessionId, data) =>
  fetchWithAuth('/clientes/catalogo/planes', sessionId, { method: 'POST', body: data });

export const actualizarPlanApi = (sessionId, id, data) =>
  fetchWithAuth(`/clientes/catalogo/planes/${id}`, sessionId, { method: 'PUT', body: data });

export const eliminarPlanApi = (sessionId, id) =>
  fetchWithAuth(`/clientes/catalogo/planes/${id}`, sessionId, { method: 'DELETE' });

// Los tramos van todos juntos: es una escalera, no filas sueltas.
export const guardarTramosApi = (sessionId, planId, tramos) =>
  fetchWithAuth(`/clientes/catalogo/planes/${planId}/tramos`, sessionId,
    { method: 'PUT', body: { tramos } });

export const crearServicioApi = (sessionId, data) =>
  fetchWithAuth('/clientes/catalogo/servicios', sessionId, { method: 'POST', body: data });

export const actualizarServicioApi = (sessionId, id, data) =>
  fetchWithAuth(`/clientes/catalogo/servicios/${id}`, sessionId, { method: 'PUT', body: data });

// Quién está conectado ahora mismo, solo de mi organización.
export const conectadosApi = (sessionId) =>
  fetchWithAuth('/crm/conectados', sessionId);

// Resumen de la pantalla Inicio: conteos + las tres listas, en una llamada.
export const resumenInicioApi = (sessionId, ambito = 'todas') =>
  fetchWithAuth(`/crm/tareas/inicio?ambito=${encodeURIComponent(ambito)}`, sessionId);

export const crearTareaApi = (sessionId, data) =>
  fetchWithAuth('/crm/tareas', sessionId, { method: 'POST', body: data });

export const actualizarTareaApi = (sessionId, id, data) =>
  fetchWithAuth(`/crm/tareas/${id}`, sessionId, { method: 'PUT', body: data });

export const completarTareaApi = (sessionId, id) =>
  fetchWithAuth(`/crm/tareas/${id}`, sessionId, { method: 'PUT', body: { estado: 'completada' } });

export const eliminarTareaApi = (sessionId, id) =>
  fetchWithAuth(`/crm/tareas/${id}`, sessionId, { method: 'DELETE' });

// Archivar / desarchivar (RF-TA-17). No borra: saca de la vista y se deshace.
export const archivarTareaApi = (sessionId, id, archivar = true) =>
  fetchWithAuth(`/crm/tareas/${id}/archivar`, sessionId, { method: 'PATCH', body: { archivar } });

export const limpiarTareasCompletadasApi = (sessionId, scope = '') =>
  fetchWithAuth(`/crm/tareas/completadas${scope ? `?scope=${scope}` : ''}`, sessionId, { method: 'DELETE' });

// ---- Módulo de Tareas: detalle, subtareas, comentarios ----
export const obtenerTareaApi = (sessionId, id) =>
  fetchWithAuth(`/crm/tareas/${id}`, sessionId);

export const agregarComentarioApi = (sessionId, tareaId, texto) =>
  fetchWithAuth(`/crm/tareas/${tareaId}/comentarios`, sessionId, { method: 'POST', body: { texto } });

export const eliminarComentarioApi = (sessionId, comentarioId) =>
  fetchWithAuth(`/crm/comentarios/${comentarioId}`, sessionId, { method: 'DELETE' });

// ---- Adjuntos (binario en la base) ----
export const subirAdjuntoApi = (sessionId, tareaId, data) =>
  fetchWithAuth(`/crm/tareas/${tareaId}/adjuntos`, sessionId, { method: 'POST', body: data });

// Devuelve la Response cruda; el llamador hace .blob() para descargar.
export const descargarAdjuntoApi = (sessionId, adjuntoId) =>
  fetchWithAuth(`/crm/adjuntos/${adjuntoId}`, sessionId);

export const eliminarAdjuntoApi = (sessionId, adjuntoId) =>
  fetchWithAuth(`/crm/adjuntos/${adjuntoId}`, sessionId, { method: 'DELETE' });

// ---- Proyectos ----
export const listarProyectosApi = (sessionId) =>
  fetchWithAuth('/crm/proyectos', sessionId);

export const crearProyectoApi = (sessionId, data) =>
  fetchWithAuth('/crm/proyectos', sessionId, { method: 'POST', body: data });

export const actualizarProyectoApi = (sessionId, id, data) =>
  fetchWithAuth(`/crm/proyectos/${id}`, sessionId, { method: 'PUT', body: data });

export const eliminarProyectoApi = (sessionId, id) =>
  fetchWithAuth(`/crm/proyectos/${id}`, sessionId, { method: 'DELETE' });

// ---- Cobranza desde el CRM ----
// «Este cliente pagó» se traduce en el servidor a marcar sus cobros pendientes.
// El estado de pago que muestra la ficha se calcula desde ahí: no se edita a mano.
export const registrarPagoClienteApi = (sessionId, empresaId, soloVencidos = false) =>
  fetchWithAuth(`/cobros/empresa/${empresaId}/pagar${soloVencidos ? '?soloVencidos=1' : ''}`,
    sessionId, { method: 'PUT', body: {} });

// ---- Integrantes del proyecto ----
// Pertenecer al proyecto es lo que da acceso a ver sus tareas, así que esto no
// es una lista informativa: es repartir permisos. Solo el responsable puede.
export const agregarIntegranteApi = (sessionId, proyectoId, usuarioId, rol = 'integrante') =>
  fetchWithAuth(`/crm/proyectos/${proyectoId}/integrantes`, sessionId, { method: 'POST', body: { usuarioId, rol } });

export const quitarIntegranteApi = (sessionId, proyectoId, usuarioId) =>
  fetchWithAuth(`/crm/proyectos/${proyectoId}/integrantes/${usuarioId}`, sessionId, { method: 'DELETE' });

// ---- Notificaciones (la campana del encabezado) ----
export const listarNotificacionesApi = (sessionId) =>
  fetchWithAuth('/crm/notificaciones', sessionId);

// Sin id marca todas como leídas.
export const marcarNotificacionesApi = (sessionId, id = null) =>
  fetchWithAuth(`/crm/notificaciones/${id ? `${id}/leer` : 'leer'}`, sessionId, { method: 'PATCH', body: {} });

// ---- Plantillas de tareas ----
// Una plantilla guarda la estructura de un trabajo que se repite (la tarea y
// sus subtareas) para volcarla en un clic. Guarda un PLAZO EN DIAS, no una
// fecha: una fecha fija envejece y la plantilla termina mintiendo.
export const listarPlantillasApi = (sessionId) =>
  fetchWithAuth('/crm/plantillas', sessionId);

export const crearPlantillaApi = (sessionId, datos) =>
  fetchWithAuth('/crm/plantillas', sessionId, { method: 'POST', body: datos });

// Copia una tarea existente —con sus subtareas— y la deja como plantilla.
export const guardarComoPlantillaApi = (sessionId, tareaId, nombre) =>
  fetchWithAuth('/crm/plantillas', sessionId, { method: 'POST', body: { desdeTareaId: tareaId, nombre } });

export const actualizarPlantillaApi = (sessionId, id, datos) =>
  fetchWithAuth(`/crm/plantillas/${id}`, sessionId, { method: "PUT", body: datos });

export const eliminarPlantillaApi = (sessionId, id) =>
  fetchWithAuth(`/crm/plantillas/${id}`, sessionId, { method: "DELETE" });

// Crea la tarea y todas sus subtareas. Lo que va en `datos` manda sobre lo que
// guarda la plantilla: ella propone, quien la usa dispone.
export const usarPlantillaApi = (sessionId, id, datos = {}) =>
  fetchWithAuth(`/crm/plantillas/${id}/usar`, sessionId, { method: "POST", body: datos });
