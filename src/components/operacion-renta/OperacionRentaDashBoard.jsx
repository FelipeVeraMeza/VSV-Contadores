import React from 'react';
import { motion } from 'framer-motion';
import { 
    ShieldCheck, AlertTriangle, Calendar, 
    Bell, Brain, Loader2 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { getRentaMetricsApi } from '@/services/rentaService';

const OperacionRentaDashboard = ({ empresaId }) => {
    const { user } = useAuth();

    const { data: rentaData, isLoading } = useQuery({
        queryKey: ['renta-metrics', empresaId],
        queryFn: async () => {
            const res = await getRentaMetricsApi(user?.sessionId, empresaId);
            if (!res.ok) throw new Error("Error al obtener métricas de renta");
            return res.json();
        },
        enabled: !!empresaId && !!user?.sessionId,
        staleTime: 1000 * 60 * 15, // 15 minutos de caché analítica
    });

    const showToast = (desc) => toast({ 
        title: "Asistente IA", 
        description: desc || "Funcionalidad en desarrollo" 
    });

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="h-10 w-10 text-teal-500 animate-spin mb-4" />
                <p className="text-slate-500 animate-pulse uppercase tracking-widest text-[10px] font-black">
                    Calculando Capital Propio Tributario...
                </p>
            </div>
        );
    }

    const summaryCards = [
        { title: 'Régimen Tributario', value: rentaData?.regimen || 'Propyme General', icon: ShieldCheck, color: 'text-green-400' },
        { title: 'Estado Cumplimiento', value: rentaData?.cumplimiento || 'Al día', icon: ShieldCheck, color: 'text-green-400' },
        { title: 'Próxima Declaración', value: rentaData?.proximaDeclaracion || 'DJ 1948 - 28/03/2026', icon: Calendar, color: 'text-blue-600' },
        { title: 'Observaciones SII', value: `${rentaData?.observacionesCount || 0} Pendientes`, icon: AlertTriangle, color: 'text-yellow-400' },
    ];

    const kpiCards = [
        { title: 'Liquidez', value: rentaData?.kpis?.liquidez || '1.85', description: 'Activo Cte / Pasivo Cte' },
        { title: 'Endeudamiento', value: `${rentaData?.kpis?.endeudamiento || 45}%`, description: 'Pasivo Total / Patrimonio' },
        { title: 'Rentabilidad', value: `${rentaData?.kpis?.rentabilidad || 12.5}%`, description: 'Utilidad / Ingresos' },
    ];

    return (
        <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {summaryCards.map((card, index) => {
                    const Icon = card.icon;
                    return (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: index * 0.1 }}
                            className="bg-slate-50 p-6 rounded-xl border border-[#efe8dd] hover:bg-slate-100 transition-colors"
                        >
                            <div className="flex items-center space-x-4">
                                <Icon className={`h-8 w-8 ${card.color}`} />
                                <div>
                                    <p className="text-sm text-slate-500 uppercase text-[10px] font-bold tracking-tighter">{card.title}</p>
                                    <p className="text-lg font-semibold text-slate-900">{card.value}</p>
                                </div>
                            </div>
                        </motion.div>
                    );
                })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.6 }}
                        className="bg-slate-50 p-6 rounded-xl border border-[#efe8dd] shadow-2xl"
                    >
                        <h3 className="text-xl font-semibold text-slate-900 mb-6 uppercase tracking-tighter italic">Indicadores Financieros Clave</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {kpiCards.map((kpi, index) => (
                                <div key={index} className="bg-slate-50 p-4 rounded-lg text-center border border-[#efe8dd] group hover:border-teal-500/50 transition-all">
                                    <p className="text-2xl font-bold text-teal-600 group-hover:scale-110 transition-transform">{kpi.value}</p>
                                    <p className="text-slate-700 font-medium text-sm">{kpi.title}</p>
                                    <p className="text-[10px] text-slate-400 uppercase font-bold">{kpi.description}</p>
                                </div>
                            ))}
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                        className="bg-slate-50 p-6 rounded-xl border border-[#efe8dd] overflow-hidden relative"
                    >
                        <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/10 blur-3xl rounded-full"></div>
                        <h3 className="text-xl font-semibold text-slate-900 mb-4">Asistente IA Tributario</h3>
                        <div className="flex items-center space-x-4 bg-gradient-to-r from-teal-500/20 to-cyan-500/20 p-4 rounded-lg border border-teal-500/20">
                            <Brain className="h-10 w-10 text-teal-700 flex-shrink-0 animate-pulse" />
                            <div>
                                <p className="text-slate-700 text-sm font-medium">
                                    {rentaData?.aiSuggestion || "La IA ha detectado 3 posibles optimizaciones de gastos para este período."}
                                </p>
                                <Button 
                                    onClick={() => showToast("Analizando facturas de proveedores...")} 
                                    size="sm" 
                                    variant="link" 
                                    className="text-teal-600 px-0 h-auto font-bold uppercase text-[10px] tracking-widest"
                                >
                                    Ver recomendaciones
                                </Button>
                            </div>
                        </div>
                    </motion.div>
                </div>

                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.6, delay: 0.1 }}
                    className="bg-slate-50 p-6 rounded-xl border border-[#efe8dd] h-full"
                >
                    <h3 className="text-xl font-semibold text-slate-900 mb-6 uppercase tracking-tighter italic">Alertas y Recordatorios</h3>
                    <div className="space-y-6">
                        {(rentaData?.alerts || [
                            { title: 'Vencimiento DJ 1887', desc: 'Plazo final en 15 días.', color: 'text-yellow-400' },
                            { title: 'Revisión de PPM', desc: 'El PPM actual podría ser insuficiente.', color: 'text-blue-600' }
                        ]).map((alert, i) => (
                            <div key={i} className="flex items-start space-x-3 group cursor-default">
                                <Bell className={`h-5 w-5 mt-1 ${alert.color || 'text-teal-600'} group-hover:rotate-12 transition-transform`} />
                                <div>
                                    <p className="font-bold text-slate-900 text-sm">{alert.title}</p>
                                    <p className="text-xs text-slate-500 leading-relaxed">{alert.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>
            </div>
        </div>
    );
};

export default OperacionRentaDashboard;