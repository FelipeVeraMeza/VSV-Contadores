import React from 'react';
import { motion } from 'framer-motion';
import { 
    FileText, Plus, BookOpen, FileUp, 
    Loader2, FileWarning, Eye, Download 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { getDocumentsApi } from '@/services/rrhhService';

const GestionContratos = ({ empresaId }) => {
    const { user, logout } = useAuth();

    const { data: documentos = [], isLoading } = useQuery({
        queryKey: ['rrhh-documentos', empresaId],
        queryFn: async () => {
            const res = await getDocumentsApi(user?.sessionId, empresaId);
            if (res.status === 401) { logout(); throw new Error("Sesión expirada"); }
            if (!res.ok) throw new Error("Error al obtener documentos");
            return res.json();
        },
        enabled: Boolean(empresaId) && !!user?.sessionId,
        staleTime: 1000 * 60 * 10, // 10 minutos de caché
    });

    const showToast = (title, description) => toast({ 
        title, 
        description: `${description} (Empresa ID: ${empresaId})` 
    });

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="space-y-8"
        >
            <div className="text-center">
                <h3 className="text-2xl font-semibold text-slate-900 mb-2">Gestión de Documentos Laborales</h3>
                <p className="text-slate-600">Administra contratos, finiquitos y documentos legales de forma centralizada.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
                <div className="bg-slate-50 p-6 rounded-xl border border-[#efe8dd]">
                    <h4 className="text-lg font-semibold text-slate-900 mb-4">Documentos Individuales</h4>
                    <div className="flex flex-col space-y-3">
                        <Button onClick={() => showToast("Próximamente", "Generador de contratos en desarrollo.")} className="justify-start bg-transparent border border-[#efe8dd] hover:bg-slate-100 text-slate-700">
                            <Plus className="h-4 w-4 mr-3" />
                            Nuevo Contrato de Trabajo
                        </Button>
                        <Button onClick={() => showToast("Próximamente", "Generador de finiquitos en desarrollo.")} className="justify-start bg-transparent border border-[#efe8dd] hover:bg-slate-100 text-slate-700">
                            <FileText className="h-4 w-4 mr-3" />
                            Generar Finiquito
                        </Button>
                    </div>
                </div>
                <div className="bg-slate-50 p-6 rounded-xl border border-[#efe8dd]">
                    <h4 className="text-lg font-semibold text-slate-900 mb-4">Documentos Masivos y Legales</h4>
                    <div className="flex flex-col space-y-3">
                        <Button onClick={() => showToast("Libro de Remuneraciones", "Generando archivo para la Dirección del Trabajo...")} className="justify-start bg-transparent border border-[#efe8dd] hover:bg-slate-100 text-slate-700">
                            <BookOpen className="h-4 w-4 mr-3" />
                            Libro de Remuneraciones Electrónico
                        </Button>
                        <Button onClick={() => showToast("Preparando DJ 1887", "Generando información para la Declaración Jurada de Rentas.")} className="justify-start bg-transparent border border-[#efe8dd] hover:bg-slate-100 text-slate-700">
                            <FileUp className="h-4 w-4 mr-3" />
                            Preparar Información DJ 1887
                        </Button>
                    </div>
                </div>
            </div>

            <div className="bg-slate-50 rounded-xl border border-[#efe8dd] overflow-hidden">
                <div className="p-4 border-b border-[#efe8dd] bg-slate-50">
                    <h4 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Documentos Recientes</h4>
                </div>
                
                {isLoading ? (
                    <div className="flex flex-col items-center py-12">
                        <Loader2 className="h-8 w-8 text-blue-500 animate-spin mb-2" />
                        <span className="text-xs text-slate-400 uppercase font-black">Sincronizando Archivo...</span>
                    </div>
                ) : documentos.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="text-left border-b border-[#efe8dd]">
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Tipo</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Empleado</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Fecha</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {documentos.map((doc) => (
                                    <tr key={doc.id} className="hover:bg-slate-100 transition-colors">
                                        <td className="px-6 py-4 text-sm text-slate-900 font-medium">{doc.tipo}</td>
                                        <td className="px-6 py-4 text-sm text-slate-600">{doc.empleado}</td>
                                        <td className="px-6 py-4 text-sm text-slate-500 font-mono">{doc.fecha}</td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end space-x-2">
                                                <Button variant="ghost" size="sm" className="text-blue-600 hover:bg-blue-500/10"><Eye className="h-4 w-4" /></Button>
                                                <Button variant="ghost" size="sm" className="text-green-400 hover:bg-green-500/10"><Download className="h-4 w-4" /></Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="flex flex-col items-center py-12 text-slate-400">
                        <FileWarning className="h-10 w-10 mb-2 opacity-20" />
                        <p className="text-sm">No se han generado documentos laborales aún.</p>
                    </div>
                )}
            </div>
        </motion.div>
    );
};

export default GestionContratos;