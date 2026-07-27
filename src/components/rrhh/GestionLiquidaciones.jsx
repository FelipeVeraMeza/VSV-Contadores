import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Download, Plus, Eye, FileWarning, Loader2, CheckCircle2, Trash2, Send, Layers, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    getLiquidacionesRealApi, cambiarEstadoLiquidacionApi, deleteLiquidacionApi,
    getPayslipApi, enviarLiquidacionApi, generarMasivoApi,
} from '@/services/rrhhService';
import LiquidacionDetalleModal from '@/components/rrhh/modals/LiquidacionDetalleModal';

const clp = (v) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(Number(v) || 0);
const mesActual = () => new Date().toISOString().slice(0, 7);
const periodoTexto = (v) => { const d = String(v).slice(0, 7).split('-'); const M = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']; return d.length === 2 ? `${M[Number(d[1]) - 1]} ${d[0]}` : String(v); };

const ESTADOS = {
    borrador: { label: 'Borrador', pill: 'bg-gray-500/15 text-slate-600', dot: 'bg-gray-400' },
    revisada: { label: 'Revisada', pill: 'bg-blue-500/15 text-blue-600', dot: 'bg-blue-400' },
    aprobada: { label: 'Aprobada', pill: 'bg-green-500/15 text-green-400', dot: 'bg-green-400' },
    pagada: { label: 'Pagada', pill: 'bg-emerald-500/15 text-emerald-600', dot: 'bg-emerald-400' },
    anulada: { label: 'Anulada', pill: 'bg-red-500/15 text-red-500', dot: 'bg-red-400' },
};
const iniciales = (n = '') => n.trim().split(/\s+/).slice(0, 2).map(p => p[0] || '').join('').toUpperCase() || '—';

// Extrae <style> y el interior de <body> del payslip para poder combinar varios
// en una sola ventana de impresión.
const stripDoc = (html) => ({
    style: (html.match(/<style>([\s\S]*?)<\/style>/) || [, ''])[1],
    body: (html.match(/<body>([\s\S]*?)<\/body>/) || [, html])[1],
});

const GestionLiquidaciones = ({ empresaId, onAddLiquidation }) => {
    const { user, logout } = useAuth();
    const queryClient = useQueryClient();
    const sid = user?.sessionId;
    const [periodo, setPeriodo] = useState(mesActual());
    const [detalleId, setDetalleId] = useState(null);
    const [sel, setSel] = useState(() => new Set());
    const [accion, setAccion] = useState(false);   // descarga/envío en curso
    const consolidado = !empresaId;

    const { data: liquidaciones = [], isLoading } = useQuery({
        queryKey: ['liquidaciones', empresaId, periodo],
        queryFn: async () => {
            const r = await getLiquidacionesRealApi(sid, empresaId, periodo);
            if (r.status === 401) { logout(); throw new Error('Sesión expirada'); }
            if (!r.ok) throw new Error('Error al obtener liquidaciones');
            return r.json();
        },
        enabled: !!sid,   // consolidado (toda la organización) o por empresa
    });

    const invalidar = () => { queryClient.invalidateQueries({ queryKey: ['liquidaciones'] }); setSel(new Set()); };
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
    const masivo = useMutation({
        mutationFn: async () => {
            const r = await generarMasivoApi(sid, { empresaId, periodo });
            const d = await r.json(); if (!r.ok) throw new Error(d?.message); return d;
        },
        onSuccess: (d) => {
            const extra = d.omitidas ? ` · ${d.omitidas} omitida(s) (aprobadas/pagadas)` : '';
            const err = d.errores?.length ? ` · ${d.errores.length} con error` : '';
            toast({ title: 'Generación masiva lista', description: `${d.generadas} liquidación(es) generada(s)${extra}${err}.` });
            invalidar();
        },
        onError: (e) => toast({ title: 'No se pudo generar', description: e.message, variant: 'destructive' }),
    });

    const totalLiquido = liquidaciones.reduce((s, l) => s + (Number(l.liquido) || 0), 0);
    const seleccionadas = useMemo(() => liquidaciones.filter(l => sel.has(l.id)), [liquidaciones, sel]);

    const toggle = (id) => setSel(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const toggleTodas = () => setSel(prev => prev.size === liquidaciones.length ? new Set() : new Set(liquidaciones.map(l => l.id)));

    // Descarga: abre una ventana, arma el/los payslip(s) y manda a imprimir (→ PDF).
    const descargar = async (ids) => {
        if (!ids.length) return;
        const w = window.open('', '_blank');
        if (!w) { toast({ title: 'Permite las ventanas emergentes', description: 'El navegador bloqueó la ventana de impresión.', variant: 'destructive' }); return; }
        w.document.write('<p style="font-family:Arial;padding:24px;color:#475569">Generando liquidación…</p>');
        setAccion(true);
        try {
            const htmls = [];
            for (const id of ids) {
                const r = await getPayslipApi(sid, id);
                if (r.ok) { const d = await r.json(); htmls.push(d.html); }
            }
            if (!htmls.length) { w.close(); toast({ title: 'No se pudo generar', variant: 'destructive' }); return; }
            const style = stripDoc(htmls[0]).style;
            const bodies = htmls.map(h => stripDoc(h).body).join('<div style="page-break-after:always"></div>');
            w.document.open();
            w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Liquidaciones</title><style>${style}</style></head><body>${bodies}</body></html>`);
            w.document.close(); w.focus();
            setTimeout(() => w.print(), 350);
        } catch {
            w.close(); toast({ title: 'Error al generar la descarga', variant: 'destructive' });
        } finally { setAccion(false); }
    };

    // Envío por correo (uno o varios).
    const enviar = async (ids) => {
        if (!ids.length) return;
        if (!window.confirm(`¿Enviar ${ids.length} liquidación(es) por correo al trabajador?`)) return;
        setAccion(true);
        let ok = 0; const fallos = [];
        try {
            for (const id of ids) {
                const r = await enviarLiquidacionApi(sid, id);
                const d = await r.json().catch(() => ({}));
                if (r.ok) ok++; else fallos.push(d?.message || 'error');
            }
            if (ok) toast({ title: `${ok} enviada(s)`, description: fallos.length ? `${fallos.length} sin enviar: ${fallos[0]}` : 'Correo enviado al trabajador.' });
            else toast({ title: 'No se pudo enviar', description: fallos[0] || 'Revisa el correo de los trabajadores.', variant: 'destructive' });
            setSel(new Set());
        } finally { setAccion(false); }
    };

    return (
        <div className="space-y-5">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3">
                    <Input type="month" value={periodo} onChange={e => setPeriodo(e.target.value)} className="w-44 bg-slate-50 border-[#efe8dd]" />
                    <span className="text-xs text-slate-400">
                        <b className="text-slate-600">{periodoTexto(periodo)}</b>
                        {liquidaciones.length > 0 && <> · {liquidaciones.length} liquidación(es) · <span className="text-green-400 font-semibold">{clp(totalLiquido)}</span></>}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => masivo.mutate()} disabled={masivo.isPending} className="border-[#efe8dd] bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 h-10" title="Generar la liquidación de todos los trabajadores activos del período">
                        {masivo.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Layers className="h-4 w-4 mr-2" />}Generar masivo
                    </Button>
                    {onAddLiquidation && <Button onClick={onAddLiquidation} className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-slate-900 font-semibold h-10 shadow-lg shadow-green-900/20"><Plus className="h-4 w-4 mr-2" />Nueva Liquidación</Button>}
                </div>
            </div>

            {/* Barra de selección múltiple */}
            {seleccionadas.length > 0 && (
                <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-purple-500/10 border border-purple-500/20">
                    <span className="text-sm text-purple-200 font-medium">{seleccionadas.length} seleccionada(s)</span>
                    <div className="flex items-center gap-2 ml-auto">
                        <Button size="sm" variant="outline" disabled={accion} onClick={() => descargar(seleccionadas.map(l => l.id))} className="border-[#efe8dd] bg-slate-50 text-slate-700 hover:bg-slate-100 h-9"><Printer className="h-4 w-4 mr-2" />Descargar</Button>
                        <Button size="sm" disabled={accion} onClick={() => enviar(seleccionadas.map(l => l.id))} className="bg-gradient-to-r from-emerald-500 to-green-600 text-white h-9"><Send className="h-4 w-4 mr-2" />Enviar</Button>
                        <button onClick={() => setSel(new Set())} className="text-xs text-purple-700 hover:text-slate-900 px-2">Limpiar</button>
                    </div>
                </div>
            )}

            {isLoading ? (
                <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-green-500" /></div>
            ) : (
                <div className="rounded-2xl border border-[#efe8dd] bg-white overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-[#efe8dd] bg-white">
                                    <th className="pl-5 pr-2 py-3.5 w-10">
                                        <input type="checkbox" checked={liquidaciones.length > 0 && sel.size === liquidaciones.length} onChange={toggleTodas} className="h-4 w-4 rounded border-[#efe8dd] bg-slate-50 accent-purple-500" />
                                    </th>
                                    <th className="px-5 py-3.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">Empleado</th>
                                    <th className="px-5 py-3.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">Cargo</th>
                                    {consolidado && <th className="px-5 py-3.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">Empresa</th>}
                                    <th className="px-5 py-3.5 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-400">Líquido</th>
                                    <th className="px-5 py-3.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">Estado</th>
                                    <th className="px-5 py-3.5 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-400">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.06]">
                                {liquidaciones.length > 0 ? (
                                    liquidaciones.map((l, index) => {
                                        const est = ESTADOS[l.estado] || ESTADOS.borrador;
                                        const checked = sel.has(l.id);
                                        return (
                                            <motion.tr key={l.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25, delay: index * 0.03 }} className={`group transition-colors ${checked ? 'bg-purple-500/[0.06]' : 'hover:bg-white'}`}>
                                                <td className="pl-5 pr-2 py-3.5">
                                                    <input type="checkbox" checked={checked} onChange={() => toggle(l.id)} className="h-4 w-4 rounded border-[#efe8dd] bg-slate-50 accent-purple-500" />
                                                </td>
                                                <td className="px-5 py-3.5">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center text-[11px] font-bold text-slate-900 flex-shrink-0">{iniciales(l.empleado)}</div>
                                                        <span className="text-sm text-slate-900 font-medium">{l.empleado}</span>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-3.5 text-sm text-slate-500">{l.cargo}</td>
                                                {consolidado && <td className="px-5 py-3.5 text-sm text-slate-500 truncate max-w-[200px]">{l.empresa || '—'}</td>}
                                                <td className="px-5 py-3.5 text-right text-sm text-green-400 font-bold">{clp(l.liquido)}</td>
                                                <td className="px-5 py-3.5">
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-semibold rounded-full ${est.pill}`}><span className={`w-1.5 h-1.5 rounded-full ${est.dot}`} />{est.label}</span>
                                                </td>
                                                <td className="px-5 py-3.5">
                                                    <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                                                        <Button variant="ghost" size="sm" onClick={() => setDetalleId(l.id)} className="h-8 w-8 p-0 text-slate-500 hover:text-blue-600 hover:bg-blue-500/10" title="Ver detalle"><Eye className="h-4 w-4" /></Button>
                                                        <Button variant="ghost" size="sm" disabled={accion} onClick={() => descargar([l.id])} className="h-8 w-8 p-0 text-slate-500 hover:text-slate-900 hover:bg-slate-100" title="Descargar / imprimir"><Download className="h-4 w-4" /></Button>
                                                        <Button variant="ghost" size="sm" disabled={accion} onClick={() => enviar([l.id])} className="h-8 w-8 p-0 text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10" title="Enviar al trabajador"><Send className="h-4 w-4" /></Button>
                                                        {['borrador', 'revisada'].includes(l.estado) && <Button variant="ghost" size="sm" onClick={() => aprobar.mutate(l.id)} disabled={aprobar.isPending} className="h-8 w-8 p-0 text-slate-500 hover:text-green-400 hover:bg-green-500/10" title="Aprobar"><CheckCircle2 className="h-4 w-4" /></Button>}
                                                        {!['aprobada', 'pagada'].includes(l.estado) && <Button variant="ghost" size="sm" onClick={() => { if (window.confirm(`¿Eliminar la liquidación de ${l.empleado}?`)) eliminar.mutate(l.id); }} disabled={eliminar.isPending} className="h-8 w-8 p-0 text-slate-500 hover:text-red-500 hover:bg-red-500/10" title="Eliminar"><Trash2 className="h-4 w-4" /></Button>}
                                                    </div>
                                                </td>
                                            </motion.tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan={consolidado ? 7 : 6} className="text-center py-16">
                                            <div className="flex flex-col items-center text-slate-400">
                                                <div className="w-14 h-14 rounded-2xl bg-white border border-[#efe8dd] flex items-center justify-center mb-4"><FileWarning className="h-6 w-6 opacity-40" /></div>
                                                <h3 className="text-base font-semibold text-slate-900">Sin liquidaciones en {periodoTexto(periodo)}</h3>
                                                <p className="text-sm mt-1">Usa "Nueva Liquidación" o "Generar masivo" para crear las del período.</p>
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
