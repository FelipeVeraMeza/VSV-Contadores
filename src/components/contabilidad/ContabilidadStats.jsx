import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Calculator, CreditCard, Building2, FileText, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { getAccountingMetricsApi } from '@/services/accountingService'; 

const ContabilidadStats = ({ empresaId }) => {
    const { user, logout } = useAuth();

    const { data, isLoading } = useQuery({
        queryKey: ['accounting-metrics', empresaId],
        queryFn: async () => {
            const res = await getAccountingMetricsApi(user.sessionId, empresaId);
            
            if (res.status === 401) {
                logout();
                throw new Error("Sesión expirada");
            }

            if (!res.ok) throw new Error("Error en métricas contables");
            
            return res.json();
        },
        enabled: !!empresaId && empresaId.length > 20 && !!user?.sessionId, 
        staleTime: 1000 * 60 * 5,
    });

    const formatCurrency = (val) => {
        return new Intl.NumberFormat('es-CL', {
            style: 'currency',
            currency: 'CLP',
            minimumFractionDigits: 0
        }).format(val || 0);
    };

    const stats = useMemo(() => {
        const variacionGeneral = data?.variacion || '0.0%';
        
        return [
            { 
                title: 'Total Activos', 
                value: formatCurrency(data?.totalActivos), 
                change: variacionGeneral,
                icon: Calculator, 
                color: 'from-blue-500 to-cyan-600' 
            },
            { 
                title: 'Total Pasivos', 
                value: formatCurrency(data?.totalPasivos), 
                change: variacionGeneral, 
                icon: CreditCard, 
                color: 'from-red-500 to-pink-600' 
            },
            { 
                title: 'Patrimonio', 
                value: formatCurrency(data?.patrimonio), 
                change: variacionGeneral, 
                icon: Building2, 
                color: 'from-green-500 to-emerald-600' 
            },
            { 
                title: 'Asientos Mes', 
                value: data?.asientosMes || '0', 
                change: data?.variacion || '0', 
                icon: FileText, 
                color: 'from-purple-500 to-violet-600' 
            }
        ];
    }, [data]);

    if (isLoading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-32 bg-slate-50 animate-pulse rounded-2xl border border-[#efe8dd] flex items-center justify-center">
                        <Loader2 className="h-6 w-6 text-blue-500/20 animate-spin" />
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {stats.map((stat, index) => {
                const Icon = stat.icon;
                const isNegative = stat.change.startsWith('-');

                return (
                    <motion.div
                        key={stat.title}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: index * 0.1 }}
                        className="bg-white backdrop-blur-xl rounded-2xl p-6 border border-[#efe8dd] shadow-xl hover:bg-slate-100 transition-all group"
                    >
                        <div className="flex items-center justify-between mb-4">
                            <div className={`w-12 h-12 bg-gradient-to-r ${stat.color} rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}>
                                <Icon className="h-6 w-6 text-white" />
                            </div>
                            <div className="text-right">
                                <span className={`text-[10px] font-black uppercase tracking-widest ${
                                    isNegative ? 'text-red-500' : 'text-emerald-600'
                                }`}>
                                    {stat.change}
                                </span>
                                <p className="text-[8px] text-slate-400 uppercase font-bold tracking-tighter">vs mes anterior</p>
                            </div>
                        </div>
                        
                        <h3 className="text-2xl font-black text-slate-900 mb-1 tracking-tight">
                            {stat.value}
                        </h3>
                        <p className="text-slate-500 text-[11px] font-bold uppercase tracking-wider">
                            {stat.title}
                        </p>
                    </motion.div>
                );
            })}
        </div>
    );
};

export default ContabilidadStats;