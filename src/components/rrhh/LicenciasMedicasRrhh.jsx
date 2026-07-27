import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Stethoscope, Plus, Trash2, Loader2, Info, CalendarX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getLicenciasApi, createLicenciaApi, deleteLicenciaApi } from '@/services/rrhhService';
import TrabajadorSelect from '@/components/rrhh/TrabajadorSelect';

const mesActual = () => new Date().toISOString().slice(0, 7);
const fmtFecha = (v) => { if (!v) return '—'; const d = String(v).slice(0, 10).split('-'); return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : '—'; };
const periodoTexto = (v) => { const d = String(v).slice(0, 7).split('-'); return d.length === 2 ? `${d[1]}/${d[0]}` : String(v); };

const TIPOS = [
    { value: 'comun', label: 'Enfermedad común' },
    { value: 'maternal', label: 'Maternal / pre-postnatal' },
    { value: 'laboral', label: 'Accidente o enfermedad laboral' },
    { value: 'prorroga', label: 'Prórroga' },
];
const TIPO_LABEL = Object.fromEntries(TIPOS.map(t => [t.value, t.label]));
const TIPO_PILL = {
    comun: 'bg-blue-500/10 text-blue-600', maternal: 'bg-pink-500/10 text-pink-400',
    laboral: 'bg-amber-500/10 text-amber-600', prorroga: 'bg-violet-500/10 text-violet-400',
};

const diasEntre = (ini, fin) => {
    if (!ini || !fin) return '';
    const a = new Date(ini), b = new Date(fin);
    const n = Math.round((b - a) / 86400000) + 1;
    return n > 0 ? String(n) : '';
};

const LicenciasMedicasRrhh = ({ empresaId }) => {
    const { user } = useAuth();
    const sid = user?.sessionId;
    const queryClient = useQueryClient();
    const [trabajadorId, setTrabajadorId] = useState('');
    const [periodo, setPeriodo] = useState(mesActual());

    // Formulario
    const [tipo, setTipo] = useState('comun');
    const [folio, setFolio] = useState('');
    const [fechaInicio, setFechaInicio] = useState('');
    const [fechaFin, setFechaFin] = useState('');
    const [dias, setDias] = useState('');
    const [glosa, setGlosa] = useState('');

    // Al fijar ambas fechas, sugiere los días (editable).
    useEffect(() => {
        const d = diasEntre(fechaInicio, fechaFin);
        if (d) setDias(d);
    }, [fechaInicio, fechaFin]);

    // Con trabajador → sus licencias; sin trabajador → consolidado por período.
    const { data: lista = [], isLoading } = useQuery({
        queryKey: ['licencias', trabajadorId || 'all', trabajadorId ? null : (empresaId || 'org'), trabajadorId ? null : periodo],
        queryFn: async () => {
            const r = trabajadorId
                ? await getLicenciasApi(sid, { trabajadorId })
                : await getLicenciasApi(sid, { empresaId, periodo });
            return r.ok ? r.json() : [];
        },
        enabled: !!sid,
    });

    const invalidar = () => queryClient.invalidateQueries({ queryKey: ['licencias'] });

    const registrar = useMutation({
        mutationFn: async () => {
            if (!trabajadorId) throw new Error('Selecciona un trabajador');
            if (!dias || Number(dias) <= 0) throw new Error('Indica los días de licencia');
            const r = await createLicenciaApi(sid, {
                trabajadorId, periodo, tipo, folio: folio || null,
                fechaInicio: fechaInicio || null, fechaFin: fechaFin || null,
                dias: Number(dias), glosa: glosa || null,
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d?.message || 'No se pudo registrar');
            return d;
        },
        onSuccess: () => {
            setFolio(''); setFechaInicio(''); setFechaFin(''); setDias(''); setGlosa('');
            invalidar();
            toast({ title: 'Licencia registrada', description: 'La liquidación del período la considerará automáticamente.' });
        },
        onError: (e) => toast({ title: 'No se pudo registrar', description: e.message, variant: 'destructive' }),
    });

    const quitar = useMutation({
        mutationFn: async (id) => { const r = await deleteLicenciaApi(sid, id); if (!r.ok) throw new Error('No se pudo eliminar'); },
        onSuccess: () => { invalidar(); toast({ title: 'Licencia eliminada' }); },
        onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
    });

    return (
        <div className="space-y-5">
            {/* Toolbar */}
            <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                <div className="w-full lg:w-96">
                    <TrabajadorSelect value={trabajadorId} onChange={setTrabajadorId} empresaId={empresaId} placeholder="Todos (ver registro) o elige uno para agregar…" />
                </div>
                <Input type="month" value={periodo} onChange={e => setPeriodo(e.target.value)} className="w-40 bg-slate-50 border-[#efe8dd]" />
                {trabajadorId && <span className="text-xs text-slate-400">Registrando en <b className="text-slate-600">{periodoTexto(periodo)}</b></span>}
            </div>

            {/* Formulario de alta (requiere trabajador) */}
            {trabajadorId && (
                <div className="rounded-2xl bg-white border border-[#efe8dd] p-4 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div>
                            <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Tipo</label>
                            <ThemedSelect value={tipo} onChange={setTipo} options={TIPOS} />
                        </div>
                        <div>
                            <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Folio (opcional)</label>
                            <Input value={folio} onChange={e => setFolio(e.target.value)} placeholder="N° de licencia" className="bg-slate-50 border-[#efe8dd]" />
                        </div>
                        <div>
                            <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Desde</label>
                            <Input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} className="bg-slate-50 border-[#efe8dd] [color-scheme:light]" />
                        </div>
                        <div>
                            <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Hasta</label>
                            <Input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} className="bg-slate-50 border-[#efe8dd] [color-scheme:light]" />
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
                        <div className="w-full sm:w-32">
                            <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Días</label>
                            <Input type="number" min="1" max="31" value={dias} onChange={e => setDias(e.target.value)} placeholder="0" className="bg-slate-50 border-[#efe8dd]" />
                        </div>
                        <div className="flex-1">
                            <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Observación (opcional)</label>
                            <Input value={glosa} onChange={e => setGlosa(e.target.value)} placeholder="Detalle…" className="bg-slate-50 border-[#efe8dd]" />
                        </div>
                        <Button onClick={() => registrar.mutate()} disabled={registrar.isPending} className="bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 text-slate-900 font-semibold h-10">
                            {registrar.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}Registrar licencia
                        </Button>
                    </div>
                    <div className="flex items-start gap-2.5 text-xs text-indigo-200 bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-3">
                        <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                        <span>Los días de licencia <b>descuentan del período</b>: al generar la liquidación de {periodoTexto(periodo)}, los días trabajados y el sueldo base se ajustan automáticamente.</span>
                    </div>
                </div>
            )}

            {/* Registro */}
            <div className="rounded-2xl border border-[#efe8dd] bg-white overflow-hidden">
                {isLoading ? (
                    <div className="flex items-center justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-purple-500" /></div>
                ) : lista.length ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-[#efe8dd] bg-white text-slate-400">
                                    {!trabajadorId && <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wider">Trabajador</th>}
                                    <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wider">Tipo</th>
                                    <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wider">Período</th>
                                    <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wider">Desde–Hasta</th>
                                    <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wider">Folio</th>
                                    <th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-wider">Días</th>
                                    <th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-wider">Acción</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.06]">
                                {lista.map((l, i) => (
                                    <motion.tr key={l.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, delay: i * 0.02 }} className="group hover:bg-white">
                                        {!trabajadorId && <td className="px-5 py-3 text-slate-700 font-medium">{l.empleado}{l.empresa ? <span className="block text-[11px] text-slate-400">{l.empresa}</span> : null}</td>}
                                        <td className="px-5 py-3"><span className={`inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-md ${TIPO_PILL[l.tipo] || 'bg-gray-500/10 text-slate-500'}`}>{TIPO_LABEL[l.tipo] || l.tipo}</span></td>
                                        <td className="px-5 py-3 text-slate-500">{periodoTexto(l.periodo)}</td>
                                        <td className="px-5 py-3 text-slate-500 whitespace-nowrap">{fmtFecha(l.fechaInicio)} – {fmtFecha(l.fechaFin)}</td>
                                        <td className="px-5 py-3 text-slate-500">{l.folio || '—'}</td>
                                        <td className="px-5 py-3 text-right"><span className="inline-flex items-center gap-1 font-semibold text-purple-700"><CalendarX className="h-3.5 w-3.5" />{l.dias}</span></td>
                                        <td className="px-5 py-3 text-right">
                                            <button onClick={() => quitar.mutate(l.id)} className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-red-500 hover:bg-red-500/10 opacity-70 group-hover:opacity-100 transition"><Trash2 className="h-4 w-4" /></button>
                                        </td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="flex flex-col items-center text-slate-400 py-20">
                        <div className="w-14 h-14 rounded-2xl bg-white border border-[#efe8dd] flex items-center justify-center mb-4"><Stethoscope className="h-6 w-6 text-purple-600/60" /></div>
                        <h3 className="text-base font-semibold text-slate-900">{trabajadorId ? 'Este trabajador no tiene licencias' : `Sin licencias en ${periodoTexto(periodo)}`}</h3>
                        <p className="text-sm mt-1">{trabajadorId ? 'Registra una con el formulario de arriba.' : 'Elige un trabajador para registrar una licencia.'}</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default LicenciasMedicasRrhh;
