import { API_BASE_URL } from '../../config.js';
import { mapperToCamel } from '../lib/mappers.js';

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

    if (res.status === 401) {
        console.warn("🔐 Sesión expirada o denegada. El búnker ha bloqueado el acceso.");
    }

    const originalJson = res.json.bind(res);
    res.json = async () => {
        const data = await originalJson();
        return mapperToCamel(data);
    };
    
    return res;
};