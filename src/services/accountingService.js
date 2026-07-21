import { fetchWithAuth } from './apiClient';
import { mapperToCamel, mapperToSnake } from '@/lib/mappers';

const handleResponse = async (res) => {
    if (!res.ok) return res;
    const data = await res.json();
    return { ok: true, json: () => Promise.resolve(mapperToCamel(data)) };
};

export const getAccountingMetricsApi = (sessionId, empresaId) => {
    const params = new URLSearchParams({ empresaId });
    return fetchWithAuth(`/accounting/metrics?${params.toString()}`, sessionId);
};

export const getChartOfAccountsApi = (sessionId, empresaId) => {
    const params = new URLSearchParams({ empresaId });
    return fetchWithAuth(`/accounting/chart-of-accounts?${params.toString()}`, sessionId);
};

export const getJournalEntriesApi = (sessionId, empresaId, page = 0, search = "") => {
    const params = new URLSearchParams({ 
        empresaId, 
        page, 
        search 
    });
    return fetchWithAuth(`/accounting/journal-entries?${params.toString()}`, sessionId);
};

export const getBalanceApi = (sessionId, empresaId, mes, anio, desde, hasta) => {
    const params = new URLSearchParams({ empresaId: empresaId ?? 'ALL' });
    if (mes)   params.set('mes', mes);
    if (anio)  params.set('anio', anio);
    if (desde) params.set('desde', desde);
    if (hasta) params.set('hasta', hasta);
    return fetchWithAuth(`/accounting/balance?${params.toString()}`, sessionId);
};

export const runBankReconciliationApi = (sessionId, empresaId, cartolaId) => {
    return fetchWithAuth(`/accounting/reconcile-ia`, sessionId, {
        method: 'POST',
        body: { empresaId, cartolaId }
    });
};

// Documentos que una nota de crédito/débito puede afectar: mismo RUT, tipo
// afectable y emitidos hasta la fecha de la nota.
export const getDocumentosAfectablesApi = (sessionId, { empresaId, clase, rut, fecha }) => {
    const params = new URLSearchParams({ empresaId: empresaId ?? 'ALL', clase: clase ?? '' });
    if (rut) params.set('rut', rut);
    if (fecha) params.set('fecha', fecha);
    return fetchWithAuth(`/accounting/documentos-afectables?${params.toString()}`, sessionId);
};