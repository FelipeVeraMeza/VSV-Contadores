import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { Loader2, CheckCircle2, Printer } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getLiquidacionApi, cambiarEstadoLiquidacionApi } from '@/services/rrhhService';

const clp = (v) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(Number(v) || 0);

const ESTILO_ESTADO = {
    borrador: 'bg-gray-500/20 text-slate-600',
    revisada: 'bg-blue-500/20 text-blue-600',
    aprobada: 'bg-green-500/20 text-green-400',
    pagada: 'bg-emerald-500/20 text-emerald-600',
    anulada: 'bg-red-500/20 text-red-500',
};

const LiquidacionDetalleModal = ({ isOpen, setIsOpen, liquidacionId, empresaId }) => {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const sid = user?.sessionId;

    const { data: liq, isLoading } = useQuery({
        queryKey: ['liquidacion', liquidacionId],
        queryFn: async () => { const r = await getLiquidacionApi(sid, liquidacionId); return r.ok ? r.json() : null; },
        enabled: isOpen && !!sid && !!liquidacionId,
    });

    const cambiarEstado = useMutation({
        mutationFn: async (estado) => {
            const r = await cambiarEstadoLiquidacionApi(sid, liquidacionId, estado);
            const data = await r.json();
            if (!r.ok) throw new Error(data?.message || 'Error');
            return data;
        },
        onSuccess: (_, estado) => {
            toast({ title: 'Estado actualizado', description: `Liquidación ${estado}.` });
            queryClient.invalidateQueries({ queryKey: ['liquidacion', liquidacionId] });
            queryClient.invalidateQueries({ queryKey: ['liquidaciones', empresaId] });
        },
        onError: (e) => toast({ title: 'No se pudo cambiar el estado', description: e.message, variant: 'destructive' }),
    });

    const haberes = liq?.detalles?.filter(d => d.naturaleza === 'HABER') || [];
    const descuentos = liq?.detalles?.filter(d => d.naturaleza === 'DESCUENTO') || [];
    const aportes = liq?.detalles?.filter(d => d.naturaleza === 'APORTE') || [];

    const imprimirPDF = () => {
        if (!liq) return;
        const fila = (d) => `<tr><td>${d.codigo ? d.codigo + ' · ' : ''}${d.descripcion}</td><td style="text-align:right">${clp(d.monto)}</td></tr>`;
        const periodoTxt = new Date(liq.periodo).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
        const html = `<!doctype html><html><head><meta charset="utf-8"><title>Liquidación ${liq.empleado} ${periodoTxt}</title>
        <style>
          body{font-family:Arial,Helvetica,sans-serif;color:#111;max-width:720px;margin:24px auto;padding:0 16px;font-size:13px}
          h1{font-size:18px;margin:0 0 2px} .sub{color:#555;margin:0 0 16px}
          .cols{display:flex;gap:24px} .col{flex:1}
          h3{font-size:12px;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #ddd;padding-bottom:4px}
          table{width:100%;border-collapse:collapse} td{padding:3px 0}
          .tot{border-top:1px solid #ddd;font-weight:bold}
          .liquido{margin-top:16px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:12px 16px;display:flex;justify-content:space-between;font-size:16px;font-weight:bold}
          .meta{font-size:11px;color:#666;margin-top:16px}
        </style></head><body>
          <h1>Liquidación de Sueldo</h1>
          <p class="sub">${liq.empleado} — ${liq.cargo || ''} · Período ${periodoTxt} · ${liq.totales.dias_trabajados} días · <b>${liq.estado.toUpperCase()}</b></p>
          <div class="cols">
            <div class="col"><h3>Haberes</h3><table>${haberes.map(fila).join('')}<tr class="tot"><td>Total haberes</td><td style="text-align:right">${clp(liq.totales.total_haberes)}</td></tr></table></div>
            <div class="col"><h3>Descuentos</h3><table>${descuentos.map(fila).join('')}<tr class="tot"><td>Total descuentos</td><td style="text-align:right">-${clp(liq.totales.total_descuentos)}</td></tr></table></div>
          </div>
          <div class="liquido"><span>LÍQUIDO A PAGAR</span><span>${clp(liq.totales.liquido_pagar)}</span></div>
          <p class="meta">Imponible: ${clp(liq.totales.total_imponible)} · No imponible: ${clp(liq.totales.total_no_imponible)} · Base tributable: ${clp(liq.totales.base_tributable)} · Aportes empleador: ${clp(liq.totales.aportes_patronales)}</p>
        </body></html>`;
        const w = window.open('', '_blank', 'width=800,height=900');
        if (!w) { toast({ title: 'Permite las ventanas emergentes para imprimir', variant: 'destructive' }); return; }
        w.document.write(html);
        w.document.close();
        w.focus();
        setTimeout(() => w.print(), 300);
    };

    const siguienteAccion = () => {
        if (!liq) return null;
        if (liq.estado === 'borrador') return { estado: 'aprobada', label: 'Aprobar' };
        if (liq.estado === 'revisada') return { estado: 'aprobada', label: 'Aprobar' };
        if (liq.estado === 'aprobada') return { estado: 'pagada', label: 'Marcar Pagada' };
        return null;
    };
    const accion = siguienteAccion();

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="sm:max-w-2xl bg-slate-50 backdrop-blur-xl border-[#efe8dd] text-slate-700 max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-xl flex items-center justify-between">
                        <span>Liquidación de Sueldo</span>
                        {liq && <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full ${ESTILO_ESTADO[liq.estado] || ''}`}>{liq.estado}</span>}
                    </DialogTitle>
                </DialogHeader>

                {isLoading || !liq ? (
                    <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-green-500" /></div>
                ) : (
                    <div className="space-y-4 py-2 text-sm" id="liq-print">
                        <div className="text-center border-b border-[#efe8dd] pb-3">
                            <p className="text-lg font-bold text-slate-900">{liq.empleado}</p>
                            <p className="text-slate-500">{liq.cargo || '—'}</p>
                            <p className="text-[11px] uppercase tracking-widest text-slate-400 mt-1">
                                Período {new Date(liq.periodo).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })} · {liq.totales.dias_trabajados} días
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <h5 className="text-[10px] font-black uppercase tracking-widest text-green-400 mb-1">Haberes</h5>
                                {haberes.map((d, i) => (
                                    <div key={i} className="flex justify-between py-0.5"><span className="text-slate-600">{d.codigo ? `${d.codigo} · ` : ''}{d.descripcion}</span><span className="text-slate-700">{clp(d.monto)}</span></div>
                                ))}
                                <div className="flex justify-between border-t border-[#efe8dd] mt-1 pt-1 font-semibold"><span>Total haberes</span><span>{clp(liq.totales.total_haberes)}</span></div>
                            </div>
                            <div>
                                <h5 className="text-[10px] font-black uppercase tracking-widest text-red-500 mb-1">Descuentos</h5>
                                {descuentos.map((d, i) => (
                                    <div key={i} className="flex justify-between py-0.5"><span className="text-slate-600">{d.codigo ? `${d.codigo} · ` : ''}{d.descripcion}</span><span className="text-red-500">-{clp(d.monto)}</span></div>
                                ))}
                                <div className="flex justify-between border-t border-[#efe8dd] mt-1 pt-1 font-semibold"><span>Total descuentos</span><span className="text-red-500">-{clp(liq.totales.total_descuentos)}</span></div>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-xs text-slate-500 border-t border-[#efe8dd] pt-2">
                            <span>Imponible: <span className="text-slate-700">{clp(liq.totales.total_imponible)}</span></span>
                            <span>No imponible: <span className="text-slate-700">{clp(liq.totales.total_no_imponible)}</span></span>
                            <span>Base tributable: <span className="text-slate-700">{clp(liq.totales.base_tributable)}</span></span>
                        </div>

                        <div className="flex justify-between text-xl font-black bg-green-500/10 rounded-lg px-4 py-3 border border-green-500/20">
                            <span>LÍQUIDO A PAGAR</span><span className="text-green-400">{clp(liq.totales.liquido_pagar)}</span>
                        </div>

                        {aportes.length > 0 && (
                            <details className="text-xs text-slate-500">
                                <summary className="cursor-pointer">Aportes del empleador: {clp(liq.totales.aportes_patronales)} (no afecta el líquido)</summary>
                                <div className="pl-2 pt-1">
                                    {aportes.map((a, i) => <div key={i} className="flex justify-between"><span>{a.descripcion}</span><span>{clp(a.monto)}</span></div>)}
                                </div>
                            </details>
                        )}
                    </div>
                )}

                <DialogFooter className="gap-2">
                    <Button type="button" variant="outline" onClick={imprimirPDF} disabled={!liq} className="border-[#efe8dd] text-slate-700 hover:bg-slate-100"><Printer className="h-4 w-4 mr-2" />Imprimir / PDF</Button>
                    {accion && (
                        <Button type="button" onClick={() => cambiarEstado.mutate(accion.estado)} disabled={cambiarEstado.isPending} className="bg-gradient-to-r from-green-500 to-emerald-600 text-white">
                            {cambiarEstado.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}{accion.label}
                        </Button>
                    )}
                    {liq && ['aprobada', 'pagada'].includes(liq.estado) && (
                        <Button type="button" variant="outline" onClick={() => cambiarEstado.mutate('borrador')} disabled={cambiarEstado.isPending} className="border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10">Reabrir</Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default LiquidacionDetalleModal;
