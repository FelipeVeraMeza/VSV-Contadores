import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Search, Filter, Download, Edit, Trash2, FileWarning, Loader2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTrabajadoresApi, deleteTrabajadorApi } from '@/services/rrhhService';
import EditarEmpleadoModal from '@/components/rrhh/modals/EditarEmpleadoModal';

const iniciales = (nombre = '') => nombre.trim().split(/\s+/).slice(0, 2).map(p => p[0] || '').join('').toUpperCase() || '—';
const colorAvatar = (s = '') => {
    const cols = ['from-blue-500 to-cyan-500', 'from-violet-500 to-purple-500', 'from-emerald-500 to-green-500', 'from-rose-500 to-pink-500', 'from-amber-500 to-orange-500'];
    let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return cols[h % cols.length];
};

const GestionEmpleados = ({ empresaId, onNew }) => {
    const { user, logout } = useAuth();
    const queryClient = useQueryClient();
    const [busqueda, setBusqueda] = useState('');
    const [editId, setEditId] = useState(null);
    const consolidado = !empresaId;

    const { data: empleadosData = [], isLoading } = useQuery({
        queryKey: ['trabajadores', empresaId],
        queryFn: async () => {
            const res = await getTrabajadoresApi(user?.sessionId, empresaId);
            if (res.status === 401) { logout(); throw new Error("Sesión expirada"); }
            if (!res.ok) throw new Error("Error al obtener trabajadores");
            return res.json();
        },
        enabled: Boolean(empresaId) && !!user?.sessionId,
        staleTime: 1000 * 60 * 2,
    });

    const eliminar = useMutation({
        mutationFn: async (id) => {
            const res = await deleteTrabajadorApi(user?.sessionId, id);
            if (!res.ok) throw new Error("No se pudo eliminar");
            return res.json();
        },
        onSuccess: () => {
            toast({ title: "Trabajador eliminado", description: "La ficha fue eliminada." });
            queryClient.invalidateQueries({ queryKey: ['trabajadores', empresaId] });
        },
        onError: () => toast({ title: "Error", description: "No se pudo eliminar el trabajador.", variant: "destructive" }),
    });

    const handleEliminar = (empleado) => {
        if (window.confirm(`¿Eliminar definitivamente a ${empleado.nombre}? Esta acción no se puede deshacer.`)) {
            eliminar.mutate(empleado.id);
        }
    };

    const filtrados = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        if (!q) return empleadosData;
        return empleadosData.filter(e =>
            (e.nombre || '').toLowerCase().includes(q) ||
            (e.rut || '').toLowerCase().includes(q) ||
            (e.cargo || '').toLowerCase().includes(q)
        );
    }, [empleadosData, busqueda]);

    if (isLoading) {
        return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-purple-500" /></div>;
    }

    return (
        <div className="space-y-5">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <input
                        type="text"
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        placeholder="Buscar por nombre, RUT o cargo…"
                        className="w-full bg-white/[0.04] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-transparent transition"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => toast({ title: "Filtros", description: "Próximamente." })} className="border-white/10 bg-white/[0.03] text-gray-300 hover:bg-white/[0.06] hover:text-white h-10"><Filter className="h-4 w-4 mr-2" />Filtros</Button>
                    <Button variant="outline" size="sm" onClick={() => toast({ title: "Exportar", description: "Próximamente." })} className="border-white/10 bg-white/[0.03] text-gray-300 hover:bg-white/[0.06] hover:text-white h-10"><Download className="h-4 w-4 mr-2" />Exportar</Button>
                    {onNew && <Button onClick={onNew} className="bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 text-white font-semibold h-10 shadow-lg shadow-purple-900/20"><UserPlus className="h-4 w-4 mr-2" />Nuevo Trabajador</Button>}
                </div>
            </div>

            {/* Tabla */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-white/10 bg-white/[0.03]">
                                <th className="px-5 py-3.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">Trabajador</th>
                                <th className="px-5 py-3.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">RUT</th>
                                <th className="px-5 py-3.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">Cargo</th>
                                {consolidado && <th className="px-5 py-3.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">Empresa</th>}
                                <th className="px-5 py-3.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">Estado</th>
                                <th className="px-5 py-3.5 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-500">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.06]">
                            {filtrados.length > 0 ? (
                                filtrados.map((empleado, index) => (
                                    <motion.tr key={empleado.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25, delay: index * 0.03 }} className="group hover:bg-white/[0.03] transition-colors">
                                        <td className="px-5 py-3.5">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${colorAvatar(empleado.nombre)} flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0`}>{iniciales(empleado.nombre)}</div>
                                                <span className="text-sm text-white font-medium">{empleado.nombre}</span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3.5 text-sm text-gray-400 font-mono text-xs">{empleado.rut}</td>
                                        <td className="px-5 py-3.5 text-sm text-gray-300">{empleado.cargo}</td>
                                        {consolidado && <td className="px-5 py-3.5 text-sm text-gray-400 truncate max-w-[220px]">{empleado.empresa || '—'}</td>}
                                        <td className="px-5 py-3.5">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-semibold rounded-full ${empleado.estado === 'Activo' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-orange-500/15 text-orange-400'}`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${empleado.estado === 'Activo' ? 'bg-emerald-400' : 'bg-orange-400'}`} />{empleado.estado}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                                                <Button variant="ghost" size="sm" onClick={() => setEditId(empleado.id)} className="h-8 w-8 p-0 text-gray-400 hover:text-yellow-400 hover:bg-yellow-500/10"><Edit className="h-4 w-4" /></Button>
                                                <Button variant="ghost" size="sm" onClick={() => handleEliminar(empleado)} disabled={eliminar.isPending} className="h-8 w-8 p-0 text-gray-400 hover:text-red-400 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></Button>
                                            </div>
                                        </td>
                                    </motion.tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={consolidado ? 6 : 5} className="text-center py-16">
                                        <div className="flex flex-col items-center text-gray-500">
                                            <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center mb-4"><FileWarning className="h-6 w-6 opacity-40" /></div>
                                            <h3 className="text-base font-semibold text-white">{busqueda ? 'Sin resultados' : 'No hay trabajadores registrados'}</h3>
                                            <p className="text-sm mt-1">{busqueda ? 'Prueba con otro término.' : 'Agrega un trabajador para comenzar.'}</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <EditarEmpleadoModal isOpen={!!editId} setIsOpen={(v) => { if (!v) setEditId(null); }} trabajadorId={editId} empresaId={empresaId} />
        </div>
    );
};

export default GestionEmpleados;
