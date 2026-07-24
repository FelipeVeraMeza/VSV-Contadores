import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Download, Plus, Eye, FileWarning, Loader2, CheckCircle2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getLiquidacionesRealApi, cambiarEstadoLiquidacionApi, deleteLiquidacionApi } from '@/services/rrhhService';
import LiquidacionDetalleModal from '@/components/rrhh/modals/LiquidacionDetalleModal';

const clp = (v) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(Number(v) || 0);
const mesActual = () => new Date().toISOString().slice(0, 7);

const ESTADOS = {
    borrador: { label: 'Borrador', pill: 'bg-gray-500/15 text-gray-300', dot: 'bg-gray-400' },
    revisada: { label: 'Revisada', pill: 'bg-blue-500/15 text-blue-400', dot: 'bg-blue-400' },
    aprobada: { label: 'Aprobada', pill: 'bg-green-500/15 text-green-400', dot: 'bg-green-400' },
    pagada: { label: 'Pagada', pill: 'bg-emerald-500/15 text-emerald-400', dot: 'bg-emerald-400' },
    anulada: { label: 'Anulada', pill: 'bg-red-500/15 text-red-400', dot: 'bg-red-400' },
};

const iniciales = (n = '') => n.trim().split(/\s+/).slice(0, 2).map(p => p[0] || '').join('').toUpperCase() || '—';

const GestionLiquidaciones = ({ empresaId, onAddLiquidation }) => {
    const { user, logout } = useAuth();
    const queryClient = useQueryClient();
    const sid = user?.sessionId;
    const [periodo, setPeriodo] = useState(mesActual());
    const [detalleId, setDetalleId] = useState(null);
    const consolidado = !empresaId;

    const { data: liquidaciones = [], isLoading } = useQuery({
        queryKey: ['liquidaciones', empresaId, periodo],
        queryFn: async () => {
            const r = await getLiquidacionesRealApi(sid, empresaId, periodo);
            if (r.status === 401) { logout(); throw new Error('Sesión expirada'); }
            if (!r.ok) throw new Error('Error al obtener liquidaciones');
            return r.json();
        },
        enabled: Boolean(empresaId) && !!sid,
    });

    const invalidar = () => queryClient.invalidateQueries({ queryKey: ['liquidaciones', empresaId] });
    const aprobar = useMutation({
        mutationFn: async (id) => { const r = await cambiarEstadoLiquidacionApi(sid, id, 'aprobada'); const d = await r.json(); if (!r.ok) throw new Error(d?.message); return d; },
        onSuccess: () => { toast({ title: 'Liquidación aprobada' }); invalidar(); },
        onError: (e) => toast({ title: 'No se pudo aprobar', description: e.message, variant: 'destructive' }),
    });
    const eliminar = useMutation({
        mutationFn: async (id) => { const r = await deleteLiquidacionApi(sid, id); const d = await r.json(); if (!r.ok) throw new Error(d?.message); return d; },
        onSuccess: () => { toast({ title: 'Liquidación eliminada' }); invalidar(); },
        onError: (e) => toast({ title: 'No se pudo eliminar', description: e.message, variant: 'destructive' }),
    });

    const totalLiquido = liquidaciones.reduce((s, l) => s + (Number(l.liquido) || 0), 0);

    return (
        <div className="space-y-5">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3">
                    <Input type="month" value={periodo} onChange={e => setPeriodo(e.target.value)} className="w-44 bg-white/[0.04] border-white/10" />
                    {liquidaciones.length > 0 && (
                        <span className="text-xs text-gray-500">{liquidaciones.length} liquidación(es) · <span className="text-green-400 font-semibold">{clp(totalLiquido)}</span></span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => toast({ title: 'Exportar Previred', description: 'Disponible en la Fase 5.' })} className="border-white/10 bg-white/[0.03] text-gray-300 hover:bg-white/[0.06] hover:text-white h-10"><Download className="h-4 w-4 mr-2" />Previred</Button>
                    {onAddLiquidation && <Button onClick={onAddLiquidation} className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold h-10 shadow-lg shadow-green-900/20"><Plus className="h-4 w-4 mr-2" />Nueva Liquidación</Button>}
                </div>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-green-500" /></div>
            ) : (
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-white/10 bg-white/[0.03]">
                                    <th className="px-5 py-3.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">Empleado</th>
                                    <th className="px-5 py-3.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">Cargo</th>
                                    {consolidado && <th className="px-5 py-3.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">Empresa</th>}
                                    <th className="px-5 py-3.5 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-500">Líquido</th>
                                    <th className="px-5 py-3.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">Estado</th>
                                    <th className="px-5 py-3.5 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-500">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.06]">
                                {liquidaciones.length > 0 ? (
                                    liquidaciones.map((l, index) => {
                                        const est = ESTADOS[l.estado] || ESTADOS.borrador;
                                        return (
                                            <motion.tr key={l.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25, delay: index * 0.03 }} className="group hover:bg-white/[0.03] transition-colors">
                                                <td className="px-5 py-3.5">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">{iniciales(l.empleado)}</div>
                                                        <span className="text-sm text-white font-medium">{l.empleado}</span>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-3.5 text-sm text-gray-400">{l.cargo}</td>
                                                {consolidado && <td className="px-5 py-3.5 text-sm text-gray-400 truncate max-w-[200px]">{l.empresa || '—'}</td>}
                                                <td className="px-5 py-3.5 text-right text-sm text-green-400 font-bold">{clp(l.liquido)}</td>
                                                <td className="px-5 py-3.5">
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-semibold rounded-full ${est.pill}`}><span className={`w-1.5 h-1.5 rounded-full ${est.dot}`} />{est.label}</span>
                                                </td>
                                                <td className="px-5 py-3.5">
                                                    <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                                                        <Button variant="ghost" size="sm" onClick={() => setDetalleId(l.id)} className="h-8 w-8 p-0 text-gray-400 hover:text-blue-400 hover:bg-blue-500/10" title="Ver detalle"><Eye className="h-4 w-4" /></Button>
                                                        {['borrador', 'revisada'].includes(l.estado) && <Button variant="ghost" size="sm" onClick={() => aprobar.mutate(l.id)} disabled={aprobar.isPending} className="h-8 w-8 p-0 text-gray-400 hover:text-green-400 hover:bg-green-500/10" title="Aprobar"><CheckCircle2 className="h-4 w-4" /></Button>}
                                                        {!['aprobada', 'pagada'].includes(l.estado) && <Button variant="ghost" size="sm" onClick={() => { if (window.confirm(`¿Eliminar la liquidación de ${l.empleado}?`)) eliminar.mutate(l.id); }} disabled={eliminar.isPending} className="h-8 w-8 p-0 text-gray-400 hover:text-red-400 hover:bg-red-500/10" title="Eliminar"><Trash2 className="h-4 w-4" /></Button>}
                                                    </div>
                                                </td>
                                            </motion.tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan={consolidado ? 6 : 5} className="text-center py-16">
                                            <div className="flex flex-col items-center text-gray-500">
                                                <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center mb-4"><FileWarning className="h-6 w-6 opacity-40" /></div>
                                                <h3 className="text-base font-semibold text-white">Sin liquidaciones en este período</h3>
                                                <p className="text-sm mt-1">Crea una con "Nueva Liquidación".</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <LiquidacionDetalleModal isOpen={!!detalleId} setIsOpen={(v) => { if (!v) setDetalleId(null); }} liquidacionId={detalleId} empresaId={empresaId} />
        </div>
    );
};

export default GestionLiquidaciones;
