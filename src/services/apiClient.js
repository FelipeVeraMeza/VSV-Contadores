import { API_BASE_URL } from '../../config.js';
import { mapperToCamel } from '../lib/mappers.js';
import { sesionCaducada } from './sesionCaducada.js';

export const fetchWithAuth = async (endpoint, sessionId, options = {}, empresaId = null) => {

    if (options.body && typeof options.body === 'object') {
        options.body = JSON.stringify(options.body);
    }

    const headers = {
        'Content-Type': 'application/json',
        'x-session-id': sessionId,
        ...options.headers,
    };

    if (empresaId) {
        headers['x-company-id'] = empresaId;
    }

    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
    });

    // UN 401 NO SE DEJA PASAR.
    //
    // Antes esto solo escribía en la consola y devolvía la respuesta, así que
    // la pantalla se quedaba con los datos viejos y sin avisar: uno seguía
    // pulsando y no pasaba nada, o salían listas vacías que parecían datos
    // borrados. Había que cerrar sesión a mano para enterarse.
    //
    // Ahora se limpia y se vuelve al login diciendo por qué. Ver
    // `sesionCaducada`, que es el único sitio donde se decide esto.
    if (res.status === 401) {
        sesionCaducada();
    }

    const originalJson = res.json.bind(res);
    res.json = async () => {
        const data = await originalJson();
        return mapperToCamel(data);
    };
    
    return res;
};