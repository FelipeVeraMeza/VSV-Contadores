import { fetchWithAuth } from './apiClient';
import { mapperToSnake } from '@/lib/mappers';

export const getUsersApi = (sessionId, { page = 0, limit = 10, search = '' } = {}) => {
    const params = new URLSearchParams({ page, limit, search });
    
    return fetchWithAuth(`/users?${params.toString()}`, sessionId);
};

export const saveUserApi = (userData, sessionId, userRole = null) => {
    const isEdit = !!userData.id;

    // Si es una edición de perfil propio (cliente actualizando su propio perfil)
    // usa la ruta /me en lugar de la ruta de admin
    const url = isEdit ? (userRole === 'Cliente' ? `/users/me/${userData.id}` : `/users/${userData.id}`) : `/users`;

    return fetchWithAuth(
        url,
        sessionId,
        {
            method: isEdit ? 'PUT' : 'POST',
            body: userData,
        }
    );
};

export const deleteUserApi = (userId, sessionId) =>
    fetchWithAuth(`/users/${userId}`, sessionId, { method: 'DELETE' });