import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Clock, Save, Trash2, Loader2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAsistenciaRealApi, saveAsistenciaApi, deleteAsistenciaApi } from '@/services/rrhhService';
import TrabajadorSelect from '@/components/rrhh/TrabajadorSelect';

const mesActual = () => new Date().toISOString().slice(0, 7);
const periodoTexto = (v) => { const d = String(v).slice(0, 7).split('-'); return d.length === 2 ? `${d[1]}/${d[0]}` : String(v); };

const VACIO = { diasTrabajados: 30, diasAusente: 0, atrasosMin: 0, horasExtra: 0, obs: '' };

const AsistenciaRrhh = ({ empresaId }) => {
    const { user } = useAuth();
    const sid = user?.sessionId;
    const queryClient = useQueryClient();
    const [trabajadorId, setTrabajadorId] = useState('');
    const [periodo, setPeriodo] = useState(mesActual());
    const [form, setForm] = useState(VACIO);

    // Lista: por trabajador (su historial) o consolidado por período.
    const { data: lista = [], isLoading } = useQuery({
        queryKey: ['asistencia', trabajadorId || 'all', trabajadorId ? null : (empresaId || 'org'), trabajadorId ? null : periodo],
        queryFn: async () => {
            const r = trabajadorId
                ? await getAsistenciaRealApi(sid, { trabajadorId })
                : await getAsistenciaRealApi(sid, { empresaId, periodo });
            return r.ok ? r.json() : [];
        },
        enabled: !!sid,
    });

    // Al elegir trabajador/período, precarga el registro existente si lo hay.
    useEffect(() => {
        if (!trabajadorId) { setForm(VACIO); return; }
        const existente = lista.find(a => String(a.periodo).slice(0, 7) === periodo);
        setForm(existente
            ? { diasTrabajados: existente.diasTrabajados, diasAusente: existente.diasAusente, atrasosMin: existente.atrasosMin, horasExtra: existente.horasExtra, obs: existente.obs || '' }
            : VACIO);
    }, [trabajadorId, periodo, lista]);

    const invalidar = () => queryClient.invalidateQueries({ queryKey: ['asistencia'] });
    const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

    const guardar = useMutation({
        mutationFn: async () => {
            if (!trabajadorId) throw new Error('Selecciona un trabajador');
            const r = await saveAsistenciaApi(sid, { trabajadorId, periodo, ...form });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d?.message || 'No se pudo guardar');
            return d;
        },
        onSuccess: () => { invalidar(); toast({ title: 'Asistencia guardada', description: `Período ${periodoTexto(periodo)}.` }); },
        onError: (e) => toast({ title: 'No se pudo guardar', description: e.message, variant: 'destructive' }),
    });

    const quitar = useMutation({
        mutationFn: async (id) => { const r = await deleteAsistenciaApi(sid, id); if (!r.ok) throw new Error('No se pudo eliminar'); },
        onSuccess: () => { invalidar(); toast({ title: 'Registro eliminado' }); },
        onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
    });

    // Función (no componente) para no remontar el input y perder el foco al tipear.
    const campo = (label, k, { max, step = '1' } = {}) => (
        <div key={k}>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</label>
            <Input type="number" min={0} max={max} step={step} value={form[k]} onChange={e => set(k, e.target.value)} className="bg-white/[0.04] border-white/10" />
        </div>
    );

    return (
        <div className="space-y-5">
            {/* Toolbar */}
            <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                <div className="w-full lg:w-96">
                    <TrabajadorSelect value={trabajadorId} onChange={setTrabajadorId} empresaId={empresaId} placeholder="Todos (ver registro) o elige uno para editar…" />
                </div>
                <Input type="month" value={periodo} onChange={e => setPeriodo(e.target.value)} className="w-40 bg-white/[0.04] border-white/10" />
            </div>

            {/* Formulario (requiere trabajador) */}
            {trabajadorId && (
                <div className="rounded-2xl bg-white/[0.02] border border-white/10 p-4 space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {campo('Días trabajados', 'diasTrabajados', { max: 31 })}
                        {campo('Días ausente', 'diasAusente', { max: 31 })}
                        {campo('Atrasos (min)', 'atrasosMin')}
                        {campo('Horas extra', 'horasExtra', { step: '0.5' })}
                    </div>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
                        <div className="flex-1">
                            <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Observación</label>
                            <Input value={form.obs} onChange={e => set('obs', e.target.value)} placeholder="Detalle…" className="bg-white/[0.04] border-white/10" />
                        </div>
                        <Button onClick={() => guardar.mutate()} disabled={guardar.isPending} className="bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 text-white font-semibold h-10">
                            {guardar.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}Guardar período
                        </Button>
                    </div>
                    <div className="flex items-start gap-2.5 text-xs text-gray-400 bg-white/[0.03] border border-white/10 rounded-xl p-3">
                        <Info className="h-4 w-4 flex-shrink-0 mt-0.5 text-purple-400/70" />
                        <span>Registro de control. No modifica la liquidación automáticamente (los días de la liquidación se ajustan con <b>Licencias Médicas</b> y las horas extra con <b>Novedades del período</b>).</span>
                    </div>
                </div>
            )}

            {/* Registro */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
                {isLoading ? (
                    <div className="flex items-center justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-purple-500" /></div>
                ) : lista.length ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-white/10 bg-white/[0.03] text-gray-500">
                                    {!trabajadorId && <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wider">Trabajador</th>}
                                    <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wider">Período</th>
                                    <th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-wider">Días trab.</th>
                                    <th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-wider">Ausente</th>
                                    <th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-wider">Atrasos</th>
                                    <th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-wider">H. extra</th>
                                    <th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-wider">Acción</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.06]">
                                {lista.map((a, i) => (
                                    <motion.tr key={a.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, delay: i * 0.02 }} className="group hover:bg-white/[0.03]">
                                        {!trabajadorId && <td className="px-5 py-3 text-white font-medium">{a.empleado}{a.empresa ? <span className="block text-[11px] text-gray-500">{a.empresa}</span> : null}</td>}
                                        <td className="px-5 py-3 text-gray-400">{periodoTexto(a.periodo)}</td>
                                        <td className="px-5 py-3 text-right text-gray-200">{a.diasTrabajados}</td>
                                        <td className="px-5 py-3 text-right text-gray-400">{a.diasAusente}</td>
                                        <td className="px-5 py-3 text-right text-gray-400">{a.atrasosMin} min</td>
                                        <td className="px-5 py-3 text-right text-gray-400">{a.horasExtra}</td>
                                        <td className="px-5 py-3 text-right">
                                            <button onClick={() => quitar.mutate(a.id)} className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 opacity-70 group-hover:opacity-100 transition"><Trash2 className="h-4 w-4" /></button>
                                        </td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="flex flex-col items-center text-gray-500 py-20">
                        <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center mb-4"><Clock className="h-6 w-6 text-purple-400/60" /></div>
                        <h3 className="text-base font-semibold text-white">{trabajadorId ? 'Sin registros de este trabajador' : `Sin asistencia en ${periodoTexto(periodo)}`}</h3>
                        <p className="text-sm mt-1">{trabajadorId ? 'Completa el formulario y guarda.' : 'Elige un trabajador para registrar su asistencia.'}</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AsistenciaRrhh;
