import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { getTrabajadoresApi } from '@/services/rrhhService';
import { ThemedSelect } from '@/components/ui/ThemedSelect';

// Selector de trabajador de toda la organización (o de una empresa si se pasa
// empresaId). SimplePyme y el resto de empresas aparecen como una lista única.
export default function TrabajadorSelect({ value, onChange, empresaId, placeholder = 'Selecciona un trabajador…', className }) {
    const { user } = useAuth();
    const sid = user?.sessionId;
    const consolidado = !empresaId;

    const { data: trabajadores = [], isLoading } = useQuery({
        queryKey: ['trabajadores', empresaId],
        queryFn: async () => { const r = await getTrabajadoresApi(sid, empresaId); return r.ok ? r.json() : []; },
        enabled: !!sid,
        staleTime: 1000 * 60 * 2,
    });

    const options = useMemo(() => trabajadores
        .slice()
        .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))
        .map(t => ({
            value: t.id,
            label: consolidado && t.empresa ? `${t.nombre} · ${t.empresa}` : `${t.nombre} — ${t.rut}`,
        })), [trabajadores, consolidado]);

    return (
        <ThemedSelect
            value={value}
            onChange={onChange}
            placeholder={isLoading ? 'Cargando…' : placeholder}
            options={options}
            className={className}
        />
    );
}
