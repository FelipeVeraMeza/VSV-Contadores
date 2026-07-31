import { createContext, useState, useContext, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

import { loginApi } from '../services/authService.js';
import { saveUserApi, deleteUserApi } from '../services/userService.js';
import { saveCompanyApi, deleteCompanyApi, getEmpresasListaApi } from '../services/companyService.js';
import { cleanRut } from '../lib/rut';

const AuthContext = createContext(null);

const getInitialState = (key, fallback) => {
    try {
        const item = localStorage.getItem(key) || localStorage.getItem('empresaActivaCRM');
        return item ? JSON.parse(item) : fallback;
    } catch (error) {
        return fallback;
    }
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(() => getInitialState('user', null));
    const [selectedCompany, setSelectedCompany] = useState(() => getInitialState('selectedCompany', null));
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    useEffect(() => {
        setLoading(false);
    }, []);

    const logout = useCallback((param) => {
        // 1. Borramos los estados de React
        setUser(null);
        setSelectedCompany(null);
        
        // 2. Limpiamos toda la basura del navegador
        localStorage.clear();
        queryClient.clear();
        
        // 3. Redirección
        if (typeof param === 'string' && param.includes("inactividad")) {
            window.location.href = '/login?expired=true';
        } else {
            window.location.href = '/login';
        }
    }, [queryClient]);

    // ============================================================
    // 🛡️ EL SISTEMA DE INACTIVIDAD HA SIDO ELIMINADO COMPLETAMENTE
    // ============================================================

    const handleResponse = useCallback(async (res) => {
        if (res.status === 401) {
            logout();
            return null;
        }
        const data = await res.json();
        return res.ok ? data : { error: true, message: data.message };
    }, [logout]);

    // `identificador`: el RUT sin dígito verificador, o el correo en el caso de
    // la cuenta master. Ver buscarUsuario() en auth.controllers.js.
    const login = useCallback(async (identificador, clave) => {
        try {
            setLoading(true);
            const res = await loginApi(identificador, clave);
            const data = await res.json();
            
            if (res.ok) {
                setUser(data);
                localStorage.setItem('user', JSON.stringify(data));

                setSelectedCompany(null);
                localStorage.removeItem('selectedCompany');
                localStorage.removeItem('empresaActivaCRM');
                // Sesión nueva: no hay elección previa de "consolidado", así que el
                // efecto de abajo dejará puesta la empresa principal.
                localStorage.removeItem('companyScope');

                setLoading(false);
                navigate('/dashboard', { replace: true });
                return { success: true };
            }
            setLoading(false);
            return { success: false, message: data.message };
        } catch (error) {
            setLoading(false);
            return { success: false, message: "Búnker inaccesible." };
        }
    }, [navigate]);

    const saveUser = useCallback(async (userData) => {
        try {
            const cleanData = {
                ...userData,
                id: userData.id,
                rut: cleanRut(userData.rut),
                email: userData.email?.toLowerCase().trim()
            };
            const esPerfilPropio = !!userData.id && user?.id === userData.id;
            const res = await saveUserApi(cleanData, user?.sessionId, esPerfilPropio);
            const result = await handleResponse(res);
            if (result && !result.error) {
                // Si es el perfil propio, actualizar el estado local
                if (user?.id === userData.id) {
                    setUser({
                        ...user,
                        nombre: cleanData.nombre,
                        email: cleanData.email,
                        rut: cleanData.rut
                    });
                }
                queryClient.invalidateQueries({ queryKey: ['users'] });
                return { success: true };
            }
            return { success: false, message: result?.message };
        } catch (error) {
            return { success: false, message: "Error al procesar usuario." };
        }
    }, [user?.sessionId, user?.rol, user?.id, queryClient, handleResponse]);

    const deleteUser = async (usuarioId) => {
        const res = await deleteUserApi(usuarioId, user?.sessionId);
        if (res.ok) {
            queryClient.invalidateQueries({ queryKey: ['users'] });
            return true;
        }
        return false;
    };

    const saveCompany = useCallback(async (companyData) => {
        try {
            const cleanData = {
                ...companyData,
                rut: cleanRut(companyData.rut),
                rutRep: cleanRut(companyData.rutRep)
            };
            const res = await saveCompanyApi(cleanData, user?.sessionId);
            const result = await handleResponse(res);
            if (result && !result.error) {
                queryClient.invalidateQueries({ queryKey: ['companies'] });
                queryClient.invalidateQueries({ queryKey: ['assignedCompanies'] });
                return { success: true };
            }
            return { success: false, message: result?.message };
        } catch (error) {
            return { success: false, message: "Error al procesar empresa." };
        }
    }, [user?.sessionId, queryClient, handleResponse]);

    const deleteCompany = async (empresaId) => {
        const res = await deleteCompanyApi(empresaId, user?.sessionId);
        if (res.ok) {
            queryClient.invalidateQueries({ queryKey: ['companies'] });
            queryClient.invalidateQueries({ queryKey: ['assignedCompanies'] });
            return true;
        }
        return false;
    };

    // Empresa por defecto: la principal de la organización (VOLLAIRE & OLIVOS SIMPLE
    // PYME LTDA). Es una empresa más del sistema, pero es la primera y la que queda
    // puesta si el usuario todavía no eligió otra. Sin esto la app arrancaba "sin
    // empresa", que en la práctica significa consolidado de TODAS: los módulos
    // mostraban datos de todas las empresas bajo el rótulo de la principal.
    // Si el usuario elige el consolidado a propósito, queda marcado en companyScope
    // y no se le vuelve a imponer la principal.
    useEffect(() => {
        if (!user?.sessionId) return;
        if (localStorage.getItem('companyScope') === 'ALL') return;

        let cancelado = false;
        (async () => {
            try {
                const res = await getEmpresasListaApi(user.sessionId);
                if (!res.ok) return;
                const payload = await res.json();
                const disponibles = payload?.empresas || [];
                if (cancelado) return;

                // La empresa guardada en el navegador puede haber sido ELIMINADA o
                // haber salido de la cartera desde la última vez. Si ya no está en
                // la lista hay que soltarla: si no, el encabezado sigue mostrando
                // una empresa fantasma y los módulos filtran por un id que no
                // existe, así que todo sale vacío y no hay forma de salir de ahí
                // salvo borrando los datos del navegador.
                if (selectedCompany) {
                    if (disponibles.some(e => e.id === selectedCompany.id)) return;

                    console.warn(`⚠️ La empresa seleccionada (${selectedCompany.razonSocial || selectedCompany.razon_social}) ya no existe o salió de la cartera. Se elige otra.`);
                    if (!disponibles.length) {
                        setSelectedCompany(null);
                        localStorage.removeItem('selectedCompany');
                        return;
                    }
                }
                // La principal si está disponible; si no, la primera de la lista.
                //
                // Un rol Cliente solo recibe sus empresas asignadas y la principal
                // no está entre ellas, así que antes no se elegía ninguna: la app
                // quedaba en "consolidado", que para un no-administrador está
                // prohibido, y TODOS los módulos mostraban "selecciona una empresa"
                // sin que hubiera forma de avanzar.
                const principal = disponibles.find(e => e.esPrincipal) || disponibles[0];
                if (!principal || cancelado) return;
                const empresa = {
                    id: principal.id,
                    razon_social: principal.razonSocial,
                    razonSocial: principal.razonSocial,
                    esPrincipal: principal.esPrincipal === true,
                };
                setSelectedCompany(empresa);
                localStorage.setItem('selectedCompany', JSON.stringify(empresa));
            } catch {
                // Sin lista disponible se mantiene el comportamiento anterior (consolidado).
            }
        })();
        return () => { cancelado = true; };
    }, [user?.sessionId, selectedCompany]);

    // Mantiene los datos sincronizados en LocalStorage para que al F5 no se pierda nada
    useEffect(() => {
        if (user) {
            localStorage.setItem('user', JSON.stringify(user));
            if (selectedCompany) {
                localStorage.setItem('selectedCompany', JSON.stringify(selectedCompany));
            } else {
                localStorage.removeItem('selectedCompany');
            }
        }
    }, [user, selectedCompany]);

    const value = useMemo(() => ({
        user,
        isAuthenticated: !!user,
        selectedCompany,
        setSelectedCompany,
        loading,
        login,
        logout,
        saveUser,
        deleteUser,
        saveCompany,
        deleteCompany,
        selectCompany: (company) => {
            setSelectedCompany(company);
            localStorage.setItem('selectedCompany', JSON.stringify(company));
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['stats'] });
            if (window.location.pathname !== '/dashboard') navigate('/dashboard');
        }
    }), [user, selectedCompany, loading, login, logout, saveUser, saveCompany, navigate, queryClient]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);