import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BookCopy, Loader2, CalendarDays } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { getChartOfAccountsApi } from '@/services/accountingService';
import { toast } from '@/components/ui/use-toast';

const CUENTAS_LABELS = {
    CLIENTES: 'Cuenta Clientes',
    VENTAS: 'Cuenta Ventas',
    IVA_DEBITO: 'IVA Débito',
    PROVEEDORES: 'Cuenta Proveedores',
    IVA_CREDITO: 'IVA Crédito',
    GASTOS: 'Cuenta Gastos'
};

const TIPOS_PERIODO = [
    { value: 'mensual', label: 'Mensual' },
    { value: 'trimestral', label: 'Trimestral' },
    { value: 'anual', label: 'Anual' },
    { value: 'diario', label: 'Diario' },
];

const formatCLP = (val) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(val || 0);

const GeneradorLibroDiarioModal = ({ isOpen, setIsOpen, rawVentas = [], rawCompras = [], mes, anio, empresaId, onGuardarSuperficial }) => {
    const { user } = useAuth();
    const [tipoPeriodo, setTipoPeriodo] = useState('mensual');
    const [diaSeleccionado, setDiaSeleccionado] = useState('01');
    const [mapeo, setMapeo] = useState({
        CLIENTES: '1104-01',
        VENTAS: '5101-01',
        IVA_DEBITO: '2108-02',
        PROVEEDORES: '2116-01',
        IVA_CREDITO: '1108-02',
        GASTOS: '4201-08'
    });

    const { data: dataCuentas, isLoading } = useQuery({
        queryKey: ['chart-of-accounts', empresaId],
        queryFn: async () => {
            const res = await getChartOfAccountsApi(user.sessionId, empresaId);
            if (!res.ok) throw new Error("Error al obtener plan de cuentas");
            const data = await res.json();
            return data.plan || [];
        },
        enabled: isOpen && !!user?.sessionId && !!empresaId,
    });

    const plan = dataCuentas || [];
    const getNombreCuenta = (codigo) => plan.find(c => c.codigo === codigo)?.descripcion || `CUENTA ${codigo}`;

    const diasEnMes = useMemo(() => new Date(parseInt(anio), parseInt(mes), 0).getDate(), [mes, anio]);
    const dias = useMemo(() => Array.from({ length: diasEnMes }, (_, i) => (i + 1).toString().padStart(2, '0')), [diasEnMes]);

    const { ventasFiltradas, comprasFiltradas, periodoLabel } = useMemo(() => {
        const mesNum = parseInt(mes);
        const trimestre = Math.ceil(mesNum / 3);
        const mesInicioTrim = ((trimestre - 1) * 3 + 1).toString().padStart(2, '0');
        const mesFinTrim = (trimestre * 3).toString().padStart(2, '0');

        let filtro;
        let label;

        switch (tipoPeriodo) {
            case 'diario':
                filtro = (d) => d.fecha_emision?.startsWith(`${anio}-${mes}-${diaSeleccionado}`);
                label = `${diaSeleccionado}/${mes}/${anio}`;
                break;
            case 'trimestral':
                filtro = (d) => {
                    if (!d.fecha_emision) return false;
                    const dMes = d.fecha_emision.substring(5, 7);
                    const dAnio = d.fecha_emision.substring(0, 4);
                    return dAnio === anio && dMes >= mesInicioTrim && dMes <= mesFinTrim;
                };
                label = `T${trimestre} ${anio}`;
                break;
            case 'anual':
                filtro = (d) => d.fecha_emision?.startsWith(anio);
                label = `AÑO ${anio}`;
                break;
            default:
                filtro = (d) => d.fecha_emision?.startsWith(`${anio}-${mes}`);
                label = `${mes}/${anio}`;
        }

        return {
            ventasFiltradas: rawVentas.filter(filtro),
            comprasFiltradas: rawCompras.filter(filtro),
            periodoLabel: label
        };
    }, [tipoPeriodo, mes, anio, diaSeleccionado, rawVentas, rawCompras]);

    const resumenMatematico = useMemo(() => {
        let fV = { neto: 0, iva: 0, total: 0 };
        let ncV = { neto: 0, iva: 0, total: 0 };

        ventasFiltradas.forEach(doc => {
            const neto = Number(doc.monto_neto) || 0;
            const iva = Number(doc.monto_iva) || 0;
            const total = Number(doc.monto_total) || (neto + iva);
            if (doc.tipo_dte === 61) { ncV.neto += neto; ncV.iva += iva; ncV.total += total; }
            else { fV.neto += neto; fV.iva += iva; fV.total += total; }
        });

        let fC = { neto: 0, iva: 0, total: 0 };
        let ncC = { neto: 0, iva: 0, total: 0 };

        comprasFiltradas.forEach(doc => {
            const neto = Number(doc.monto_neto) || 0;
            const iva = Number(doc.monto_iva) || 0;
            const total = Number(doc.monto_total) || (neto + iva);
            if (doc.tipo_dte === 61) { ncC.neto += neto; ncC.iva += iva; ncC.total += total; }
            else { fC.neto += neto; fC.iva += iva; fC.total += total; }
        });

        return {
            ventas: { final: { neto: fV.neto - ncV.neto, iva: fV.iva - ncV.iva, total: fV.total - ncV.total } },
            compras: { final: { neto: fC.neto - ncC.neto, iva: fC.iva - ncC.iva, total: fC.total - ncC.total } }
        };
    }, [ventasFiltradas, comprasFiltradas]);

    const asientos = useMemo(() => {
        if (!isOpen || !Object.values(mapeo).every(c => c)) return [];
        const lineas = [];
        const { ventas: resV, compras: resC } = resumenMatematico;

        const { neto: netoV, iva: ivaV, total: totalV } = resV.final;
        if (Math.abs(totalV) > 0 || Math.abs(netoV) > 0) {
            const neg = totalV < 0;
            lineas.push({ tipo: 'header', glosa: `CENTRALIZACIÓN VENTAS ${periodoLabel}` });
            lineas.push({ codigo: mapeo.CLIENTES, descripcion: getNombreCuenta(mapeo.CLIENTES), debe: !neg ? Math.abs(totalV) : 0, haber: neg ? Math.abs(totalV) : 0 });
            lineas.push({ codigo: mapeo.VENTAS, descripcion: getNombreCuenta(mapeo.VENTAS), debe: neg ? Math.abs(netoV) : 0, haber: !neg ? Math.abs(netoV) : 0 });
            lineas.push({ codigo: mapeo.IVA_DEBITO, descripcion: getNombreCuenta(mapeo.IVA_DEBITO), debe: neg ? Math.abs(ivaV) : 0, haber: !neg ? Math.abs(ivaV) : 0 });
        }

        const { neto: netoC, iva: ivaC, total: totalC } = resC.final;
        if (Math.abs(totalC) > 0 || Math.abs(netoC) > 0) {
            const neg = totalC < 0;
            lineas.push({ tipo: 'header', glosa: `CENTRALIZACIÓN COMPRAS ${periodoLabel}` });
            lineas.push({ codigo: mapeo.GASTOS, descripcion: getNombreCuenta(mapeo.GASTOS), debe: !neg ? Math.abs(netoC) : 0, haber: neg ? Math.abs(netoC) : 0 });
            lineas.push({ codigo: mapeo.IVA_CREDITO, descripcion: getNombreCuenta(mapeo.IVA_CREDITO), debe: !neg ? Math.abs(ivaC) : 0, haber: neg ? Math.abs(ivaC) : 0 });
            lineas.push({ codigo: mapeo.PROVEEDORES, descripcion: getNombreCuenta(mapeo.PROVEEDORES), debe: neg ? Math.abs(totalC) : 0, haber: !neg ? Math.abs(totalC) : 0 });
        }

        return lineas;
    }, [resumenMatematico, mapeo, periodoLabel, isOpen]);

    const handleGenerar = () => {
        onGuardarSuperficial?.({ asientos, periodoLabel });
        toast({
            title: "✅ Borrador Generado",
            description: `Libro ${TIPOS_PERIODO.find(t => t.value === tipoPeriodo)?.label} — ${periodoLabel} enviado al tab Libro Diario.`
        });
        setIsOpen(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="sm:max-w-[800px] bg-white border-[#efe8dd] text-slate-700 shadow-2xl backdrop-blur-xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center text-xl font-black tracking-tight text-blue-600 uppercase">
                        <BookCopy className="mr-3 h-6 w-6" />
                        Libro Diario Centralizado
                    </DialogTitle>
                </DialogHeader>

                <div className="max-h-[65vh] overflow-y-auto custom-scrollbar pr-2 mt-4 space-y-6">

                    {/* TIPO DE PERÍODO */}
                    <div className="bg-slate-50 border border-[#efe8dd] rounded-xl p-5">
                        <h4 className="text-xs font-black uppercase text-blue-700 mb-4 tracking-widest flex items-center gap-2">
                            <CalendarDays className="h-3.5 w-3.5" /> Tipo de Período
                        </h4>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {TIPOS_PERIODO.map(tipo => (
                                <button
                                    key={tipo.value}
                                    onClick={() => setTipoPeriodo(tipo.value)}
                                    className={`py-2.5 px-3 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                        tipoPeriodo === tipo.value
                                            ? 'bg-blue-600 text-white shadow-lg shadow-emerald-900/30'
                                            : 'bg-slate-50 text-slate-400 hover:text-slate-900 hover:bg-slate-100/50 border border-[#efe8dd]'
                                    }`}
                                >
                                    {tipo.label}
                                </button>
                            ))}
                        </div>

                        {tipoPeriodo === 'diario' && (
                            <div className="mt-4">
                                <label className="text-[9px] font-bold uppercase text-slate-400 mb-1.5 block">Día</label>
                                <select
                                    value={diaSeleccionado}
                                    onChange={(e) => setDiaSeleccionado(e.target.value)}
                                    className="w-32 bg-slate-50 border border-[#efe8dd] rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500"
                                >
                                    {dias.map(d => <option key={d} value={d} className="bg-white">{d}</option>)}
                                </select>
                            </div>
                        )}

                        <div className="mt-3 flex items-center gap-4 text-[10px] font-black uppercase tracking-widest">
                            <span className="text-blue-600">Período: {periodoLabel}</span>
                            <span className="text-emerald-600">{ventasFiltradas.length} ventas</span>
                            <span className="text-red-500">{comprasFiltradas.length} compras</span>
                        </div>
                    </div>

                    {/* CONFIGURACIÓN DE CUENTAS */}
                    {!isLoading && (
                        <div className="bg-slate-50 border border-[#efe8dd] rounded-xl p-5">
                            <h4 className="text-xs font-black uppercase text-blue-700 mb-4 tracking-widest">Configuración de Cuentas</h4>
                            <div className="grid grid-cols-2 gap-4">
                                {Object.entries(CUENTAS_LABELS).map(([tipo, label]) => (
                                    <div key={tipo} className="space-y-1">
                                        <label className="text-[9px] font-bold uppercase text-slate-400">{label}</label>
                                        <Select value={mapeo[tipo]} onValueChange={(val) => setMapeo(prev => ({ ...prev, [tipo]: val }))}>
                                            <SelectTrigger className="bg-white border-[#efe8dd] text-xs text-slate-900 h-8">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-white border-[#efe8dd] text-slate-700 max-h-[300px] overflow-y-auto">
                                                {plan.map(cta => (
                                                    <SelectItem key={cta.codigo} value={cta.codigo} className="text-xs">
                                                        {cta.codigo} - {cta.descripcion}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* TABLA DE ASIENTOS */}
                    {isLoading ? (
                        <div className="flex flex-col items-center py-10">
                            <Loader2 className="h-8 w-8 animate-spin text-blue-500 mb-4" />
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cruzando Plan de Cuentas...</p>
                        </div>
                    ) : asientos.length === 0 ? (
                        <div className="text-center py-10 text-slate-400 font-bold uppercase text-xs tracking-widest">
                            Sin movimientos para el período seleccionado.
                        </div>
                    ) : (
                        <div className="bg-slate-50 rounded-xl border border-[#efe8dd] overflow-hidden">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-slate-50">
                                        <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">Cuenta</th>
                                        <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">Debe</th>
                                        <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">Haber</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {asientos.map((linea, index) => {
                                        if (linea.tipo === 'header') return (
                                            <tr key={index} className="bg-blue-900/20">
                                                <td colSpan={3} className="px-4 py-2 text-xs font-black text-blue-600">{linea.glosa}</td>
                                            </tr>
                                        );
                                        return (
                                            <tr key={index} className="hover:bg-white">
                                                <td className="px-4 py-2 text-xs">{getNombreCuenta(linea.codigo)}</td>
                                                <td className="px-4 py-2 text-right font-mono text-xs text-emerald-600">{linea.debe > 0 ? formatCLP(linea.debe) : '-'}</td>
                                                <td className="px-4 py-2 text-right font-mono text-xs text-orange-600">{linea.haber > 0 ? formatCLP(linea.haber) : '-'}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <DialogFooter className="mt-4">
                    <Button variant="ghost" onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-slate-900">
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleGenerar}
                        disabled={asientos.length === 0}
                        className="bg-emerald-600 hover:bg-emerald-500 font-black uppercase text-xs tracking-widest disabled:opacity-40"
                    >
                        <BookCopy className="h-4 w-4 mr-2" />
                        Generar Borrador
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default GeneradorLibroDiarioModal;
