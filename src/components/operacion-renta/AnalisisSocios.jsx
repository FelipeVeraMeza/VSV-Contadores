import React from 'react';
import { motion } from 'framer-motion';
import { Users, User, FileWarning, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { getAnalisisSociosApi } from '@/services/rentaService';

const AnalisisSocios = ({ empresaId }) => {
    const { user } = useAuth();

    const { data: socios, isLoading } = useQuery({
        queryKey: ['renta-socios', empresaId],
        queryFn: async () => {
            const res = await getAnalisisSociosApi(user?.sessionId, empresaId);
            if (!res.ok) throw new Error("Error al obtener datos de socios");
            return res.json();
        },
        enabled: !!empresaId && !!user?.sessionId,
    });

    const showToast = (nombre) => toast({ 
        title: `Perfil: ${nombre}`, 
        description: "Analizando proyección de Global Complementario..." 
    });

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="space-y-8"
        >
            <div className="bg-slate-50 p-6 rounded-xl border border-[#efe8dd] shadow-2xl">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-semibold text-slate-900 tracking-tighter uppercase italic">Análisis Individual por Socio</h3>
                    <Button onClick={() => showToast("Selección General")} variant="outline" size="sm" className="border-[#efe8dd] text-slate-700 hover:bg-slate-100 text-[10px] font-bold">Seleccionar Socio</Button>
                </div>

                <div className="h-80 bg-gradient-to-r from-teal-500/20 to-cyan-500/20 rounded-xl flex items-center justify-center border border-teal-500/30 relative overflow-hidden group">
                    {isLoading ? (
                        <div className="text-center">
                            <Loader2 className="h-12 w-12 text-indigo-400 animate-spin mx-auto mb-4" />
                            <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest animate-pulse">Cruzando retiros y créditos...</p>
                        </div>
                    ) : socios && socios.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full p-6 z-10 overflow-y-auto max-h-full no-scrollbar">
                            {socios.map((socio, idx) => (
                                <motion.div 
                                    key={idx}
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: idx * 0.1 }}
                                    className="bg-slate-50 p-4 rounded-lg border border-[#efe8dd] hover:border-indigo-500/50 transition-colors cursor-pointer"
                                    onClick={() => showToast(socio.nombre)}
                                >
                                    <div className="flex items-center space-x-3 mb-2">
                                        <div className="p-2 bg-indigo-500/20 rounded-lg">
                                            <User className="h-4 w-4 text-indigo-400" />
                                        </div>
                                        <div>
                                            <p className="text-slate-900 font-bold text-sm leading-none">{socio.nombre}</p>
                                            <p className="text-[10px] text-slate-400 uppercase tracking-tighter">{socio.rut}</p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-[#efe8dd]">
                                        <div>
                                            <p className="text-[9px] text-slate-500 uppercase font-bold">Retiros</p>
                                            <p className="text-slate-900 font-semibold text-xs">${socio.retiros.toLocaleString('es-CL')}</p>
                                        </div>
                                        <div>
                                            <p className="text-[9px] text-slate-500 uppercase font-bold">Crédito IDPC</p>
                                            <p className="text-indigo-400 font-semibold text-xs">${socio.credito.toLocaleString('es-CL')}</p>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center text-slate-500 z-10">
                            <Users className="h-16 w-16 text-indigo-400 mx-auto mb-4 opacity-50" />
                            <p className="text-slate-900 font-bold">Panel de Socios</p>
                            <p className="text-sm mt-2">Retiros, sueldos y proyección de Global Complementario.</p>
                            <p className="text-xs mt-1 italic">Datos no disponibles en el búnker.</p>
                        </div>
                    )}
                    <div className="absolute inset-0 bg-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                </div>
            </div>
        </motion.div>
    );
};

export default AnalisisSocios;