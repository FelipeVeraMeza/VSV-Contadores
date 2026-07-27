import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { Loader2, CheckCircle2, AlertTriangle, RotateCcw, BookCopy, FileWarning, Building2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { previewCentralizacionApi, centralizarApi, reversarCentralizacionApi } from '@/services/rrhhService';
import EmpresaPicker from '@/components/rrhh/EmpresaPicker';

const clp = (v) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(Number(v) || 0);
const mesActual = () => new Date().toISOString().slice(0, 7);

const CentralizacionRrhh = ({ empresaId }) => {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const sid = user?.sessionId;
    const [periodo, setPeriodo] = useState(mesActual());

    const { data, isLoading } = useQuery({
        queryKey: ['centralizacion-preview', empresaId, periodo],
        queryFn: async () => { const r = await previewCentralizacionApi(sid, empresaId, periodo); return r.ok ? r.json() : null; },
        enabled: Boolean(empresaId) && !!sid,
    });

    const refrescar = () => queryClient.invalidateQueries({ queryKey: ['centralizacion-preview', empresaId] });

    const centralizar = useMutation({
        mutationFn: async () => { const r = await centralizarApi(sid, { empresaId, periodo }); const d = await r.json(); if (!r.ok) throw new Error(d?.message); return d; },
        onSuccess: (d) => { toast({ title: 'Período centralizado', description: `Comprobante N° ${d.numero} generado.` }); refrescar(); },
        onError: (e) => toast({ title: 'No se pudo centralizar', description: e.message, variant: 'destructive' }),
    });
    const reversar = useMutation({
        mutationFn: async () => { const r = await reversarCentralizacionApi(sid, { empresaId, periodo }); const d = await r.json(); if (!r.ok) throw new Error(d?.message); return d; },
        onSuccess: () => { toast({ title: 'Centralización reversada', description: 'El comprobante fue eliminado.' }); refrescar(); },
        onError: (e) => toast({ title: 'No se pudo reversar', description: e.message, variant: 'destructive' }),
    });

    const ya = data?.yaCentralizado;
    const lineas = data?.lineas || [];
    const puedeCentralizar = data && data.cantidad > 0 && data.cuadra && data.faltantes.length === 0 && !ya;

    return (
        <div className="space-y-5">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                    <EmpresaPicker />
                    <Input type="month" value={periodo} onChange={e => setPeriodo(e.target.value)} className="w-44 bg-slate-50 border-[#efe8dd]" />
                </div>
                {empresaId && (ya ? (
                    <Button onClick={() => { if (window.confirm('¿Reversar la centralización? Se eliminará el comprobante contable.')) reversar.mutate(); }} disabled={reversar.isPending} variant="outline" className="border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10 h-10">
                        {reversar.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}Reversar
                    </Button>
                ) : (
                    <Button onClick={() => centralizar.mutate()} disabled={!puedeCentralizar || centralizar.isPending} className="bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 text-slate-900 font-semibold h-10 shadow-lg shadow-indigo-900/20">
                        {centralizar.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <BookCopy className="h-4 w-4 mr-2" />}Centralizar período
                    </Button>
                ))}
            </div>

            {!empresaId ? (
                <div className="flex flex-col items-center text-slate-400 py-20">
                    <div className="w-14 h-14 rounded-2xl bg-white border border-[#efe8dd] flex items-center justify-center mb-4"><Building2 className="h-6 w-6 text-purple-600/60" /></div>
                    <h3 className="text-base font-semibold text-slate-900">Elige una empresa</h3>
                    <p className="text-sm mt-1">Selecciona una empresa arriba para ver y generar su asiento de centralización.</p>
                </div>
            ) : isLoading ? (
                <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-indigo-500" /></div>
            ) : !data || data.cantidad === 0 ? (
                <div className="flex flex-col items-center text-slate-400 py-20">
                    <div className="w-14 h-14 rounded-2xl bg-white border border-[#efe8dd] flex items-center justify-center mb-4"><FileWarning className="h-6 w-6 opacity-40" /></div>
                    <h3 className="text-base font-semibold text-slate-900">Sin liquidaciones aprobadas en {periodo}</h3>
                    <p className="text-sm mt-1">Aprueba liquidaciones del período para poder centralizar.</p>
                </div>
            ) : (
                <>
                    {/* Estado */}
                    {ya ? (
                        <div className="flex items-center gap-3 p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-300">
                            <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
                            <span className="text-sm"><b>Período centralizado</b> · Comprobante N° {ya.numero} · {clp(ya.totalDebe)}</span>
                        </div>
                    ) : data.faltantes.length > 0 ? (
                        <div className="flex items-start gap-3 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-300">
                            <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                            <span className="text-sm">Faltan cuentas contables por configurar: <b>{data.faltantes.join(', ')}</b>. Configúralas en <b>Configuración → Cuentas contables</b>.</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-3 p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300">
                            <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
                            <span className="text-sm">Asiento listo para <b>{data.cantidad}</b> liquidación(es). Revisa el detalle y presiona <b>Centralizar</b>.</span>
                        </div>
                    )}

                    {/* Asiento */}
                    <div className="rounded-2xl border border-[#efe8dd] bg-white overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-[#efe8dd] bg-white">
                                        <th className="px-5 py-3.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">Cuenta</th>
                                        <th className="px-5 py-3.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">Descripción</th>
                                        <th className="px-5 py-3.5 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-400">Debe</th>
                                        <th className="px-5 py-3.5 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-400">Haber</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/[0.06]">
                                    {lineas.map((l, i) => (
                                        <tr key={i} className="hover:bg-white">
                                            <td className="px-5 py-3 font-mono text-xs text-slate-500">{l.cuenta || <span className="text-red-500">sin cuenta</span>}</td>
                                            <td className="px-5 py-3 text-slate-700">{l.descripcion}</td>
                                            <td className="px-5 py-3 text-right text-slate-600">{l.debe ? clp(l.debe) : '—'}</td>
                                            <td className="px-5 py-3 text-right text-slate-600">{l.haber ? clp(l.haber) : '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="bg-slate-50 font-bold text-slate-900">
                                    <tr>
                                        <td className="px-5 py-3.5" colSpan="2">
                                            <span className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full ${data.cuadra ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-500'}`}>
                                                {data.cuadra ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}{data.cuadra ? 'Cuadrado' : 'Descuadrado'}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3.5 text-right">{clp(data.totalDebe)}</td>
                                        <td className="px-5 py-3.5 text-right">{clp(data.totalHaber)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default CentralizacionRrhh;
