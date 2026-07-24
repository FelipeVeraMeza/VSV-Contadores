import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Users, DollarSign, UserPlus, UserMinus, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { getRrhhMetricsApi } from '@/services/rrhhService';

const RrhhStats = ({ empresaId }) => {
    const { user, logout } = useAuth();

    const { data, isLoading, isError } = useQuery({
        queryKey: ['rrhh-metrics', empresaId],
        queryFn: async () => {
            const res = await getRrhhMetricsApi(user.sessionId, empresaId);
            if (res.status === 401) { logout(); throw new Error("Sesión expirada"); }
            if (!res.ok) throw new Error("Error en métricas de RRHH");
            return res.json();
        },
        enabled: Boolean(empresaId) && empresaId !== 'undefined' && !!user?.sessionId,
        staleTime: 1000 * 60 * 2,
    });

    const formatCurrency = (val) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(val || 0);

    const stats = useMemo(() => [
        { title: 'Trabajadores activos', value: data?.totalEmpleados ?? 0, hint: data?.variacionEmpleados ?? '+0', icon: Users, color: 'from-blue-500 to-cyan-500', ring: 'bg-blue-500/10' },
        { title: 'Masa salarial', value: formatCurrency(data?.masaSalarial), hint: 'sueldos base', icon: DollarSign, color: 'from-emerald-500 to-green-500', ring: 'bg-emerald-500/10' },
        { title: 'Nuevos contratos', value: data?.nuevosContratos ?? 0, hint: 'este mes', icon: UserPlus, color: 'from-violet-500 to-purple-500', ring: 'bg-violet-500/10' },
        { title: 'Finiquitos', value: data?.finiquitos ?? 0, hint: 'este mes', icon: UserMinus, color: 'from-rose-500 to-pink-500', ring: 'bg-rose-500/10' },
    ], [data]);

    if (isError) return <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs">No se pudieron cargar las métricas.</div>;

    if (isLoading) {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-28 bg-white/[0.03] animate-pulse rounded-2xl border border-white/10 flex items-center justify-center">
                        <Loader2 className="h-5 w-5 text-white/10 animate-spin" />
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((stat, index) => {
                const Icon = stat.icon;
                return (
                    <motion.div
                        key={stat.title}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.35, delay: index * 0.06 }}
                        className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-5 hover:border-white/20 hover:bg-white/[0.06] transition-all"
                    >
                        <div className="flex items-start justify-between">
                            <div className="min-w-0">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-gray-500">{stat.title}</p>
                                <p className="text-[26px] leading-none font-bold text-white mt-3 tracking-tight truncate">{stat.value}</p>
                                <p className="text-[11px] text-gray-500 mt-2">{stat.hint}</p>
                            </div>
                            <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center shadow-lg shadow-black/20 flex-shrink-0`}>
                                <Icon className="h-[18px] w-[18px] text-white" />
                            </div>
                        </div>
                        <div className={`absolute -right-6 -bottom-6 w-24 h-24 rounded-full ${stat.ring} blur-xl`} />
                    </motion.div>
                );
            })}
        </div>
    );
};

export default RrhhStats;
