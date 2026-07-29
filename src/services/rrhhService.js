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

// La lista de empresas vive en companyService.getEmpresasListaApi (fuente única);
// usa el hook useEmpresasLista en vez de pedirla aquí.

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

// ============================================================================
// REMUNERACIONES — Vacaciones y Finiquitos (Fase 6)
// ============================================================================

export const getVacacionesApi = (sessionId, empresaId) => {
    const params = new URLSearchParams();
    if (empresaId) params.append('empresaId', empresaId);
    const qs = params.toString();
    return fetchWithAuth(`/rrhh/vacaciones${qs ? `?${qs}` : ''}`, sessionId);
};

export const registrarVacacionesApi = (sessionId, data) => {
    return fetchWithAuth(`/rrhh/vacaciones`, sessionId, { method: 'POST', body: JSON.stringify(data) });
};

export const getCausalesApi = (sessionId) => fetchWithAuth(`/rrhh/causales`, sessionId);

export const previewFiniquitoApi = (sessionId, data) => {
    return fetchWithAuth(`/rrhh/finiquitos/preview`, sessionId, { method: 'POST', body: JSON.stringify(data) });
};

export const guardarFiniquitoApi = (sessionId, data) => {
    return fetchWithAuth(`/rrhh/finiquitos`, sessionId, { method: 'POST', body: JSON.stringify(data) });
};

export const listFiniquitosApi = (sessionId, empresaId) => {
    const params = new URLSearchParams();
    if (empresaId) params.append('empresaId', empresaId);
    const qs = params.toString();
    return fetchWithAuth(`/rrhh/finiquitos${qs ? `?${qs}` : ''}`, sessionId);
};

export const getFiniquitoApi = (sessionId, id) => fetchWithAuth(`/rrhh/finiquitos/${id}`, sessionId);

// ============================================================================
// REMUNERACIONES — Fase 7: fijos, licencias, masivo, descarga y envío
// ============================================================================

// Generación masiva de liquidaciones (uno, una selección o todos los activos).
export const generarMasivoApi = (sessionId, data) =>
    fetchWithAuth(`/rrhh/liquidaciones/masivo`, sessionId, { method: 'POST', body: JSON.stringify(data) });

// HTML imprimible de una liquidación (para descargar / imprimir a PDF).
export const getPayslipApi = (sessionId, id) =>
    fetchWithAuth(`/rrhh/liquidaciones/${id}/payslip`, sessionId);

// Enviar la liquidación por correo al trabajador (o a un email indicado).
export const enviarLiquidacionApi = (sessionId, id, email) =>
    fetchWithAuth(`/rrhh/liquidaciones/${id}/enviar`, sessionId, { method: 'POST', body: JSON.stringify(email ? { email } : {}) });

// Haberes / descuentos FIJOS (recurrentes) de un trabajador
export const getFijosApi = (sessionId, trabajadorId) =>
    fetchWithAuth(`/rrhh/haberes-fijos?trabajadorId=${trabajadorId}`, sessionId);

export const createFijoApi = (sessionId, data) =>
    fetchWithAuth(`/rrhh/haberes-fijos`, sessionId, { method: 'POST', body: JSON.stringify(data) });

export const deleteFijoApi = (sessionId, id) =>
    fetchWithAuth(`/rrhh/haberes-fijos/${id}`, sessionId, { method: 'DELETE' });

// Licencias médicas — por trabajador, o consolidado (empresa/período)
export const getLicenciasApi = (sessionId, { trabajadorId, empresaId, periodo } = {}) => {
    const params = new URLSearchParams();
    if (trabajadorId) params.append('trabajadorId', trabajadorId);
    if (empresaId) params.append('empresaId', empresaId);
    if (periodo) params.append('periodo', periodo);
    const qs = params.toString();
    return fetchWithAuth(`/rrhh/licencias${qs ? `?${qs}` : ''}`, sessionId);
};

export const createLicenciaApi = (sessionId, data) =>
    fetchWithAuth(`/rrhh/licencias`, sessionId, { method: 'POST', body: JSON.stringify(data) });

export const deleteLicenciaApi = (sessionId, id) =>
    fetchWithAuth(`/rrhh/licencias/${id}`, sessionId, { method: 'DELETE' });

// Certificados (antigüedad / renta) → HTML imprimible
export const getCertificadoApi = (sessionId, trabajadorId, tipo) =>
    fetchWithAuth(`/rrhh/certificado/${trabajadorId}?tipo=${tipo}`, sessionId);

// Asistencia (registro de jornada por período)
export const getAsistenciaRealApi = (sessionId, { trabajadorId, empresaId, periodo } = {}) => {
    const params = new URLSearchParams();
    if (trabajadorId) params.append('trabajadorId', trabajadorId);
    if (empresaId) params.append('empresaId', empresaId);
    if (periodo) params.append('periodo', periodo);
    const qs = params.toString();
    return fetchWithAuth(`/rrhh/asistencia${qs ? `?${qs}` : ''}`, sessionId);
};

export const saveAsistenciaApi = (sessionId, data) =>
    fetchWithAuth(`/rrhh/asistencia`, sessionId, { method: 'POST', body: JSON.stringify(data) });

export const deleteAsistenciaApi = (sessionId, id) =>
    fetchWithAuth(`/rrhh/asistencia/${id}`, sessionId, { method: 'DELETE' });