import { fetchWithAuth } from './apiClient';

// Metrics RRHH

export const getRrhhMetricsApi = (sessionId, empresaId) => {
    const params = new URLSearchParams({ empresaId: empresaId });
    
    return fetchWithAuth(`/rrhh/metrics?${params.toString()}`, sessionId);
};

// Empleados RRHH

export const getEmployeesApi = (sessionId, empresaId) => {
    const params = new URLSearchParams({ empresaId });
    return fetchWithAuth(`/rrhh/empleados?${params.toString()}`, sessionId);
};

// Liquidaciones RRHH

export const getLiquidacionesApi = (sessionId, empresaId) => {
    const params = new URLSearchParams({ empresaId });
    return fetchWithAuth(`/rrhh/liquidaciones?${params.toString()}`, sessionId);
};

// Documentos RRHH

export const getDocumentsApi = (sessionId, empresaId) => {
    const params = new URLSearchParams({ empresaId });
    return fetchWithAuth(`/rrhh/documentos?${params.toString()}`, sessionId);
};

// Control de Asistencia RRHH

export const getAsistenciaApi = (sessionId, empresaId) => {
    const params = new URLSearchParams({ empresaId });
    return fetchWithAuth(`/rrhh/asistencia?${params.toString()}`, sessionId);
};

// Reportes RRHH

export const downloadReporteApi = (sessionId, empresaId, tipoReporte) => {
    const params = new URLSearchParams({ empresaId, tipoReporte });
    return fetchWithAuth(`/rrhh/reportes/download?${params.toString()}`, sessionId);
};

// Configuración RRHH

export const getRrhhConfigApi = (sessionId, empresaId) => {
    const params = new URLSearchParams({ empresaId });
    return fetchWithAuth(`/rrhh/config?${params.toString()}`, sessionId);
};

export const updateRrhhConfigApi = async (sessionId, empresaId, data) => {
    return fetchWithAuth(`/rrhh/config?empresaId=${empresaId}`, sessionId, {
        method: 'PUT',
        body: JSON.stringify(data)
    });
};

// ============================================================================
// REMUNERACIONES — Trabajadores (Fase 1)
// ============================================================================

// Catálogos para los selects del formulario (AFP, salud/isapres, conceptos, indicadores)
export const getCatalogosApi = (sessionId) => {
    return fetchWithAuth(`/rrhh/catalogos`, sessionId);
};

// Dashboard agregado del módulo. Sin empresaId → consolidado de toda la organización.
export const getDashboardApi = (sessionId, empresaId, periodo) => {
    const params = new URLSearchParams();
    if (empresaId) params.append('empresaId', empresaId);
    if (periodo) params.append('periodo', periodo);
    const qs = params.toString();
    return fetchWithAuth(`/rrhh/dashboard${qs ? `?${qs}` : ''}`, sessionId);
};

// Listado real de trabajadores. Sin empresaId → consolidado de la organización.
export const getTrabajadoresApi = (sessionId, empresaId) => {
    const params = new URLSearchParams();
    if (empresaId) params.append('empresaId', empresaId);
    const qs = params.toString();
    return fetchWithAuth(`/rrhh/trabajadores${qs ? `?${qs}` : ''}`, sessionId);
};

// Ficha completa de un trabajador
export const getTrabajadorApi = (sessionId, id) => {
    return fetchWithAuth(`/rrhh/trabajadores/${id}`, sessionId);
};

// Crear trabajador
export const createTrabajadorApi = (sessionId, data) => {
    return fetchWithAuth(`/rrhh/trabajadores`, sessionId, {
        method: 'POST',
        body: JSON.stringify(data),
    });
};

// Actualizar trabajador
export const updateTrabajadorApi = (sessionId, id, data) => {
    return fetchWithAuth(`/rrhh/trabajadores/${id}`, sessionId, {
        method: 'PUT',
        body: JSON.stringify(data),
    });
};

// Eliminar trabajador
export const deleteTrabajadorApi = (sessionId, id) => {
    return fetchWithAuth(`/rrhh/trabajadores/${id}`, sessionId, {
        method: 'DELETE',
    });
};

// ============================================================================
// REMUNERACIONES — Novedades y Liquidaciones (Fase 2)
// ============================================================================

// Novedades del período de un trabajador
export const getMovimientosApi = (sessionId, trabajadorId, periodo) => {
    const params = new URLSearchParams({ trabajadorId, periodo });
    return fetchWithAuth(`/rrhh/movimientos?${params.toString()}`, sessionId);
};

export const createMovimientoApi = (sessionId, data) => {
    return fetchWithAuth(`/rrhh/movimientos`, sessionId, { method: 'POST', body: JSON.stringify(data) });
};

export const deleteMovimientoApi = (sessionId, id) => {
    return fetchWithAuth(`/rrhh/movimientos/${id}`, sessionId, { method: 'DELETE' });
};

// Calcular liquidación sin guardar (vista previa)
export const previewLiquidacionApi = (sessionId, data) => {
    return fetchWithAuth(`/rrhh/liquidaciones/preview`, sessionId, { method: 'POST', body: JSON.stringify(data) });
};

// Calcular y guardar liquidación
export const guardarLiquidacionApi = (sessionId, data) => {
    return fetchWithAuth(`/rrhh/liquidaciones`, sessionId, { method: 'POST', body: JSON.stringify(data) });
};

// Listar liquidaciones. Sin empresaId → consolidado de la organización.
export const getLiquidacionesRealApi = (sessionId, empresaId, periodo) => {
    const params = new URLSearchParams();
    if (empresaId) params.append('empresaId', empresaId);
    if (periodo) params.append('periodo', periodo);
    const qs = params.toString();
    return fetchWithAuth(`/rrhh/liquidaciones${qs ? `?${qs}` : ''}`, sessionId);
};

// Obtener una liquidación con su detalle
export const getLiquidacionApi = (sessionId, id) => {
    return fetchWithAuth(`/rrhh/liquidaciones/${id}`, sessionId);
};

// Cambiar estado (revisada / aprobada / pagada / anulada / borrador)
export const cambiarEstadoLiquidacionApi = (sessionId, id, estado) => {
    return fetchWithAuth(`/rrhh/liquidaciones/${id}/estado`, sessionId, {
        method: 'PATCH', body: JSON.stringify({ estado }),
    });
};

// Eliminar liquidación
export const deleteLiquidacionApi = (sessionId, id) => {
    return fetchWithAuth(`/rrhh/liquidaciones/${id}`, sessionId, { method: 'DELETE' });
};

// ============================================================================
// REMUNERACIONES — Indicadores y Reportes (Fase 3)
// ============================================================================

// Indicadores previsionales del período
export const getParametrosApi = (sessionId, periodo) => {
    const params = new URLSearchParams({ periodo });
    return fetchWithAuth(`/rrhh/parametros?${params.toString()}`, sessionId);
};

export const upsertParametrosApi = (sessionId, data) => {
    return fetchWithAuth(`/rrhh/parametros`, sessionId, { method: 'PUT', body: JSON.stringify(data) });
};

// Actualizar comisión de una AFP
export const updateAfpApi = (sessionId, id, tasaComision) => {
    return fetchWithAuth(`/rrhh/afp/${id}`, sessionId, { method: 'PUT', body: JSON.stringify({ tasaComision }) });
};

// Libro de remuneraciones del período. Sin empresaId → consolidado de la organización.
export const getLibroRemuneracionesApi = (sessionId, empresaId, periodo) => {
    const params = new URLSearchParams({ periodo });
    if (empresaId) params.append('empresaId', empresaId);
    return fetchWithAuth(`/rrhh/reportes/libro?${params.toString()}`, sessionId);
};

// Marcar como pagadas las liquidaciones aprobadas del período (empresa o toda la organización)
export const marcarPeriodoPagadoApi = (sessionId, empresaId, periodo) => {
    const params = new URLSearchParams({ periodo });
    if (empresaId) params.append('empresaId', empresaId);
    return fetchWithAuth(`/rrhh/liquidaciones/marcar-pagado?${params.toString()}`, sessionId, { method: 'POST' });
};

// ============================================================================
// REMUNERACIONES — Config contable y Centralización (Fase 4)
// ============================================================================

export const getConfigEmpresaApi = (sessionId, empresaId) => {
    const params = new URLSearchParams({ empresaId });
    return fetchWithAuth(`/rrhh/config-empresa?${params.toString()}`, sessionId);
};

export const updateConfigEmpresaApi = (sessionId, data) => {
    return fetchWithAuth(`/rrhh/config-empresa`, sessionId, { method: 'PUT', body: JSON.stringify(data) });
};

export const getPlanCuentasApi = (sessionId, empresaId) => {
    const params = new URLSearchParams({ empresaId });
    return fetchWithAuth(`/rrhh/plan-cuentas?${params.toString()}`, sessionId);
};

export const previewCentralizacionApi = (sessionId, empresaId, periodo) => {
    const params = new URLSearchParams({ empresaId, periodo });
    return fetchWithAuth(`/rrhh/centralizacion/preview?${params.toString()}`, sessionId);
};

export const getCentralizacionApi = (sessionId, empresaId, periodo) => {
    const params = new URLSearchParams({ empresaId, periodo });
    return fetchWithAuth(`/rrhh/centralizacion?${params.toString()}`, sessionId);
};

export const centralizarApi = (sessionId, data) => {
    return fetchWithAuth(`/rrhh/centralizacion`, sessionId, { method: 'POST', body: JSON.stringify(data) });
};

export const reversarCentralizacionApi = (sessionId, data) => {
    return fetchWithAuth(`/rrhh/centralizacion/reversar`, sessionId, { method: 'POST', body: JSON.stringify(data) });
};