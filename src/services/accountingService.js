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

export const getBalanceApi = (sessionId, empresaId, mes, anio) => {
    const params = new URLSearchParams({ empresaId: empresaId ?? 'ALL' });
    if (mes)  params.set('mes', mes);
    if (anio) params.set('anio', anio);
    return fetchWithAuth(`/accounting/balance?${params.toString()}`, sessionId);
};

export const runBankReconciliationApi = (sessionId, empresaId, cartolaId) => {
    return fetchWithAuth(`/accounting/reconcile-ia`, sessionId, {
        method: 'POST',
        body: { empresaId, cartolaId } 
    });
};