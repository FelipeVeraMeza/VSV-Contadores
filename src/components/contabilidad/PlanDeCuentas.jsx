import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Upload, Plus, Edit, Trash2, Loader2, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { getChartOfAccountsApi } from '@/services/accountingService';
import NuevaCuentaModal from '@/components/contabilidad/modals/NuevaCuentaModal';

const PlanDeCuentas = ({ empresaId }) => {
    const { user, logout } = useAuth();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedCuenta, setSelectedCuenta] = useState(null);
    const [searchTerm, setSearchTerm] = useState("");
    
    // ✅ AQUÍ ESTÁ EL ESTADO DEL SELECTOR (Arranca en LOCAL por defecto)
    const [normativaActiva, setNormativaActiva] = useState("LOCAL");

    const { data, isLoading } = useQuery({
        queryKey: ['chart-of-accounts', empresaId],
        queryFn: async () => {
            const res = await getChartOfAccountsApi(user.sessionId, empresaId);
            if (res.status === 401) { logout(); throw new Error("Sesión expirada"); }
            if (!res.ok) throw new Error("Error al obtener plan de cuentas");
            return res.json();
        },
        enabled: !!empresaId && !!user?.sessionId,
    });

    const planOrdenado = useMemo(() => {
        const rawPlan = data?.plan || [];
        
        const filtered = rawPlan.filter(cuenta => {
            // 1. Filtro por Normativa (Si en la BD viene vacío, asumimos LOCAL)
            const cuentaNormativa = cuenta.normativa || "LOCAL";
            const matchNormativa = cuentaNormativa === normativaActiva;

            // 2. Filtro por Búsqueda (Texto o Código)
            const matchSearch = cuenta.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                cuenta.codigo.includes(searchTerm);

            return matchNormativa && matchSearch;
        });

        // Ordenamos numéricamente por el código (ej: 1.1 antes que 1.10)
        return [...filtered].sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }));
    }, [data, searchTerm, normativaActiva]); // <- Dependencias actualizadas

    const handleOpenModal = (cuenta = null) => {
        setSelectedCuenta(cuenta);
        setIsModalOpen(true);
    };

    const formatCurrency = (val) => {
        return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(val || 0);
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="h-10 w-10 text-blue-500 animate-spin opacity-40 mb-4" />
                <p className="text-[10px] font-black uppercase text-gray-500 tracking-[0.3em]">Mapeando Árbol de Cuentas...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
                <div className="flex items-center space-x-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Buscar código o cuenta..."
                            className="bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
                        />
                    </div>
                    
                    {/* ✅ SELECTOR CONECTADO AL ESTADO REACTIVO */}
                    <Select value={normativaActiva} onValueChange={setNormativaActiva}>
                        <SelectTrigger className="w-[180px] bg-white/5 border-white/10 text-[10px] font-bold uppercase tracking-widest h-9">
                            <SelectValue placeholder="Plantilla" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-white/10 text-white">
                            <SelectItem value="LOCAL">Estándar Chile (PCGA)</SelectItem>
                            <SelectItem value="IFRS">Estándar IFRS / NIIF</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                
                <div className="flex items-center space-x-3">
                    <Button variant="outline" size="sm" className="border-white/10 text-white hover:bg-white/5 font-bold uppercase text-[10px] tracking-widest">
                        <Upload className="h-4 w-4 mr-2" />
                        Importar CSV
                    </Button>
                    <Button onClick={() => handleOpenModal()} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold uppercase text-[10px] tracking-widest shadow-lg shadow-blue-900/20">
                        <Plus className="h-4 w-4 mr-2" />
                        Nueva Cuenta
                    </Button>
                </div>
            </div>

            <div className="bg-black/20 rounded-2xl border border-white/5 overflow-hidden shadow-2xl backdrop-blur-md">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-white/5">
                            <tr>
                                <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-gray-400">Código</th>
                                <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-gray-400">Nombre de la Cuenta</th>
                                <th className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-gray-400">Tipo</th>
                                <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">Saldo</th>
                                <th className="px-6 py-4 text-center text-[10px] font-black uppercase tracking-widest text-gray-400">Estado</th>
                                <th className="px-6 py-4 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            <AnimatePresence>
                                {planOrdenado.length === 0 ? (
                                     <tr>
                                         <td colSpan={6} className="py-12 text-center text-gray-500 font-bold uppercase tracking-widest text-xs">
                                             No se encontraron cuentas para la normativa {normativaActiva}.
                                         </td>
                                     </tr>
                                ) : planOrdenado.map((cuenta, index) => {
                                    const nivel = cuenta.codigo.split('.').length;
                                    const esGrupo = cuenta.tipo === 'Grupo';
                                    
                                    return (
                                        <motion.tr
                                            key={cuenta.codigo}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            className={`transition-colors group ${esGrupo ? 'bg-white/[0.02]' : 'hover:bg-white/[0.04]'}`}
                                        >
                                            <td className="px-6 py-3 text-xs font-mono text-blue-400 font-bold">{cuenta.codigo}</td>
                                            <td className="px-6 py-3 text-sm text-gray-300" style={{ paddingLeft: `${nivel * 1.5}rem` }}>
                                                <span className={esGrupo ? 'text-white font-bold uppercase tracking-tight' : 'text-gray-300'}>
                                                    {cuenta.nombre}
                                                </span>
                                            </td>
                                            <td className="px-6 py-3">
                                                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                                                    esGrupo ? 'bg-blue-500/10 text-blue-400' : 'bg-gray-500/10 text-gray-500'
                                                }`}>
                                                    {cuenta.tipo}
                                                </span>
                                            </td>
                                            <td className={`px-6 py-3 text-right text-sm font-bold ${esGrupo ? 'text-white' : 'text-gray-400'}`}>
                                                {cuenta.saldo ? formatCurrency(cuenta.saldo) : '-'}
                                            </td>
                                            <td className="px-6 py-3 text-center">
                                                {cuenta.protegida ? (
                                                    <Shield className="h-3.5 w-3.5 text-amber-500/40 mx-auto" />
                                                ) : (
                                                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 mx-auto shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                                )}
                                            </td>
                                            <td className="px-6 py-3 text-right">
                                                {!cuenta.protegida && (
                                                    <div className="flex items-center justify-end space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <Button variant="ghost" size="icon" onClick={() => handleOpenModal(cuenta)} className="h-8 w-8 text-yellow-400 hover:bg-yellow-500/20"><Edit className="h-3.5 w-3.5" /></Button>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:bg-red-500/20"><Trash2 className="h-3.5 w-3.5" /></Button>
                                                    </div>
                                                )}
                                            </td>
                                        </motion.tr>
                                    );
                                })}
                            </AnimatePresence>
                        </tbody>
                    </table>
                </div>
            </div>

            <NuevaCuentaModal
                isOpen={isModalOpen}
                setIsOpen={setIsModalOpen}
                onSave={(data)}
                cuenta={selectedCuenta}
                normativaActual={normativaActiva} // Para que al crear sepa a qué lista va
            />
        </div>
    );
};

export default PlanDeCuentas;