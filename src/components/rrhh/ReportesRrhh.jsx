import React, { useState } from 'react';
import { Download, FileWarning, Loader2, Book, Landmark, FileText, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getLibroRemuneracionesApi, marcarPeriodoPagadoApi } from '@/services/rrhhService';

const clp = (v) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(Number(v) || 0);
const mesActual = () => new Date().toISOString().slice(0, 7);

// Descarga un CSV con separador ';' y BOM (para Excel en español).
const descargarCsv = (nombre, cols, filas) => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [cols.map(esc).join(';'), ...filas.map(f => f.map(esc).join(';'))].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nombre; a.click();
    URL.revokeObjectURL(url);
};

const ReportesRrhh = ({ empresaId }) => {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const sid = user?.sessionId;
    const [periodo, setPeriodo] = useState(mesActual());
    const consolidado = !empresaId;

    const { data: libro, isLoading } = useQuery({
        queryKey: ['libro-remuneraciones', empresaId, periodo],
        queryFn: async () => { const r = await getLibroRemuneracionesApi(sid, empresaId, periodo); return r.ok ? r.json() : null; },
        enabled: Boolean(empresaId) && !!sid,
    });

    const marcarPagado = useMutation({
        mutationFn: async () => { const r = await marcarPeriodoPagadoApi(sid, empresaId, periodo); const d = await r.json(); if (!r.ok) throw new Error(d?.message); return d; },
        onSuccess: (d) => {
            toast({ title: 'Período pagado', description: `${d.actualizadas} liquidación(es) marcadas como pagadas.` });
            queryClient.invalidateQueries({ queryKey: ['libro-remuneraciones', empresaId] });
            queryClient.invalidateQueries({ queryKey: ['liquidaciones', empresaId] });
        },
        onError: (e) => toast({ title: 'No se pudo marcar', description: e.message, variant: 'destructive' }),
    });

    const filas = libro?.filas || [];
    const totales = libro?.totales;
    const pagables = filas.filter(f => f.estado === 'aprobada' || f.estado === 'pagada');
    const hayAprobadas = filas.some(f => f.estado === 'aprobada');

    // ── Generadores de archivos ─────────────────────────────────────────────
    const expLibro = () => descargarCsv(`libro_remuneraciones_${periodo}.csv`,
        ['Empresa', 'Empleado', 'RUT', 'Cargo', 'Días', 'Imponible', 'No imponible', 'Haberes', 'Base tributable', 'Descuentos', 'Líquido', 'Aportes patronales', 'Estado'],
        filas.map(f => [f.empresa, f.empleado, f.rut, f.cargo, f.dias, f.imponible, f.noImponible, f.haberes, f.tributable, f.descuentos, f.liquido, f.aportes, f.estado]));

    const expBanco = () => {
        if (!pagables.length) return toast({ title: 'Sin liquidaciones aprobadas', description: 'Aprueba liquidaciones para generar la nómina.', variant: 'destructive' });
        descargarCsv(`nomina_bancaria_${periodo}.csv`,
            ['Empresa', 'RUT', 'Nombre', 'Banco', 'Tipo de cuenta', 'N° de cuenta', 'Forma de pago', 'Monto'],
            pagables.map(f => [f.empresa, f.rut, f.empleado, f.banco, f.tipoCuenta, f.numeroCuenta, f.tipoPago, f.liquido]));
    };

    const expPrevired = () => {
        if (!pagables.length) return toast({ title: 'Sin liquidaciones aprobadas', variant: 'destructive' });
        descargarCsv(`previred_${periodo}.csv`,
            ['Empresa', 'RUT', 'Nombre', 'AFP', 'Días trab.', 'Renta imponible', 'Cotización AFP', 'SIS (empleador)', 'Salud', 'Cesantía trabajador', 'Cesantía empleador', 'Mutual', 'Impuesto único'],
            pagables.map(f => [f.empresa, f.rut, f.empleado, f.afp, f.dias, f.imponible, f.descAfp, f.aporteSis, f.descSalud, f.descCesantia, f.aporteAfc, f.aporteMutual, f.impuesto]));
    };

    const expLre = () => {
        if (!filas.length) return;
        descargarCsv(`libro_electronico_LRE_${periodo}.csv`,
            ['Empresa', 'RUT', 'Nombre', 'Cargo', 'Días', 'Sueldo base', 'Gratificación', 'Asignación familiar', 'Total haberes', 'Imponible', 'Base tributable', 'AFP', 'Salud', 'Cesantía', 'Impuesto único', 'Otros descuentos', 'Total descuentos', 'Líquido'],
            filas.map(f => {
                const otros = f.descuentos - f.descAfp - f.descSalud - f.descCesantia - f.impuesto;
                return [f.empresa, f.rut, f.empleado, f.cargo, f.dias, f.sueldoBase, f.gratificacion, f.asignacionFamiliar, f.haberes, f.imponible, f.tributable, f.descAfp, f.descSalud, f.descCesantia, f.impuesto, otros, f.descuentos, f.liquido];
            }));
    };

    const archivos = [
        { label: 'Libro (CSV)', icon: Book, onClick: expLibro, disabled: !filas.length },
        { label: 'Nómina bancaria', icon: Landmark, onClick: expBanco, disabled: !pagables.length },
        { label: 'PREVIRED', icon: FileText, onClick: expPrevired, disabled: !pagables.length },
        { label: 'Libro Electrónico (LRE)', icon: FileText, onClick: expLre, disabled: !filas.length },
    ];

    return (
        <div className="space-y-5">
            {/* Toolbar */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                <div className="flex items-center gap-3">
                    <Book className="h-5 w-5 text-teal-400" />
                    <h3 className="text-lg font-black text-white tracking-tight">Reportes y archivos</h3>
                    <Input type="month" value={periodo} onChange={e => setPeriodo(e.target.value)} className="w-44 bg-white/[0.04] border-white/10" />
                </div>
                {hayAprobadas && (
                    <Button onClick={() => { if (window.confirm('¿Marcar como pagadas todas las liquidaciones aprobadas del período?')) marcarPagado.mutate(); }} disabled={marcarPagado.isPending} className="bg-gradient-to-r from-emerald-500 to-green-600 text-white font-semibold h-10">
                        {marcarPagado.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}Marcar período pagado
                    </Button>
                )}
            </div>

            {/* Descargas */}
            <div className="flex flex-wrap gap-2">
                {archivos.map((a) => {
                    const Icon = a.icon;
                    return (
                        <Button key={a.label} variant="outline" onClick={a.onClick} disabled={a.disabled} className="border-white/10 bg-white/[0.03] text-gray-200 hover:bg-white/[0.06] hover:text-white h-10">
                            <Icon className="h-4 w-4 mr-2 text-teal-400" />{a.label}<Download className="h-3.5 w-3.5 ml-2 opacity-50" />
                        </Button>
                    );
                })}
            </div>

            <div className="flex items-start gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-300 text-xs">
                <FileWarning className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>La <b>nómina bancaria</b> está lista para usar. Los archivos <b>PREVIRED</b> y <b>LRE</b> son exportaciones base (CSV) con los campos clave; valida el layout exacto contra el formato oficial vigente antes de cargarlos.</span>
            </div>

            {/* Tabla del libro */}
            {isLoading ? (
                <div className="flex justify-center py-20"><Loader2 className="h-10 w-10 animate-spin text-teal-500" /></div>
            ) : filas.length === 0 ? (
                <div className="flex flex-col items-center text-gray-500 py-20">
                    <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center mb-4"><FileWarning className="h-6 w-6 opacity-40" /></div>
                    <h3 className="text-base font-semibold text-white">Sin liquidaciones en {periodo}</h3>
                    <p className="text-sm mt-1">Genera liquidaciones en ese período para ver el libro.</p>
                </div>
            ) : (
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
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
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ReportesRrhh;
