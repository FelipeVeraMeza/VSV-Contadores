import { createContext, useState, useContext, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

import { loginApi } from '../services/authService.js';
import { saveUserApi, deleteUserApi } from '../services/userService.js';
import { saveCompanyApi, deleteCompanyApi } from '../services/companyService.js';
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

    const login = useCallback(async (email, clave) => {
        try {
            setLoading(true);
            const res = await loginApi(email, clave);
            const data = await res.json();
            
            if (res.ok) {
                setUser(data);
                localStorage.setItem('user', JSON.stringify(data));

                setSelectedCompany(null);
                localStorage.removeItem('selectedCompany');
                localStorage.removeItem('empresaActivaCRM');

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
            const res = await saveUserApi(cleanData, user?.sessionId, user?.rol);
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