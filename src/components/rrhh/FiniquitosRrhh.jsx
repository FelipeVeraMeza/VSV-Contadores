import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Receipt, Plus, Eye, Loader2, FileWarning, Printer, Calculator } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { getTrabajadoresApi, getCausalesApi, previewFiniquitoApi, guardarFiniquitoApi, listFiniquitosApi, getFiniquitoApi } from '@/services/rrhhService';

const clp = (v) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(Number(v) || 0);
const hoy = () => new Date().toISOString().slice(0, 10);

// ── Modal: nuevo finiquito con preview en vivo ──────────────────────────────
const NuevoFiniquitoModal = ({ empresaId, onClose }) => {
    const { user } = useAuth();
    const sid = user?.sessionId;
    const qc = useQueryClient();
    const [form, setForm] = useState({ trabajadorId: '', fechaTermino: hoy(), causal: '', dioAviso: false, otrosHaberes: '', descuentos: '' });
    const [prev, setPrev] = useState(null);
    const [calc, setCalc] = useState(false);
    const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

    const { data: trabajadores = [] } = useQuery({ queryKey: ['trabajadores', empresaId], queryFn: async () => { const r = await getTrabajadoresApi(sid, empresaId); return r.ok ? r.json() : []; }, enabled: !!sid });
    const { data: causales = [] } = useQuery({ queryKey: ['rem-causales'], queryFn: async () => { const r = await getCausalesApi(sid); return r.ok ? r.json() : []; }, enabled: !!sid, staleTime: 1e9 });

    const preview = useCallback(async () => {
        if (!form.trabajadorId || !form.causal || !/^\d{4}-\d{2}-\d{2}$/.test(form.fechaTermino)) { setPrev(null); return; }
        setCalc(true);
        try {
            const r = await previewFiniquitoApi(sid, { ...form, otrosHaberes: Number(form.otrosHaberes) || 0, descuentos: Number(form.descuentos) || 0 });
            const d = await r.json(); setPrev(r.ok ? d : null);
            if (!r.ok) toast({ title: 'No se pudo calcular', description: d?.message, variant: 'destructive' });
        } catch { setPrev(null); } finally { setCalc(false); }
    }, [sid, form]);

    useEffect(() => { preview(); }, [preview]);

    const guardar = useMutation({
        mutationFn: async () => { const r = await guardarFiniquitoApi(sid, { ...form, otrosHaberes: Number(form.otrosHaberes) || 0, descuentos: Number(form.descuentos) || 0 }); const d = await r.json(); if (!r.ok) throw new Error(d?.message); return d; },
        onSuccess: (d) => { toast({ title: 'Finiquito guardado', description: `Total ${clp(d.total)}.` }); qc.invalidateQueries({ queryKey: ['finiquitos', empresaId] }); onClose(); },
        onError: (e) => toast({ title: 'No se pudo guardar', description: e.message, variant: 'destructive' }),
    });

    return (
        <Dialog open onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="sm:max-w-3xl bg-black/60 backdrop-blur-xl border-white/20 text-white max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-2xl">Nuevo finiquito</DialogTitle>
                    <DialogDescription>Selecciona el trabajador, la causal y la fecha de término.</DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 py-2">
                    <div className="space-y-3">
                        <div><Label>Trabajador</Label>
                            <ThemedSelect value={form.trabajadorId} onChange={(v) => set('trabajadorId', v)} placeholder="Seleccionar…"
                                options={trabajadores.map(t => ({ value: t.id, label: `${t.nombre} — ${t.rut}` }))} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div><Label>Fecha de término</Label><Input type="date" value={form.fechaTermino} onChange={e => set('fechaTermino', e.target.value)} /></div>
                            <div className="flex items-end">
                                <label className={`flex items-center gap-2 text-sm cursor-pointer rounded-lg border px-3 h-10 w-full transition ${form.dioAviso ? 'border-purple-500/40 bg-purple-500/10 text-white' : 'border-white/10 bg-white/[0.03] text-gray-300'}`}>
                                    <input type="checkbox" checked={form.dioAviso} onChange={e => set('dioAviso', e.target.checked)} className="h-4 w-4 accent-purple-500 [color-scheme:dark]" />
                                    Dio aviso 30 días
                                </label>
                            </div>
                        </div>
                        <div><Label>Causal de término</Label>
                            <ThemedSelect value={form.causal} onChange={(v) => set('causal', v)} placeholder="Seleccionar causal…"
                                options={causales.map(c => ({ value: c.codigo, label: c.label }))} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div><Label>Otros haberes</Label><Input type="number" value={form.otrosHaberes} onChange={e => set('otrosHaberes', e.target.value)} placeholder="0" /></div>
                            <div><Label>Descuentos</Label><Input type="number" value={form.descuentos} onChange={e => set('descuentos', e.target.value)} placeholder="0" /></div>
                        </div>
                    </div>

                    <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                        {calc ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-fuchsia-500" /></div>
                            : !prev ? <div className="h-full flex items-center justify-center text-gray-500 text-sm text-center py-12">Completa trabajador, fecha y causal para ver el cálculo.</div>
                                : (
                                    <div className="space-y-2 text-sm">
                                        <div className="text-center border-b border-white/10 pb-2">
                                            <p className="font-bold text-white">{prev.trabajador?.nombre}</p>
                                            <p className="text-[11px] text-gray-400">{prev.anosServicio} años {prev.restoMeses} meses · {prev.causalLabel}</p>
                                        </div>
                                        <Row label="Vacaciones proporcionales" val={prev.vacProporcional} hint={`${prev.diasVacPendientes} días`} />
                                        <Row label="Indemnización años servicio" val={prev.indemAnos} hint={prev.anosIndemnizables ? `${prev.anosIndemnizables} años` : '—'} />
                                        <Row label="Indemnización aviso previo" val={prev.indemAviso} />
                                        {prev.otrosHaberes > 0 && <Row label="Otros haberes" val={prev.otrosHaberes} />}
                                        {prev.descuentos > 0 && <Row label="Descuentos" val={-prev.descuentos} color="text-red-400" />}
                                        <div className="flex justify-between text-lg font-black text-white bg-fuchsia-500/10 rounded-lg px-3 py-2 border border-fuchsia-500/20 mt-2">
                                            <span>TOTAL FINIQUITO</span><span className="text-fuchsia-300">{clp(prev.total)}</span>
                                        </div>
                                    </div>
                                )}
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose} className="border-white/20 text-white hover:bg-white/10">Cancelar</Button>
                    <Button onClick={() => guardar.mutate()} disabled={!prev || guardar.isPending} className="bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white">
                        {guardar.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Calculator className="h-4 w-4 mr-2" />}Guardar finiquito
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

const Row = ({ label, val, hint, color = 'text-gray-100' }) => (
    <div className="flex justify-between"><span className="text-gray-400">{label}{hint && <span className="text-gray-600 text-xs ml-1">({hint})</span>}</span><span className={color}>{clp(val)}</span></div>
);

// ── Modal: detalle + impresión ──────────────────────────────────────────────
const DetalleModal = ({ id, onClose }) => {
    const { user } = useAuth();
    const { data: f, isLoading } = useQuery({ queryKey: ['finiquito', id], queryFn: async () => { const r = await getFiniquitoApi(user?.sessionId, id); return r.ok ? r.json() : null; }, enabled: !!id });

    const imprimir = () => {
        if (!f) return;
        const row = (l, v) => `<tr><td>${l}</td><td style="text-align:right">${clp(v)}</td></tr>`;
        const html = `<!doctype html><html><head><meta charset="utf-8"><title>Finiquito ${f.empleado}</title>
        <style>body{font-family:Arial,sans-serif;color:#111;max-width:640px;margin:24px auto;padding:0 16px;font-size:13px}h1{font-size:18px;margin:0 0 2px}.sub{color:#555;margin:0 0 16px}table{width:100%;border-collapse:collapse}td{padding:4px 0}.tot{border-top:2px solid #333;font-weight:bold;font-size:15px}</style>
        </head><body>
          <h1>Finiquito de Trabajo</h1>
          <p class="sub">${f.empleado} — ${f.rut} · ${f.empresa || ''}<br/>Ingreso: ${String(f.fechaIngreso||'').slice(0,10)} · Término: ${String(f.fechaTermino||'').slice(0,10)} · ${f.causalLabel}</p>
          <table>
            ${row('Vacaciones proporcionales (' + f.diasVacPendientes + ' días)', f.vacProporcional)}
            ${row('Indemnización por años de servicio', f.indemAnos)}
            ${row('Indemnización sustitutiva aviso previo', f.indemAviso)}
            ${f.otrosHaberes ? row('Otros haberes', f.otrosHaberes) : ''}
            ${f.descuentos ? row('Descuentos', -f.descuentos) : ''}
            <tr class="tot"><td>TOTAL A PAGAR</td><td style="text-align:right">${clp(f.total)}</td></tr>
          </table>
          <p style="margin-top:40px;color:#666;font-size:11px">Documento base referencial — sujeto a validación legal.</p>
        </body></html>`;
        const w = window.open('', '_blank', 'width=760,height=900');
        if (!w) return toast({ title: 'Permite ventanas emergentes para imprimir', variant: 'destructive' });
        w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
    };

    return (
        <Dialog open onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="sm:max-w-lg bg-black/60 backdrop-blur-xl border-white/20 text-white">
                <DialogHeader><DialogTitle>Finiquito</DialogTitle></DialogHeader>
                {isLoading || !f ? <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-fuchsia-500" /></div> : (
                    <div className="space-y-3 py-2 text-sm">
                        <div className="text-center border-b border-white/10 pb-3">
                            <p className="text-lg font-bold text-white">{f.empleado}</p>
                            <p className="text-gray-400">{f.rut} · {f.empresa}</p>
                            <p className="text-[11px] text-gray-500 mt-1">Término {String(f.fechaTermino || '').slice(0, 10)} · {f.causalLabel}</p>
                        </div>
                        <Row label="Vacaciones proporcionales" val={f.vacProporcional} hint={`${f.diasVacPendientes} días`} />
                        <Row label="Indemnización años servicio" val={f.indemAnos} />
                        <Row label="Indemnización aviso previo" val={f.indemAviso} />
                        {f.otrosHaberes > 0 && <Row label="Otros haberes" val={f.otrosHaberes} />}
                        {f.descuentos > 0 && <Row label="Descuentos" val={-f.descuentos} color="text-red-400" />}
                        <div className="flex justify-between text-lg font-black bg-fuchsia-500/10 rounded-lg px-4 py-3 border border-fuchsia-500/20">
                            <span>TOTAL</span><span className="text-fuchsia-300">{clp(f.total)}</span>
                        </div>
                    </div>
                )}
                <DialogFooter>
                    <Button variant="outline" onClick={imprimir} disabled={!f} className="border-white/20 text-white hover:bg-white/10"><Printer className="h-4 w-4 mr-2" />Imprimir / PDF</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

const FiniquitosRrhh = ({ empresaId }) => {
    const { user } = useAuth();
    const consolidado = !empresaId;
    const [nuevo, setNuevo] = useState(false);
    const [detalle, setDetalle] = useState(null);

    const { data: filas = [], isLoading } = useQuery({
        queryKey: ['finiquitos', empresaId],
        queryFn: async () => { const r = await listFiniquitosApi(user?.sessionId, empresaId); return r.ok ? r.json() : []; },
        enabled: !!user?.sessionId,
    });

    return (
        <div className="space-y-5">
            <div className="flex justify-end">
                <Button onClick={() => setNuevo(true)} className="bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-semibold h-10 shadow-lg shadow-fuchsia-900/20"><Plus className="h-4 w-4 mr-2" />Nuevo finiquito</Button>
            </div>

            {isLoading ? <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-fuchsia-500" /></div> : (
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-white/10 bg-white/[0.03]">
                                    <th className="px-5 py-3.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">Trabajador</th>
                                    {consolidado && <th className="px-5 py-3.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">Empresa</th>}
                                    <th className="px-5 py-3.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">Causal</th>
                                    <th className="px-5 py-3.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">Término</th>
                                    <th className="px-5 py-3.5 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-500">Total</th>
                                    <th className="px-5 py-3.5 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-500">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.06]">
                                {filas.length ? filas.map((f, i) => (
                                    <motion.tr key={f.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25, delay: i * 0.03 }} className="hover:bg-white/[0.03]">
                                        <td className="px-5 py-3.5 text-sm text-white">{f.empleado}<div className="text-[10px] text-gray-500">{f.cargo}</div></td>
                                        {consolidado && <td className="px-5 py-3.5 text-sm text-gray-400 truncate max-w-[180px]">{f.empresa || '—'}</td>}
                                        <td className="px-5 py-3.5 text-xs text-gray-400 max-w-[240px]">{f.causalLabel}</td>
                                        <td className="px-5 py-3.5 text-sm text-gray-400 font-mono text-xs">{String(f.fechaTermino || '').slice(0, 10)}</td>
                                        <td className="px-5 py-3.5 text-right text-sm text-fuchsia-300 font-bold">{clp(f.total)}</td>
                                        <td className="px-5 py-3.5 text-right"><Button variant="ghost" size="sm" onClick={() => setDetalle(f.id)} className="h-8 w-8 p-0 text-blue-400 hover:bg-blue-500/10"><Eye className="h-4 w-4" /></Button></td>
                                    </motion.tr>
                                )) : (
                                    <tr><td colSpan={consolidado ? 6 : 5} className="text-center py-16">
                                        <div className="flex flex-col items-center text-gray-500">
                                            <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center mb-4"><FileWarning className="h-6 w-6 opacity-40" /></div>
                                            <h3 className="text-base font-semibold text-white">Sin finiquitos</h3>
                                            <p className="text-sm mt-1">Crea uno con "Nuevo finiquito".</p>
                                        </div>
                                    </td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {nuevo && <NuevoFiniquitoModal empresaId={empresaId} onClose={() => setNuevo(false)} />}
            {detalle && <DetalleModal id={detalle} onClose={() => setDetalle(null)} />}
        </div>
    );
};

export default FiniquitosRrhh;
