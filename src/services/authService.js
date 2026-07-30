import { fetchWithAuth } from './apiClient';

// `identificador` es el RUT sin dígito verificador; la cuenta master manda su
// correo. No se normaliza acá (nada de toLowerCase): el servidor decide qué es
// y cómo limpiarlo, porque un RUT terminado en K no es lo mismo en minúscula.
// Se manda también como `email` para que un backend sin actualizar siga
// entendiendo la petición.
export const loginApi = (identificador, clave) => {
    const valor = String(identificador ?? '').trim();
    return fetchWithAuth('/auth/login', null, {
        method: 'POST',
        body: {
            identificador: valor,
            email: valor,
            clave
        },
    });
};

export const logoutApi = (sessionId) => {
    return fetchWithAuth('/auth/logout', sessionId, {
        method: 'POST'
    });
};