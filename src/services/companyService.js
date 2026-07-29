import { fetchWithAuth } from './apiClient';

export const getMyAssignedCompaniesApi = (sessionId) => 
    fetchWithAuth('/companies/assigned', sessionId);

export const getCompanyRazonsApi = (sessionId) => 
    fetchWithAuth('/companies/razons', sessionId);

export const getAllCompaniesApi = (sessionId) => 
    fetchWithAuth('/companies/all', sessionId);

// Lista canónica de empresas de la organización — fuente ÚNICA de todos los
// selectores de empresa (header, RRHH, modales). Devuelve { success, empresas },
// con la empresa principal primero y marcada con esPrincipal.
export const getEmpresasListaApi = (sessionId) =>
    fetchWithAuth('/companies/lista', sessionId);

export const getCompaniesApi = (sessionId, params = {}) => {
    const { page = 0, limit = 10, search = '' } = params;
    const query = `page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`;
    return fetchWithAuth(`/companies?${query}`, sessionId);
};

export const getCompanyByIdApi = (id, sessionId) => 
    fetchWithAuth(`/companies/${id}`, sessionId);

export const saveCompanyApi = (companyData, sessionId) => {
    const isEdit = !!companyData.id;
    return fetchWithAuth(
        isEdit ? `/companies/${companyData.id}` : `/companies`, 
        sessionId, 
        {
            method: isEdit ? 'PUT' : 'POST',
            body: JSON.stringify(companyData),
        }
    );
};

export const deleteCompanyApi = (empresaId, sessionId) => 
    fetchWithAuth(`/companies/${empresaId}`, sessionId, { method: 'DELETE' });