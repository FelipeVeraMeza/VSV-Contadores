import { fetchWithAuth } from './apiClient';
import { mapperToSnake } from '@/lib/mappers';

export const getUsersApi = (sessionId, { page = 0, limit = 10, search = '' } = {}) => {
    const params = new URLSearchParams({ page, limit, search });
    
    return fetchWithAuth(`/users?${params.toString()}`, sessionId);
};

export const saveUserApi = (userData, sessionId, esPerfilPropio = false) => {
    const isEdit = !!userData.id;

    // Editar el perfil propio va SIEMPRE por /users/me, sin importar el rol.
    // Antes esto se decidía mirando el rol (solo 'Cliente' usaba /me), así que un
    // Administrador editándose a sí mismo caía en la ruta de admin y el backend lo
    // rechazaba con "Cuentas de nivel Administrador solo modificables vía consola".
    const url = isEdit ? (esPerfilPropio ? `/users/me/${userData.id}` : `/users/${userData.id}`) : `/users`;

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