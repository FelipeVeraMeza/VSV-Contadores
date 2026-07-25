import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Coins, Plus, Trash2, Repeat, CalendarDays, Loader2, ArrowDownCircle, ArrowUpCircle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    getCatalogosApi, getFijosApi, createFijoApi, deleteFijoApi,
    getMovimientosApi, createMovimientoApi, deleteMovimientoApi,
} from '@/services/rrhhService';
import TrabajadorSelect from '@/components/rrhh/TrabajadorSelect';

const clp = (v) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(Number(v) || 0);
const mesActual = () => new Date().toISOString().slice(0, 7);

// Pill de naturaleza (Haber / Descuento)
const NatBadge = ({ nat }) => nat === 'DESCUENTO'
    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-md bg-red-500/10 text-red-400"><ArrowDownCircle className="h-3 w-3" />Descuento</span>
    : <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-md bg-emerald-500/10 text-emerald-400"><ArrowUpCircle className="h-3 w-3" />Haber</span>;

// modo: 'fijos' | 'mes' | undefined. Si viene definido, la página queda fija en
// ese modo (Haberes y Descuentos = fijos; Novedades del período = mes) y oculta
// el selector de pestañas.
const HaberesDescuentosRrhh = ({ empresaId, modo }) => {
    const { user } = useAuth();
    const sid = user?.sessionId;
    const queryClient = useQueryClient();
    const [tab, setTab] = useState(modo || 'fijos');   // 'fijos' | 'mes'
    const [trabajadorId, setTrabajadorId] = useState('');
    const [periodo, setPeriodo] = useState(mesActual());

    // Alta
    const [conceptoId, setConceptoId] = useState('');
    const [monto, setMonto] = useState('');

    const { data: catalogos } = useQuery({
        queryKey: ['rem-catalogos'],
        queryFn: async () => { const r = await getCatalogosApi(sid); return r.ok ? r.json() : null; },
        enabled: !!sid, staleTime: 1000 * 60 * 30,
    });
    const conceptos = useMemo(() => (catalogos?.conceptos || []).filter(c => !c.obsoleto), [catalogos]);

    const { data: fijos = [], isLoading: loadingFijos } = useQuery({
        queryKey: ['fijos', trabajadorId],
        queryFn: async () => { const r = await getFijosApi(sid, trabajadorId); return r.ok ? r.json() : []; },
        enabled: !!sid && !!trabajadorId && tab === 'fijos',
    });
    const { data: movs = [], isLoading: loadingMovs } = useQuery({
        queryKey: ['movimientos', trabajadorId, periodo],
        queryFn: async () => { const r = await getMovimientosApi(sid, trabajadorId, periodo); return r.ok ? r.json() : []; },
        enabled: !!sid && !!trabajadorId && tab === 'mes',
    });

    const invalidar = () => {
        queryClient.invalidateQueries({ queryKey: ['fijos', trabajadorId] });
        queryClient.invalidateQueries({ queryKey: ['movimientos', trabajadorId] });
    };

    const agregar = useMutation({
        mutationFn: async () => {
            if (!conceptoId) throw new Error('Selecciona un concepto');
            if (!monto || Number(monto) <= 0) throw new Error('Indica un monto válido');
            const r = tab === 'fijos'
                ? await createFijoApi(sid, { trabajadorId, conceptoId, monto: Number(monto) })
                : await createMovimientoApi(sid, { trabajadorId, periodo, conceptoId, monto: Number(monto) });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d?.message || 'No se pudo agregar');
            return d;
        },
        onSuccess: () => { setConceptoId(''); setMonto(''); invalidar(); toast({ title: 'Concepto agregado' }); },
        onError: (e) => toast({ title: 'No se pudo agregar', description: e.message, variant: 'destructive' }),
    });

    const quitar = useMutation({
        mutationFn: async (id) => {
            const r = tab === 'fijos' ? await deleteFijoApi(sid, id) : await deleteMovimientoApi(sid, id);
            if (!r.ok) throw new Error('No se pudo eliminar');
        },
        onSuccess: () => { invalidar(); toast({ title: 'Concepto eliminado' }); },
        onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
    });

    const lista = tab === 'fijos' ? fijos : movs;
    const cargando = tab === 'fijos' ? loadingFijos : loadingMovs;
    const nat = (row) => row.naturaleza || 'HABER';

    return (
        <div className="space-y-5">
            {/* Selector de trabajador + tabs */}
            <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                <div className="w-full lg:w-96">
                    <TrabajadorSelect value={trabajadorId} onChange={setTrabajadorId} empresaId={empresaId} />
                </div>
                {!modo && (
                    <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/10 w-fit">
                        <TabBtn active={tab === 'fijos'} onClick={() => setTab('fijos')} icon={Repeat} label="Fijos (recurrentes)" />
                        <TabBtn active={tab === 'mes'} onClick={() => setTab('mes')} icon={CalendarDays} label="Del mes" />
                    </div>
                )}
                {tab === 'mes' && (
                    <Input type="month" value={periodo} onChange={e => setPeriodo(e.target.value)} className="w-40 bg-white/[0.04] border-white/10 lg:ml-auto" />
                )}
            </div>

            {!trabajadorId ? (
                <EmptyState icon={Coins} titulo="Elige un trabajador"
                    texto="Selecciona un trabajador para gestionar sus haberes y descuentos." />
            ) : (
                <>
                    {/* Nota explicativa según el tab */}
                    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-200 text-xs">
                        <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                        {tab === 'fijos'
                            ? <span><b>Fijos:</b> se aplican automáticamente en <b>cada</b> liquidación (ej. colación, movilización, bono fijo, cuota sindical).</span>
                            : <span><b>Del mes:</b> valen solo para <b>{periodo}</b> (ej. horas extra, comisiones, un bono puntual, un descuento por convenio).</span>}
                    </div>

                    {/* Alta rápida */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2 p-4 rounded-2xl bg-white/[0.02] border border-white/10">
                        <div className="flex-1 min-w-0">
                            <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Concepto</label>
                            <ThemedSelect value={conceptoId} onChange={setConceptoId} placeholder="Concepto…"
                                options={conceptos.map(c => ({ value: c.id, label: `${c.codigo} · ${c.descripcion} (${c.naturaleza === 'HABER' ? 'Haber' : 'Desc.'})` }))} />
                        </div>
                        <div className="w-full sm:w-40">
                            <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Monto</label>
                            <Input type="number" min="0" value={monto} onChange={e => setMonto(e.target.value)} placeholder="0" className="bg-white/[0.04] border-white/10" />
                        </div>
                        <Button onClick={() => agregar.mutate()} disabled={agregar.isPending} className="bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 text-white font-semibold h-10">
                            {agregar.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}Agregar
                        </Button>
                    </div>

                    {/* Lista */}
                    <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
                        {cargando ? (
                            <div className="flex items-center justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-purple-500" /></div>
                        ) : lista.length ? (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-white/10 bg-white/[0.03] text-gray-500">
                                            <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wider">Concepto</th>
                                            <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wider">Tipo</th>
                                            <th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-wider">Monto</th>
                                            <th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-wider">Acción</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/[0.06]">
                                        {lista.map((row, i) => (
                                            <motion.tr key={row.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, delay: i * 0.02 }} className="group hover:bg-white/[0.03]">
                                                <td className="px-5 py-3 text-gray-200">{row.codigo ? `${row.codigo} · ` : ''}{row.descripcion || row.glosa || 'Concepto'}</td>
                                                <td className="px-5 py-3"><NatBadge nat={nat(row)} /></td>
                                                <td className={`px-5 py-3 text-right font-semibold ${nat(row) === 'DESCUENTO' ? 'text-red-400' : 'text-emerald-400'}`}>{nat(row) === 'DESCUENTO' ? '− ' : ''}{clp(row.monto)}</td>
                                                <td className="px-5 py-3 text-right">
                                                    <button onClick={() => quitar.mutate(row.id)} className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 opacity-70 group-hover:opacity-100 transition"><Trash2 className="h-4 w-4" /></button>
                                                </td>
                                            </motion.tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <EmptyState icon={tab === 'fijos' ? Repeat : CalendarDays}
                                titulo={tab === 'fijos' ? 'Sin conceptos fijos' : `Sin novedades en ${periodo}`}
                                texto="Agrega un concepto con el formulario de arriba." inset />
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

const TabBtn = ({ active, onClick, icon: Icon, label }) => (
    <button onClick={onClick} className={`inline-flex items-center gap-2 px-3.5 h-9 rounded-lg text-sm font-medium transition-colors ${active ? 'bg-gradient-to-r from-purple-500 to-violet-600 text-white shadow' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
        <Icon className="h-4 w-4" />{label}
    </button>
);

const EmptyState = ({ icon: Icon, titulo, texto, inset }) => (
    <div className={`flex flex-col items-center text-gray-500 ${inset ? 'py-14' : 'py-20'}`}>
        <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center mb-4"><Icon className="h-6 w-6 text-purple-400/60" /></div>
        <h3 className="text-base font-semibold text-white">{titulo}</h3>
        <p className="text-sm mt-1">{texto}</p>
    </div>
);

export default HaberesDescuentosRrhh;
