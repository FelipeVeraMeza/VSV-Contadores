import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Search, Loader2, FileWarning, CalendarPlus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getVacacionesApi, registrarVacacionesApi } from '@/services/rrhhService';

const dias = (n) => `${Number(n ?? 0).toLocaleString('es-CL', { maximumFractionDigits: 2 })} días`;

const RegistrarModal = ({ trabajador, empresaId, onClose }) => {
    const { user } = useAuth();
    const qc = useQueryClient();
    const [form, setForm] = useState({ dias: '', desde: '', hasta: '', glosa: '' });
    const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
    const guardar = useMutation({
        mutationFn: async () => {
            const r = await registrarVacacionesApi(user?.sessionId, { trabajadorId: trabajador.id, dias: Number(form.dias), fechaDesde: form.desde || null, fechaHasta: form.hasta || null, glosa: form.glosa || null });
            const d = await r.json(); if (!r.ok) throw new Error(d?.message); return d;
        },
        onSuccess: () => { toast({ title: 'Vacaciones registradas', description: `${form.dias} días para ${trabajador.empleado}.` }); qc.invalidateQueries({ queryKey: ['vacaciones', empresaId] }); onClose(); },
        onError: (e) => toast({ title: 'No se pudo registrar', description: e.message, variant: 'destructive' }),
    });
    return (
        <Dialog open onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="sm:max-w-md bg-slate-50 backdrop-blur-xl border-[#efe8dd] text-slate-700">
                <DialogHeader><DialogTitle>Registrar vacaciones</DialogTitle></DialogHeader>
                <p className="text-sm text-slate-500 -mt-2">{trabajador.empleado} · saldo actual {dias(trabajador.saldo)}</p>
                <div className="space-y-3 py-2">
                    <div><Label>Días hábiles tomados</Label><Input type="number" step="0.5" min="0" value={form.dias} onChange={e => set('dias', e.target.value)} /></div>
                    <div className="grid grid-cols-2 gap-3">
                        <div><Label>Desde</Label><Input type="date" value={form.desde} onChange={e => set('desde', e.target.value)} /></div>
                        <div><Label>Hasta</Label><Input type="date" value={form.hasta} onChange={e => set('hasta', e.target.value)} /></div>
                    </div>
                    <div><Label>Glosa</Label><Input value={form.glosa} onChange={e => set('glosa', e.target.value)} placeholder="Opcional" /></div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose} className="border-[#efe8dd] text-slate-700 hover:bg-slate-100">Cancelar</Button>
                    <Button onClick={() => { if (!Number(form.dias)) return toast({ title: 'Ingresa los días', variant: 'destructive' }); guardar.mutate(); }} disabled={guardar.isPending} className="bg-gradient-to-r from-cyan-500 to-sky-600 text-white">
                        {guardar.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CalendarPlus className="h-4 w-4 mr-2" />}Registrar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

const VacacionesRrhh = ({ empresaId }) => {
    const { user } = useAuth();
    const consolidado = !empresaId;
    const [busqueda, setBusqueda] = useState('');
    const [reg, setReg] = useState(null);

    const { data: filas = [], isLoading } = useQuery({
        queryKey: ['vacaciones', empresaId],
        queryFn: async () => { const r = await getVacacionesApi(user?.sessionId, empresaId); return r.ok ? r.json() : []; },
        enabled: !!user?.sessionId,
    });

    const lista = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        return q ? filas.filter(f => f.empleado.toLowerCase().includes(q) || (f.empresa || '').toLowerCase().includes(q)) : filas;
    }, [filas, busqueda]);

    if (isLoading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-cyan-500" /></div>;

    return (
        <div className="space-y-5">
            <div className="relative max-w-md">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar trabajador…"
                    className="w-full bg-slate-50 border border-[#efe8dd] rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50" />
            </div>

            <div className="rounded-2xl border border-[#efe8dd] bg-white overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-[#efe8dd] bg-white">
                                <th className="px-5 py-3.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">Trabajador</th>
                                {consolidado && <th className="px-5 py-3.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">Empresa</th>}
                                <th className="px-5 py-3.5 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-400">Devengado</th>
                                <th className="px-5 py-3.5 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-400">Tomadas</th>
                                <th className="px-5 py-3.5 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-400">Saldo</th>
                                <th className="px-5 py-3.5 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-400">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.06]">
                            {lista.length ? lista.map((f, i) => (
                                <motion.tr key={f.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25, delay: i * 0.03 }} className="hover:bg-white">
                                    <td className="px-5 py-3.5 text-sm text-slate-900">{f.empleado}<div className="text-[10px] text-slate-400">{f.cargo}{f.zonaExtrema ? ' · zona extrema' : ''}</div></td>
                                    {consolidado && <td className="px-5 py-3.5 text-sm text-slate-500 truncate max-w-[200px]">{f.empresa || '—'}</td>}
                                    <td className="px-5 py-3.5 text-right text-sm text-slate-600">{dias(f.devengado)}</td>
                                    <td className="px-5 py-3.5 text-right text-sm text-slate-500">{dias(f.tomadas)}</td>
                                    <td className="px-5 py-3.5 text-right text-sm font-bold"><span className={f.saldo < 0 ? 'text-red-500' : 'text-emerald-600'}>{dias(f.saldo)}</span></td>
                                    <td className="px-5 py-3.5 text-right">
                                        <Button variant="ghost" size="sm" onClick={() => setReg(f)} className="h-8 text-cyan-600 hover:bg-cyan-500/10"><CalendarPlus className="h-4 w-4 mr-1.5" />Registrar</Button>
                                    </td>
                                </motion.tr>
                            )) : (
                                <tr><td colSpan={consolidado ? 6 : 5} className="text-center py-16">
                                    <div className="flex flex-col items-center text-slate-400">
                                        <div className="w-14 h-14 rounded-2xl bg-white border border-[#efe8dd] flex items-center justify-center mb-4"><FileWarning className="h-6 w-6 opacity-40" /></div>
                                        <h3 className="text-base font-semibold text-slate-900">Sin trabajadores activos</h3>
                                        <p className="text-sm mt-1">Registra trabajadores para llevar sus vacaciones.</p>
                                    </div>
                                </td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {reg && <RegistrarModal trabajador={reg} empresaId={empresaId} onClose={() => setReg(null)} />}
        </div>
    );
};

export default VacacionesRrhh;
