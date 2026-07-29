import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { getEmpresasListaApi } from '@/services/companyService';

/**
 * Lista de empresas de la organización — fuente ÚNICA para todos los selectores
 * de empresa del sistema (header, RRHH, modales, configuración).
 *
 * Antes cada selector armaba su propia lista desde una API distinta y ninguna
 * coincidía: el CRM excluye las empresas fuera de cartera (y la principal lo
 * está), /companies pagina de a 10 y /personas/empresas-lista corta en 50. Por
 * eso la empresa principal aparecía en unos lados y en otros no.
 *
 * Devuelve las empresas ya ordenadas con la principal primero.
 *
 * @returns {{ empresas: Array, principal: object|null, isLoading: boolean, error: Error|null }}
 */
export function useEmpresasLista({ enabled = true } = {}) {
    const { user } = useAuth();

    const { data, isLoading, error } = useQuery({
        queryKey: ['empresas-lista'],
        queryFn: async () => {
            const res = await getEmpresasListaApi(user?.sessionId);
            const payload = await res.json().catch(() => null);
            if (!res.ok || payload?.success === false) {
                throw new Error(payload?.message || `No se pudo cargar la lista de empresas (HTTP ${res.status}).`);
            }
            return payload?.empresas || [];
        },
        enabled: Boolean(enabled && user?.sessionId),
        staleTime: 1000 * 60 * 10,
    });

    const empresas = data || [];
    return {
        empresas,
        principal: empresas.find(e => e.esPrincipal) || null,
        isLoading,
        error: error || null,
    };
}

export default useEmpresasLista;
