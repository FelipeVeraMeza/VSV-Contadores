import React from 'react';
import { motion } from 'framer-motion';
import { BarChart3, TrendingUp, Loader2, FileWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { getAnalisisRentaApi } from '@/services/rentaService';

const AnalisisOperaciones = ({ empresaId }) => {
    const { user } = useAuth();

    const { data: analisis, isLoading } = useQuery({
        queryKey: ['renta-analisis', empresaId],
        queryFn: async () => {
            const res = await getAnalisisRentaApi(user?.sessionId, empresaId);
            if (!res.ok) throw new Error("Error al obtener análisis de renta");
            return res.json();
        },
        enabled: !!empresaId && !!user?.sessionId,
    });

    const showToast = (accion) => toast({ 
        title: accion, 
        description: "Calculando proyecciones basadas en el Libro Mayor..." 
    });

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="space-y-8"
        >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-slate-50 p-6 rounded-xl border border-[#efe8dd] shadow-xl">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-semibold text-slate-900 tracking-tighter uppercase italic">Análisis Renta Líquida</h3>
                        <Button onClick={() => showToast("Detalle RLI")} variant="outline" size="sm" className="border-[#efe8dd] text-slate-700 hover:bg-slate-100 text-[10px] font-bold">Ver Detalle</Button>
                    </div>
                    <div className="h-64 bg-gradient-to-r from-teal-500/20 to-cyan-500/20 rounded-xl flex items-center justify-center border border-teal-500/30 relative overflow-hidden group">
                        {isLoading ? (
                            <Loader2 className="h-10 w-10 text-blue-600 animate-spin" />
                        ) : analisis ? (
                            <div className="text-center z-10">
                                <BarChart3 className="h-16 w-16 text-blue-600 mx-auto mb-4 group-hover:scale-110 transition-transform" />
                                <p className="text-slate-900 font-bold text-2xl">${analisis.rli.rliFinal.toLocaleString('es-CL')}</p>
                                <p className="text-sm text-blue-700 uppercase font-black tracking-widest mt-1">RLI Final Proyectada</p>
                            </div>
                        ) : (
                            <div className="text-center text-slate-500">
                                <FileWarning className="h-16 w-16 text-blue-600 mx-auto mb-4 opacity-50" />
                                <p className="text-slate-700">Datos no disponibles.</p>
                            </div>
                        )}
                        <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                </div>

                <div className="bg-slate-50 p-6 rounded-xl border border-[#efe8dd] shadow-xl">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-semibold text-slate-900 tracking-tighter uppercase italic">Capital Propio Tributario</h3>
                        <Button onClick={() => showToast("Simulación CPT")} variant="outline" size="sm" className="border-[#efe8dd] text-slate-700 hover:bg-slate-100 text-[10px] font-bold">Simular</Button>
                    </div>
                    <div className="h-64 bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-xl flex items-center justify-center border border-green-500/30 relative overflow-hidden group">
                        {isLoading ? (
                            <Loader2 className="h-10 w-10 text-green-400 animate-spin" />
                        ) : analisis ? (
                            <div className="text-center z-10">
                                <TrendingUp className="h-16 w-16 text-green-400 mx-auto mb-4 group-hover:scale-110 transition-transform" />
                                <p className="text-slate-900 font-bold text-2xl">${analisis.cpt.cptFinal.toLocaleString('es-CL')}</p>
                                <p className="text-sm text-green-300 uppercase font-black tracking-widest mt-1">Patrimonio Fiscal Neto</p>
                            </div>
                        ) : (
                            <div className="text-center text-slate-500">
                                <FileWarning className="h-16 w-16 text-green-400 mx-auto mb-4 opacity-50" />
                                <p className="text-slate-700">Datos no disponibles.</p>
                            </div>
                        )}
                        <div className="absolute inset-0 bg-green-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

export default AnalisisOperaciones;