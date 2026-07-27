import React from 'react';
import { motion } from 'framer-motion';
import { Calendar, History, FileWarning, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { getDeclaracionesRentaApi } from '@/services/rentaService';

const GestionDeclaraciones = ({ empresaId }) => {
    const { user } = useAuth();

    const { data: declaraciones, isLoading } = useQuery({
        queryKey: ['renta-declaraciones', empresaId],
        queryFn: async () => {
            const res = await getDeclaracionesRentaApi(user?.sessionId, empresaId);
            if (!res.ok) throw new Error("Error al obtener declaraciones");
            return res.json();
        },
        enabled: !!empresaId && !!user?.sessionId,
    });

    const showToast = (accion) => toast({ 
        title: accion, 
        description: "Sincronizando estado con el servidor del SII..." 
    });

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="space-y-8"
        >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-slate-50 p-6 rounded-xl border border-[#efe8dd]">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-semibold text-slate-900 uppercase tracking-tighter italic">Calendario Tributario</h3>
                        <Button onClick={() => showToast("Calendario")} variant="outline" size="sm" className="border-[#efe8dd] text-slate-700 hover:bg-slate-100 text-[10px] font-bold">Ver Calendario Completo</Button>
                    </div>
                    <div className="h-64 bg-gradient-to-r from-pink-500/20 to-rose-500/20 rounded-xl flex items-center justify-center border border-pink-500/30 overflow-hidden group">
                        {isLoading ? (
                            <Loader2 className="h-10 w-10 text-pink-400 animate-spin" />
                        ) : declaraciones ? (
                            <div className="w-full px-6 space-y-3">
                                {declaraciones.map((dj, i) => (
                                    <div key={i} className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-[#efe8dd]">
                                        <div>
                                            <p className="text-slate-900 font-bold text-xs">DJ {dj.codigo}</p>
                                            <p className="text-[10px] text-slate-500 uppercase">{dj.nombre}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-pink-400 font-bold text-[10px]">{dj.vencimiento}</p>
                                            <span className={`text-[8px] px-2 py-0.5 rounded-full uppercase font-black ${dj.estado === 'Aceptada' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                                                {dj.estado}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center text-slate-500">
                                <Calendar className="h-16 w-16 text-pink-400 mx-auto mb-4" />
                                <p className="text-slate-900 font-bold">Declaraciones Obligatorias</p>
                                <p className="text-sm mt-2">Datos no disponibles.</p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="bg-slate-50 p-6 rounded-xl border border-[#efe8dd]">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-semibold text-slate-900 uppercase tracking-tighter italic">Historial de Presentaciones</h3>
                        <Button onClick={() => showToast("Búsqueda")} variant="outline" size="sm" className="border-[#efe8dd] text-slate-700 hover:bg-slate-100 text-[10px] font-bold">Buscar</Button>
                    </div>
                    <div className="h-64 bg-gradient-to-r from-gray-500/20 to-slate-500/20 rounded-xl flex items-center justify-center border border-gray-500/30">
                        {isLoading ? (
                            <Loader2 className="h-10 w-10 text-slate-500 animate-spin" />
                        ) : (
                            <div className="text-center text-slate-500">
                                <History className="h-16 w-16 text-slate-500 mx-auto mb-4" />
                                <p className="text-slate-900 font-bold">Archivos y Acuses de Recibo</p>
                                <p className="text-sm mt-2">No se registran envíos previos este mes.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

export default GestionDeclaraciones;