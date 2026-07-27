import React from 'react';
import { motion } from 'framer-motion';
import { Clock, Calendar, Upload, Loader2, FileWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { getAsistenciaApi } from '@/services/rrhhService';

const ControlAsistencia = ({ empresaId }) => {
    const { user, logout } = useAuth();

    const { data: asistenciaData = [], isLoading } = useQuery({
        queryKey: ['asistencia', empresaId],
        queryFn: async () => {
            const res = await getAsistenciaApi(user?.sessionId, empresaId);
            if (res.status === 401) { logout(); throw new Error("Sesión expirada"); }
            if (!res.ok) throw new Error("Error al obtener asistencia");
            return res.json();
        },
        enabled: !!empresaId && !!user?.sessionId,
        staleTime: 1000 * 60 * 5,
    });

    const showToast = (mensaje) => toast({ 
        title: mensaje, 
        description: `Procesando datos para la empresa ${empresaId}` 
    });

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-slate-700">
                <Loader2 className="h-10 w-10 text-blue-500 animate-spin mb-4" />
                <p className="text-slate-500 animate-pulse uppercase tracking-widest text-[10px] font-black">Sincronizando marcajes...</p>
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="space-y-6"
        >
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
                <div>
                    <h3 className="text-2xl font-semibold text-slate-900 mb-2">Control de Asistencia</h3>
                    <p className="text-slate-600">Registra y gestiona las horas de trabajo de tu equipo.</p>
                </div>
                <div className="flex items-center space-x-3">
                    <Button 
                        onClick={() => showToast("Reporte Mensual")} 
                        variant="outline" 
                        className="border-[#efe8dd] text-slate-700 hover:bg-slate-100"
                    >
                        <Calendar className="h-4 w-4 mr-2" />
                        Ver Reporte Mensual
                    </Button>
                    <Button 
                        onClick={() => showToast("Importación de Registros")} 
                        className="bg-gradient-to-r from-emerald-500 to-green-600 text-white"
                    >
                        <Upload className="h-4 w-4 mr-2" />
                        Importar Registros
                    </Button>
                </div>
            </div>

            <div className="bg-slate-50 rounded-xl border border-[#efe8dd] overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-slate-100">
                            <tr>
                                <th className="px-6 py-4 text-left text-sm font-medium text-slate-600">Empleado</th>
                                <th className="px-6 py-4 text-left text-sm font-medium text-slate-600">Fecha</th>
                                <th className="px-6 py-4 text-left text-sm font-medium text-slate-600">Entrada</th>
                                <th className="px-6 py-4 text-left text-sm font-medium text-slate-600">Salida</th>
                                <th className="px-6 py-4 text-left text-sm font-medium text-slate-600">Horas Trabajadas</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/10">
                            {asistenciaData.length > 0 ? (
                                asistenciaData.map((registro, index) => (
                                    <motion.tr key={index} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: index * 0.1 }} className="hover:bg-slate-100 transition-colors">
                                        <td className="px-6 py-4 text-sm text-slate-900 font-medium">{registro.empleado}</td>
                                        <td className="px-6 py-4 text-sm text-slate-600">{registro.fecha}</td>
                                        <td className="px-6 py-4 text-sm text-green-400">{registro.entrada}</td>
                                        <td className="px-6 py-4 text-sm text-orange-600">{registro.salida}</td>
                                        <td className="px-6 py-4 text-sm text-slate-900">{registro.horas}</td>
                                    </motion.tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="5" className="text-center py-20 text-slate-400">
                                        <FileWarning className="h-10 w-10 mx-auto mb-4 opacity-20" />
                                        <p>No hay registros de asistencia para esta empresa.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </motion.div>
    );
};

export default ControlAsistencia;