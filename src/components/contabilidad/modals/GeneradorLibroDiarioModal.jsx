import React, { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { BookCopy, Save, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { getChartOfAccountsApi } from '@/services/accountingService';
import { toast } from '@/components/ui/use-toast';

const CUENTAS_FIJAS = {
    CLIENTES: '1104-01',
    VENTAS: '5101-01',
    IVA_DEBITO: '2108-02',
    PROVEEDORES: '2116-01',
    IVA_CREDITO: '1108-02',
    GASTOS: '4201-08'
};

const formatCLP = (val) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(val || 0);

const GeneradorLibroDiarioModal = ({ isOpen, setIsOpen, compras, ventas, mes, anio, empresaId, onGuardarSuperficial }) => {
    const { user } = useAuth();

    const { data: dataCuentas, isLoading } = useQuery({
        queryKey: ['chart-of-accounts', empresaId],
        queryFn: async () => {
            const res = await getChartOfAccountsApi(user.sessionId, empresaId);
            if (!res.ok) throw new Error("Error al obtener plan");
            return res.json();
        },
        enabled: isOpen && !!user?.sessionId,
    });

    const plan = dataCuentas?.plan || [];
    const getNombreCuenta = (codigo) => plan.find(c => c.codigo === codigo)?.nombre || `CUENTA ${codigo}`;

    const asientos = useMemo(() => {
        if (!isOpen) return [];

        let netoV = 0, ivaV = 0, totalV = 0;
        ventas.forEach(doc => {
            const neto = doc.monto_neto || 0;
            const iva = doc.monto_iva || Math.round(neto * 0.19);
            const total = doc.monto_total || (neto + iva);
            if (doc.tipo_dte === 61) {
                netoV -= neto; ivaV -= iva; totalV -= total;
            } else {
                netoV += neto; ivaV += iva; totalV += total;
            }
        });

        let netoC = 0, ivaC = 0, totalC = 0;
        compras.forEach(doc => {
            const neto = doc.monto_neto || 0;
            const iva = doc.monto_iva || Math.round(neto * 0.19);
            const total = doc.monto_total || (neto + iva);
            if (doc.tipo_dte === 61) {
                netoC -= neto; ivaC -= iva; totalC -= total;
            } else {
                netoC += neto; ivaC += iva; totalC += total;
            }
        });

        const lineas = [];

        if (totalV > 0 || netoV > 0) {
            lineas.push({ tipo: 'header', glosa: `CENTRALIZACIÓN VENTAS ${mes}-${anio}` });
            lineas.push({ codigo: CUENTAS_FIJAS.CLIENTES, debe: totalV, haber: 0 });
            lineas.push({ codigo: CUENTAS_FIJAS.VENTAS, debe: 0, haber: netoV });
            lineas.push({ codigo: CUENTAS_FIJAS.IVA_DEBITO, debe: 0, haber: ivaV });
        }

        if (totalC > 0 || netoC > 0) {
            lineas.push({ tipo: 'header', glosa: `CENTRALIZACIÓN COMPRAS ${mes}-${anio}` });
            lineas.push({ codigo: CUENTAS_FIJAS.GASTOS, debe: netoC, haber: 0 });
            lineas.push({ codigo: CUENTAS_FIJAS.IVA_CREDITO, debe: ivaC, haber: 0 });
            lineas.push({ codigo: CUENTAS_FIJAS.PROVEEDORES, debe: 0, haber: totalC });
        }

        return lineas;
    }, [ventas, compras, mes, anio, isOpen]);

    const handleGuardar = () => {
        // LE ENVIAMOS LOS DATOS A ContabilidadMain.jsx
        if (onGuardarSuperficial) onGuardarSuperficial(asientos);
        
        toast({ title: "Borrador Generado", description: "El Libro Diario se generó exitosamente en modo borrador." });
        setIsOpen(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="sm:max-w-[700px] bg-[#0f172a] border-white/10 text-white shadow-2xl backdrop-blur-xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center text-xl font-black tracking-tight text-blue-400 uppercase">
                        <BookCopy className="mr-3 h-6 w-6" />
                        Libro Diario Centralizado
                    </DialogTitle>
                    <DialogDescription className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">
                        PERIODO SELECCIONADO: {mes} / {anio}
                    </DialogDescription>
                </DialogHeader>

                <div className="max-h-[60vh] overflow-y-auto custom-scrollbar pr-2 mt-4">
                    {isLoading ? (
                        <div className="flex flex-col items-center py-10">
                            <Loader2 className="h-8 w-8 animate-spin text-blue-500 mb-4" />
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Cruzando Plan de Cuentas...</p>
                        </div>
                    ) : asientos.length === 0 ? (
                        <div className="text-center py-10 text-gray-500 font-bold uppercase text-xs tracking-widest">
                            No hay movimientos para generar asientos en este periodo.
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="bg-white/5 sticky top-0">
                                <tr>
                                    <th className="px-4 py-2 text-left text-[10px] font-black uppercase tracking-widest text-gray-400">Cuenta</th>
                                    <th className="px-4 py-2 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">Debe</th>
                                    <th className="px-4 py-2 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">Haber</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {asientos.map((linea, index) => {
                                    if (linea.tipo === 'header') {
                                        return (
                                            <tr key={index} className="bg-white/[0.02]">
                                                <td colSpan={3} className="px-4 py-3 text-xs font-black text-emerald-400 tracking-widest">
                                                    {linea.glosa}
                                                </td>
                                            </tr>
                                        );
                                    }
                                    return (
                                        <tr key={index} className="hover:bg-white/[0.02]">
                                            <td className="px-4 py-2">
                                                <div className="flex flex-col">
                                                    <span className={`text-xs font-bold ${linea.haber > 0 ? 'ml-6 text-gray-400' : 'text-gray-200'}`}>
                                                        {getNombreCuenta(linea.codigo)}
                                                    </span>
                                                    <span className={`text-[9px] font-mono text-blue-400/70 ${linea.haber > 0 ? 'ml-6' : ''}`}>
                                                        {linea.codigo}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-2 text-right font-mono font-bold text-xs">{linea.debe > 0 ? formatCLP(linea.debe) : ''}</td>
                                            <td className="px-4 py-2 text-right font-mono font-bold text-xs">{linea.haber > 0 ? formatCLP(linea.haber) : ''}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                <DialogFooter className="mt-6 border-t border-white/5 pt-4">
                    <Button variant="ghost" onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-white hover:bg-white/5 text-xs font-bold uppercase tracking-widest">
                        Cancelar
                    </Button>
                    <Button onClick={handleGuardar} disabled={isLoading || asientos.length === 0} className="bg-blue-600 hover:bg-blue-500 text-white font-black uppercase text-[10px] tracking-widest">
                        <Save className="mr-2 h-4 w-4" /> Registrar en Libro Diario
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default GeneradorLibroDiarioModal;