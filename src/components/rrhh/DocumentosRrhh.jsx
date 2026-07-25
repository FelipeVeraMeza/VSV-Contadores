import React, { useState } from 'react';
import { Download, FileWarning, Loader2, Book, Landmark, FileText, FileSpreadsheet, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { getLibroRemuneracionesApi } from '@/services/rrhhService';
import { exportLibro, exportPrevired, exportLre, exportNominaBancaria } from '@/services/rrhhReportes';

const clp = (v) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(Number(v) || 0);
const mesActual = () => new Date().toISOString().slice(0, 7);
const periodoTexto = (v) => { const d = String(v).slice(0, 7).split('-'); const M = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']; return d.length === 2 ? `${M[Number(d[1]) - 1]} ${d[0]}` : String(v); };

const TIPOS = {
    libro:    { titulo: 'Libro de Remuneraciones', icon: Book, color: 'text-teal-400', desc: 'Detalle de todas las liquidaciones del período por trabajador.', boton: 'Descargar Libro (CSV)', run: exportLibro, soloPagables: false },
    previred: { titulo: 'PREVIRED', icon: FileText, color: 'text-indigo-400', desc: 'Cotizaciones previsionales de las liquidaciones aprobadas/pagadas.', boton: 'Descargar PREVIRED (CSV)', run: exportPrevired, soloPagables: true },
    lre:      { titulo: 'Libro Electrónico DT (LRE)', icon: FileSpreadsheet, color: 'text-amber-400', desc: 'Libro de Remuneraciones Electrónico para la Dirección del Trabajo.', boton: 'Descargar LRE (CSV)', run: exportLre, soloPagables: false },
    nomina:   { titulo: 'Nómina Bancaria', icon: Landmark, color: 'text-emerald-400', desc: 'Archivo de pago para el banco con líquidos y datos bancarios.', boton: 'Descargar Nómina (CSV)', run: exportNominaBancaria, soloPagables: true },
};

const DocumentosRrhh = ({ empresaId, tipo = 'libro' }) => {
    const { user } = useAuth();
    const sid = user?.sessionId;
    const [periodo, setPeriodo] = useState(mesActual());
    const consolidado = !empresaId;
    const cfg = TIPOS[tipo] || TIPOS.libro;
    const Icon = cfg.icon;

    const { data: libro, isLoading } = useQuery({
        queryKey: ['libro-remuneraciones', empresaId, periodo],
        queryFn: async () => { const r = await getLibroRemuneracionesApi(sid, empresaId, periodo); return r.ok ? r.json() : null; },
        enabled: !!sid,
    });

    const filas = libro?.filas || [];
    const totales = libro?.totales;
    const pagables = filas.filter(f => f.estado === 'aprobada' || f.estado === 'pagada');
    const fuente = cfg.soloPagables ? pagables : filas;

    const descargar = () => {
        if (!fuente.length) return toast({ title: cfg.soloPagables ? 'Sin liquidaciones aprobadas' : 'Sin liquidaciones', description: cfg.soloPagables ? 'Aprueba liquidaciones del período para generar este archivo.' : 'Genera liquidaciones en este período.', variant: 'destructive' });
        cfg.run(fuente, periodo);
        toast({ title: 'Archivo generado', description: `${cfg.titulo} · ${periodoTexto(periodo)}` });
    };

    return (
        <div className="space-y-5">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                    <div className="flex items-start gap-3 flex-1">
                        <div className="w-11 h-11 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center flex-shrink-0"><Icon className={`h-5 w-5 ${cfg.color}`} /></div>
                        <div><h3 className="text-base font-bold text-white">{cfg.titulo}</h3><p className="text-xs text-gray-400 mt-0.5 max-w-xl">{cfg.desc}</p></div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <Input type="month" value={periodo} onChange={e => setPeriodo(e.target.value)} className="w-40 bg-white/[0.04] border-white/10" />
                        <Button onClick={descargar} disabled={!fuente.length} className="bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 text-white font-semibold h-10"><Download className="h-4 w-4 mr-2" />{cfg.boton}</Button>
                    </div>
                </div>
            </div>

            {(tipo === 'previred' || tipo === 'lre') && (
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-200 text-xs">
                    <Info className="h-4 w-4 flex-shrink-0 mt-0.5" /><span>Exportación base (CSV) con los campos clave. <b>Valida el layout exacto</b> contra el formato oficial vigente antes de cargarlo.</span>
                </div>
            )}

            {isLoading ? (
                <div className="flex justify-center py-20"><Loader2 className="h-9 w-9 animate-spin text-purple-500" /></div>
            ) : filas.length === 0 ? (
                <div className="flex flex-col items-center text-gray-500 py-20">
                    <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center mb-4"><FileWarning className="h-6 w-6 opacity-40" /></div>
                    <h3 className="text-base font-semibold text-white">Sin liquidaciones en {periodoTexto(periodo)}</h3>
                    <p className="text-sm mt-1">Genera y aprueba liquidaciones del período para producir este documento.</p>
                </div>
            ) : (
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
                    <div className="px-5 py-3 border-b border-white/10">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Vista previa · {filas.length} liquidación(es){cfg.soloPagables ? ` · ${pagables.length} aprobada(s)/pagada(s)` : ''}</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-white/10 bg-white/[0.03] text-gray-500">
                                    <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider">Empleado</th>
                                    <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider">RUT</th>
                                    {consolidado && <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider">Empresa</th>}
                                    <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider">Imponible</th>
                                    <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider">Haberes</th>
                                    <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider">Descuentos</th>
                                    <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wider">Líquido</th>
                                    <th className="px-4 py-3 text-center text-[10px] font-semibold uppercase tracking-wider">Estado</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.06]">
                                {filas.map((f, i) => (
                                    <tr key={i} className="hover:bg-white/[0.03]">
                                        <td className="px-4 py-3 text-white">{f.empleado}<div className="text-[10px] text-gray-500">{f.cargo}</div></td>
                                        <td className="px-4 py-3 text-gray-400 font-mono text-xs">{f.rut}</td>
                                        {consolidado && <td className="px-4 py-3 text-gray-400 truncate max-w-[200px]">{f.empresa || '—'}</td>}
                                        <td className="px-4 py-3 text-right text-gray-300">{clp(f.imponible)}</td>
                                        <td className="px-4 py-3 text-right text-gray-300">{clp(f.haberes)}</td>
                                        <td className="px-4 py-3 text-right text-red-400">{clp(f.descuentos)}</td>
                                        <td className="px-4 py-3 text-right text-green-400 font-bold">{clp(f.liquido)}</td>
                                        <td className="px-4 py-3 text-center"><span className="text-[10px] uppercase text-gray-400">{f.estado}</span></td>
                                    </tr>
                                ))}
                            </tbody>
                            {totales && (
                                <tfoot className="bg-white/[0.04] font-bold text-white">
                                    <tr>
                                        <td className="px-4 py-3" colSpan={consolidado ? 3 : 2}>TOTALES ({libro.cantidad})</td>
                                        <td className="px-4 py-3 text-right">{clp(totales.imponible)}</td>
                                        <td className="px-4 py-3 text-right">{clp(totales.haberes)}</td>
                                        <td className="px-4 py-3 text-right text-red-400">{clp(totales.descuentos)}</td>
                                        <td className="px-4 py-3 text-right text-green-400">{clp(totales.liquido)}</td>
                                        <td></td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DocumentosRrhh;
