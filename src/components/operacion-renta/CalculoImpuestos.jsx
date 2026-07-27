import React from 'react';
import { motion } from 'framer-motion';
import { Calculator, Percent, FileWarning, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { getCalculoImpuestosApi } from '@/services/rentaService';

const CalculoImpuestos = ({ empresaId }) => {
    const { user } = useAuth();

    const { data: calculo, isLoading } = useQuery({
        queryKey: ['renta-calculo', empresaId],
        queryFn: async () => {
            const res = await getCalculoImpuestosApi(user?.sessionId, empresaId);
            if (!res.ok) throw new Error("Error al obtener cálculo de impuestos");
            return res.json();
        },
        enabled: !!empresaId && !!user?.sessionId,
    });

    const showToast = (mensaje) => toast({ 
        title: mensaje, 
        description: "Actualizando simulador con datos del búnker..." 
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
                        <h3 className="text-xl font-semibold text-slate-900 tracking-tighter uppercase italic">Proyección Renta Anual (F22)</h3>
                        <Button onClick={() => showToast("Simulador F22")} variant="outline" size="sm" className="border-[#efe8dd] text-slate-700 hover:bg-slate-100 text-[10px] font-bold">Simulador F22</Button>
                    </div>
                    <div className="h-64 bg-gradient-to-r from-teal-500/20 to-cyan-500/20 rounded-xl flex items-center justify-center border border-teal-500/30 relative overflow-hidden group">
                        {isLoading ? (
                            <Loader2 className="h-10 w-10 text-purple-600 animate-spin" />
                        ) : calculo ? (
                            <div className="text-center z-10">
                                <Calculator className="h-16 w-16 text-purple-600 mx-auto mb-4 group-hover:scale-110 transition-transform" />
                                <p className="text-slate-900 font-bold text-2xl">${calculo.totalAPagar.toLocaleString('es-CL')}</p>
                                <p className="text-sm text-purple-700 uppercase font-black tracking-widest mt-1">Impuesto Neto a Pagar</p>
                            </div>
                        ) : (
                            <div className="text-center text-slate-500">
                                <FileWarning className="h-16 w-16 text-purple-600 mx-auto mb-4 opacity-50" />
                                <p className="text-slate-700">Cálculo de Impuesto a la Renta</p>
                                <p className="text-sm mt-2">Datos no disponibles.</p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="bg-slate-50 p-6 rounded-xl border border-[#efe8dd] shadow-xl">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-semibold text-slate-900 tracking-tighter uppercase italic">Seguimiento de PPM</h3>
                        <Button onClick={() => showToast("Historial PPM")} variant="outline" size="sm" className="border-[#efe8dd] text-slate-700 hover:bg-slate-100 text-[10px] font-bold">Ver Historial</Button>
                    </div>
                    <div className="h-64 bg-gradient-to-r from-orange-500/20 to-red-500/20 rounded-xl flex items-center justify-center border border-orange-500/30 relative overflow-hidden group">
                        {isLoading ? (
                            <Loader2 className="h-10 w-10 text-orange-600 animate-spin" />
                        ) : calculo ? (
                            <div className="text-center z-10">
                                <Percent className="h-16 w-16 text-orange-600 mx-auto mb-4 group-hover:scale-110 transition-transform" />
                                <p className="text-slate-900 font-bold text-2xl">${calculo.ppmPagados.toLocaleString('es-CL')}</p>
                                <p className="text-sm text-orange-700 uppercase font-black tracking-widest mt-1">PPM Acumulado a la Fecha</p>
                            </div>
                        ) : (
                            <div className="text-center text-slate-500">
                                <FileWarning className="h-16 w-16 text-orange-600 mx-auto mb-4 opacity-50" />
                                <p className="text-slate-700">PPM Acumulado vs Proyección</p>
                                <p className="text-sm mt-2">Datos no disponibles.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

export default CalculoImpuestos;