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
import { numeroALetras } from '@/lib/numeroALetras';

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
            <DialogContent className="sm:max-w-3xl bg-slate-50 backdrop-blur-xl border-[#efe8dd] text-slate-700 max-h-[90vh] overflow-y-auto">
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
                                <label className={`flex items-center gap-2 text-sm cursor-pointer rounded-lg border px-3 h-10 w-full transition ${form.dioAviso ? 'border-purple-500/40 bg-purple-500/10 text-white' : 'border-[#efe8dd] bg-white text-slate-600'}`}>
                                    <input type="checkbox" checked={form.dioAviso} onChange={e => set('dioAviso', e.target.checked)} className="h-4 w-4 accent-purple-500 [color-scheme:light]" />
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

                    <div className="bg-slate-50 rounded-xl border border-[#efe8dd] p-4">
                        {calc ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-fuchsia-500" /></div>
                            : !prev ? <div className="h-full flex items-center justify-center text-slate-400 text-sm text-center py-12">Completa trabajador, fecha y causal para ver el cálculo.</div>
                                : (
                                    <div className="space-y-2 text-sm">
                                        <div className="text-center border-b border-[#efe8dd] pb-2">
                                            <p className="font-bold text-slate-900">{prev.trabajador?.nombre}</p>
                                            <p className="text-[11px] text-slate-500">{prev.anosServicio} años {prev.restoMeses} meses · {prev.causalLabel}</p>
                                        </div>
                                        <Row label="Vacaciones proporcionales" val={prev.vacProporcional} hint={`${prev.diasVacPendientes} días`} />
                                        <Row label="Indemnización años servicio" val={prev.indemAnos} hint={prev.anosIndemnizables ? `${prev.anosIndemnizables} años` : '—'} />
                                        <Row label="Indemnización aviso previo" val={prev.indemAviso} />
                                        {prev.otrosHaberes > 0 && <Row label="Otros haberes" val={prev.otrosHaberes} />}
                                        {prev.descuentos > 0 && <Row label="Descuentos" val={-prev.descuentos} color="text-red-500" />}
                                        <div className="flex justify-between text-lg font-black text-slate-900 bg-fuchsia-500/10 rounded-lg px-3 py-2 border border-fuchsia-500/20 mt-2">
                                            <span>TOTAL FINIQUITO</span><span className="text-fuchsia-300">{clp(prev.total)}</span>
                                        </div>
                                    </div>
                                )}
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose} className="border-[#efe8dd] text-slate-700 hover:bg-slate-100">Cancelar</Button>
                    <Button onClick={() => guardar.mutate()} disabled={!prev || guardar.isPending} className="bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white">
                        {guardar.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Calculator className="h-4 w-4 mr-2" />}Guardar finiquito
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

const Row = ({ label, val, hint, color = 'text-slate-700' }) => (
    <div className="flex justify-between"><span className="text-slate-500">{label}{hint && <span className="text-slate-400 text-xs ml-1">({hint})</span>}</span><span className={color}>{clp(val)}</span></div>
);

// ── Modal: detalle + impresión ──────────────────────────────────────────────
const DetalleModal = ({ id, onClose }) => {
    const { user } = useAuth();
    const { data: f, isLoading } = useQuery({ queryKey: ['finiquito', id], queryFn: async () => { const r = await getFiniquitoApi(user?.sessionId, id); return r.ok ? r.json() : null; }, enabled: !!id });

    const imprimir = () => {
        if (!f) return;
        const nf = (v) => new Intl.NumberFormat('es-CL').format(Math.round(Number(v) || 0));
        const fch = (d) => String(d || '').slice(0, 10).split('-').reverse().join('/');
        const row = (l, v) => `<tr><td>${l}</td><td class="n">${nf(v)}</td></tr>`;
        const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Finiquito ${f.empleado}</title>
        <style>
          @page{size:A4;margin:16mm}
          *{box-sizing:border-box} body{font-family:'Times New Roman',Georgia,serif;color:#111;max-width:720px;margin:0 auto;padding:24px;font-size:13px;line-height:1.7}
          h1{text-align:center;font-size:16px;text-transform:uppercase;letter-spacing:1px;margin:0 0 20px}
          p{text-align:justify;margin:12px 0}
          table{width:100%;border-collapse:collapse;margin:16px 0;font-size:13px}
          th,td{border:1px solid #999;padding:5px 10px} th{background:#f0f0f0;text-align:left}
          td.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
          .tot td{font-weight:bold;border-top:2px solid #333}
          .son{font-weight:bold;margin:14px 0}
          .firmas{display:flex;justify-content:space-between;gap:60px;margin-top:70px;text-align:center}
          .firmas div{flex:1;border-top:1px solid #000;padding-top:5px;font-size:12px}
          .pie{margin-top:28px;font-size:11px;color:#666;text-align:center}
        </style></head><body>
          <h1>Finiquito de Contrato de Trabajo</h1>
          <p>En Chile, con fecha <b>${fch(f.fechaTermino)}</b>, entre <b>${f.empresa || ''}</b>, en adelante
          "el empleador", y don(ña) <b>${f.empleado}</b>, cédula de identidad N° <b>${f.rut}</b>, en adelante
          "el trabajador", se deja constancia del <b>término de la relación laboral</b> que los vinculaba
          (ingreso el ${fch(f.fechaIngreso)}), por la causal legal: <b>${f.causalLabel}</b>.</p>
          <p>El empleador paga al trabajador las siguientes sumas por los conceptos que se indican:</p>
          <table>
            <thead><tr><th>Concepto</th><th class="n">Monto</th></tr></thead>
            <tbody>
              ${row('Vacaciones proporcionales (' + f.diasVacPendientes + ' días)', f.vacProporcional)}
              ${f.indemAnos ? row('Indemnización por años de servicio', f.indemAnos) : ''}
              ${f.indemAviso ? row('Indemnización sustitutiva del aviso previo', f.indemAviso) : ''}
              ${f.otrosHaberes ? row('Otros haberes', f.otrosHaberes) : ''}
              ${f.descuentos ? `<tr><td>Descuentos</td><td class="n">- ${nf(f.descuentos)}</td></tr>` : ''}
              <tr class="tot"><td>TOTAL A PAGAR</td><td class="n">${nf(f.total)}</td></tr>
            </tbody>
          </table>
          <p class="son">SON: ${numeroALetras(f.total)} PESOS.</p>
          <p>El trabajador declara recibir conforme la suma total indicada y, una vez pagada, no tener
          cargo ni cobro alguno que hacer al empleador por concepto de remuneraciones, indemnizaciones,
          feriados u otro derivado de la relación laboral, otorgándole el más amplio y total finiquito.</p>
          <div class="firmas"><div>FIRMA DEL EMPLEADOR</div><div>FIRMA DEL TRABAJADOR</div></div>
          <p class="pie">Documento base referencial — sujeto a validación legal antes de su suscripción.</p>
        </body></html>`;
        const w = window.open('', '_blank', 'width=800,height=1000');
        if (!w) return toast({ title: 'Permite ventanas emergentes para imprimir', variant: 'destructive' });
        w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
    };

    return (
        <Dialog open onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="sm:max-w-lg bg-slate-50 backdrop-blur-xl border-[#efe8dd] text-slate-700">
                <DialogHeader><DialogTitle>Finiquito</DialogTitle></DialogHeader>
                {isLoading || !f ? <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-fuchsia-500" /></div> : (
                    <div className="space-y-3 py-2 text-sm">
                        <div className="text-center border-b border-[#efe8dd] pb-3">
                            <p className="text-lg font-bold text-slate-900">{f.empleado}</p>
                            <p className="text-slate-500">{f.rut} · {f.empresa}</p>
                            <p className="text-[11px] text-slate-400 mt-1">Término {String(f.fechaTermino || '').slice(0, 10)} · {f.causalLabel}</p>
                        </div>
                        <Row label="Vacaciones proporcionales" val={f.vacProporcional} hint={`${f.diasVacPendientes} días`} />
                        <Row label="Indemnización años servicio" val={f.indemAnos} />
                        <Row label="Indemnización aviso previo" val={f.indemAviso} />
                        {f.otrosHaberes > 0 && <Row label="Otros haberes" val={f.otrosHaberes} />}
                        {f.descuentos > 0 && <Row label="Descuentos" val={-f.descuentos} color="text-red-500" />}
                        <div className="flex justify-between text-lg font-black bg-fuchsia-500/10 rounded-lg px-4 py-3 border border-fuchsia-500/20">
                            <span>TOTAL</span><span className="text-fuchsia-300">{clp(f.total)}</span>
                        </div>
                    </div>
                )}
                <DialogFooter>
                    <Button variant="outline" onClick={imprimir} disabled={!f} className="border-[#efe8dd] text-slate-700 hover:bg-slate-100"><Printer className="h-4 w-4 mr-2" />Imprimir / PDF</Button>
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
                <Button onClick={() => setNuevo(true)} className="bg-gradient-to-r from-fuchsia-500 to-purple-600 text-slate-900 font-semibold h-10 shadow-lg shadow-fuchsia-900/20"><Plus className="h-4 w-4 mr-2" />Nuevo finiquito</Button>
            </div>

            {isLoading ? <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-fuchsia-500" /></div> : (
                <div className="rounded-2xl border border-[#efe8dd] bg-white overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-[#efe8dd] bg-white">
                                    <th className="px-5 py-3.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">Trabajador</th>
                                    {consolidado && <th className="px-5 py-3.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">Empresa</th>}
                                    <th className="px-5 py-3.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">Causal</th>
                                    <th className="px-5 py-3.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">Término</th>
                                    <th className="px-5 py-3.5 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-400">Total</th>
                                    <th className="px-5 py-3.5 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-400">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.06]">
                                {filas.length ? filas.map((f, i) => (
                                    <motion.tr key={f.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25, delay: i * 0.03 }} className="hover:bg-white">
                                        <td className="px-5 py-3.5 text-sm text-slate-900">{f.empleado}<div className="text-[10px] text-slate-400">{f.cargo}</div></td>
                                        {consolidado && <td className="px-5 py-3.5 text-sm text-slate-500 truncate max-w-[180px]">{f.empresa || '—'}</td>}
                                        <td className="px-5 py-3.5 text-xs text-slate-500 max-w-[240px]">{f.causalLabel}</td>
                                        <td className="px-5 py-3.5 text-sm text-slate-500 font-mono text-xs">{String(f.fechaTermino || '').slice(0, 10)}</td>
                                        <td className="px-5 py-3.5 text-right text-sm text-fuchsia-300 font-bold">{clp(f.total)}</td>
                                        <td className="px-5 py-3.5 text-right"><Button variant="ghost" size="sm" onClick={() => setDetalle(f.id)} className="h-8 w-8 p-0 text-blue-600 hover:bg-blue-500/10"><Eye className="h-4 w-4" /></Button></td>
                                    </motion.tr>
                                )) : (
                                    <tr><td colSpan={consolidado ? 6 : 5} className="text-center py-16">
                                        <div className="flex flex-col items-center text-slate-400">
                                            <div className="w-14 h-14 rounded-2xl bg-white border border-[#efe8dd] flex items-center justify-center mb-4"><FileWarning className="h-6 w-6 opacity-40" /></div>
                                            <h3 className="text-base font-semibold text-slate-900">Sin finiquitos</h3>
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
