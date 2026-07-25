import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { Loader2, Plus, Trash2, Calculator } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    getTrabajadoresApi, getCatalogosApi, getMovimientosApi,
    createMovimientoApi, deleteMovimientoApi, previewLiquidacionApi, guardarLiquidacionApi,
} from '@/services/rrhhService';
import { ThemedSelect } from '@/components/ui/ThemedSelect';

const clp = (v) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(Number(v) || 0);
const mesActual = () => new Date().toISOString().slice(0, 7);

const NuevaLiquidacionModal = ({ isOpen, setIsOpen, empresaId }) => {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const sid = user?.sessionId;

    const [trabajadorId, setTrabajadorId] = useState('');
    const [periodo, setPeriodo] = useState(mesActual());
    const [dias, setDias] = useState(30);
    const [preview, setPreview] = useState(null);
    const [calculando, setCalculando] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [nuevoConcepto, setNuevoConcepto] = useState('');
    const [nuevoMonto, setNuevoMonto] = useState('');

    const { data: trabajadores = [] } = useQuery({
        queryKey: ['trabajadores', empresaId],
        queryFn: async () => { const r = await getTrabajadoresApi(sid, empresaId); return r.ok ? r.json() : []; },
        enabled: isOpen && !!sid,
    });
    const { data: catalogos } = useQuery({
        queryKey: ['rem-catalogos'],
        queryFn: async () => { const r = await getCatalogosApi(sid); return r.ok ? r.json() : null; },
        enabled: isOpen && !!sid,
        staleTime: 1000 * 60 * 30,
    });
    const { data: novedades = [], refetch: refetchNovedades } = useQuery({
        queryKey: ['movimientos', trabajadorId, periodo],
        queryFn: async () => { const r = await getMovimientosApi(sid, trabajadorId, periodo); return r.ok ? r.json() : []; },
        enabled: isOpen && !!sid && !!trabajadorId && !!periodo,
    });

    const conceptos = catalogos?.conceptos || [];

    const calcular = useCallback(async () => {
        if (!trabajadorId || !periodo) { setPreview(null); return; }
        setCalculando(true);
        try {
            const r = await previewLiquidacionApi(sid, { trabajadorId, periodo, diasTrabajados: Number(dias) || 30 });
            const data = await r.json();
            if (!r.ok) { setPreview(null); toast({ title: 'No se pudo calcular', description: data?.message, variant: 'destructive' }); }
            else setPreview(data);
        } catch { setPreview(null); }
        finally { setCalculando(false); }
    }, [sid, trabajadorId, periodo, dias]);

    useEffect(() => { if (isOpen && trabajadorId) calcular(); }, [isOpen, trabajadorId, periodo, dias, novedades, calcular]);

    const agregarNovedad = async () => {
        if (!nuevoConcepto || !nuevoMonto) { toast({ title: 'Falta concepto o monto', variant: 'destructive' }); return; }
        const r = await createMovimientoApi(sid, { trabajadorId, periodo, conceptoId: nuevoConcepto, monto: Number(nuevoMonto) });
        if (r.ok) { setNuevoConcepto(''); setNuevoMonto(''); await refetchNovedades(); }
        else toast({ title: 'No se pudo agregar la novedad', variant: 'destructive' });
    };
    const quitarNovedad = async (id) => {
        const r = await deleteMovimientoApi(sid, id);
        if (r.ok) await refetchNovedades();
    };

    const guardar = async () => {
        if (!trabajadorId) { toast({ title: 'Selecciona un trabajador', variant: 'destructive' }); return; }
        setGuardando(true);
        try {
            const r = await guardarLiquidacionApi(sid, { trabajadorId, periodo, diasTrabajados: Number(dias) || 30 });
            const data = await r.json();
            if (!r.ok) { toast({ title: 'No se pudo guardar', description: data?.message, variant: 'destructive' }); return; }
            toast({ title: 'Liquidación guardada', description: `Líquido: ${clp(data?.totales?.liquido_pagar)}` });
            queryClient.invalidateQueries({ queryKey: ['liquidaciones'] });
            cerrar();
        } finally { setGuardando(false); }
    };

    const cerrar = () => {
        setTrabajadorId(''); setPeriodo(mesActual()); setDias(30); setPreview(null);
        setNuevoConcepto(''); setNuevoMonto('');
        setIsOpen(false);
    };

    const haberes = useMemo(() => preview?.detalles?.filter(d => d.naturaleza === 'HABER') || [], [preview]);
    const descuentos = useMemo(() => preview?.detalles?.filter(d => d.naturaleza === 'DESCUENTO') || [], [preview]);
    const aportes = useMemo(() => preview?.detalles?.filter(d => d.naturaleza === 'APORTE') || [], [preview]);

    return (
        <Dialog open={isOpen} onOpenChange={(v) => { if (!v) cerrar(); else setIsOpen(true); }}>
            <DialogContent className="sm:max-w-4xl bg-black/60 backdrop-blur-xl border-white/20 text-white max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-2xl">Generar Liquidación de Sueldo</DialogTitle>
                    <DialogDescription>Selecciona el trabajador y el período; agrega novedades del mes y calcula.</DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 py-2">
                    {/* Columna izquierda: selección + novedades */}
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 gap-3">
                            <div>
                                <Label>Trabajador</Label>
                                <ThemedSelect value={trabajadorId} onChange={setTrabajadorId} placeholder="Seleccionar…"
                                    options={trabajadores.map(t => ({ value: t.id, label: `${t.nombre} — ${t.rut}` }))} />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div><Label>Período</Label><Input type="month" value={periodo} onChange={e => setPeriodo(e.target.value)} /></div>
                                <div><Label>Días trabajados</Label><Input type="number" min="0" max="30" value={dias} onChange={e => setDias(e.target.value)} /></div>
                            </div>
                        </div>

                        {trabajadorId && (
                            <div className="bg-white/5 rounded-lg border border-white/10 p-3 space-y-3">
                                <h4 className="text-[11px] font-black uppercase tracking-widest text-gray-300">Novedades del mes</h4>
                                {novedades.length > 0 ? (
                                    <div className="space-y-1">
                                        {novedades.map(n => (
                                            <div key={n.id} className="flex items-center justify-between text-sm bg-white/5 rounded px-2 py-1">
                                                <span className="text-gray-200">{n.codigo ? `${n.codigo} · ` : ''}{n.descripcion || n.glosa || 'Movimiento'}</span>
                                                <span className="flex items-center gap-2">
                                                    <span className={n.naturaleza === 'DESCUENTO' ? 'text-red-400' : 'text-green-400'}>{clp(n.monto)}</span>
                                                    <button onClick={() => quitarNovedad(n.id)} className="text-red-400 hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /></button>
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                ) : <p className="text-xs text-gray-500">Sin novedades. El cálculo usa solo la ficha.</p>}

                                <div className="flex items-end gap-2 pt-1">
                                    <div className="flex-1 min-w-0">
                                        <Label className="text-[10px]">Concepto</Label>
                                        <ThemedSelect value={nuevoConcepto} onChange={setNuevoConcepto} placeholder="Concepto…" className="h-9 text-sm"
                                            options={conceptos.filter(c => !c.obsoleto).map(c => ({ value: c.id, label: `${c.codigo} · ${c.descripcion} (${c.naturaleza === 'HABER' ? 'Haber' : 'Desc.'})` }))} />
                                    </div>
                                    <div className="w-28"><Label className="text-[10px]">Monto</Label><Input type="number" value={nuevoMonto} onChange={e => setNuevoMonto(e.target.value)} className="h-9" /></div>
                                    <Button type="button" size="sm" onClick={agregarNovedad} className="bg-purple-600 hover:bg-purple-700 h-9"><Plus className="h-4 w-4" /></Button>
                                </div>
                            </div>
                        )}

                        <Button type="button" onClick={calcular} disabled={!trabajadorId || calculando} className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white">
                            {calculando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Calculator className="h-4 w-4 mr-2" />}Calcular
                        </Button>
                    </div>

                    {/* Columna derecha: desglose */}
                    <div className="bg-white/5 rounded-lg border border-white/10 p-4">
                        {!preview ? (
                            <div className="h-full flex items-center justify-center text-gray-500 text-sm text-center py-16">
                                Selecciona un trabajador para ver el desglose de la liquidación.
                            </div>
                        ) : (
                            <div className="space-y-3 text-sm">
                                <div className="text-center">
                                    <p className="font-bold text-white">{preview.trabajador?.nombre}</p>
                                    <p className="text-[10px] uppercase tracking-widest text-gray-400">{periodo}</p>
                                    {preview.diasLicencia > 0 && (
                                        <p className="text-[11px] text-amber-400 mt-1">− {preview.diasLicencia} día(s) por licencia médica · {preview.diasTrabajados} días trabajados</p>
                                    )}
                                </div>
                                <Seccion titulo="Haberes" items={haberes} color="text-green-400" />
                                <Seccion titulo="Descuentos" items={descuentos} color="text-red-400" signo="-" />
                                <div className="border-t border-white/10 pt-2 space-y-1">
                                    <Fila label="Total imponible" val={preview.totales.total_imponible} />
                                    <Fila label="Total haberes" val={preview.totales.total_haberes} />
                                    <Fila label="Base tributable" val={preview.totales.base_tributable} />
                                    <Fila label="Total descuentos" val={preview.totales.total_descuentos} color="text-red-400" signo="-" />
                                </div>
                                <div className="flex justify-between text-lg font-black text-white bg-green-500/10 rounded-lg px-3 py-2 border border-green-500/20">
                                    <span>LÍQUIDO A PAGAR</span><span className="text-green-400">{clp(preview.totales.liquido_pagar)}</span>
                                </div>
                                {aportes.length > 0 && (
                                    <details className="text-xs text-gray-400">
                                        <summary className="cursor-pointer">Aportes patronales: {clp(preview.totales.aportes_patronales)}</summary>
                                        <div className="pl-2 pt-1 space-y-0.5">
                                            {aportes.map((a, i) => <div key={i} className="flex justify-between"><span>{a.descripcion}</span><span>{clp(a.monto)}</span></div>)}
                                        </div>
                                    </details>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={cerrar} className="border-white/20 text-white hover:bg-white/10">Cancelar</Button>
                    <Button type="button" onClick={guardar} disabled={!preview || guardando} className="bg-gradient-to-r from-green-500 to-emerald-600 text-white">
                        {guardando ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Guardando...</> : 'Guardar Liquidación'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

const clpFmt = (v) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(Number(v) || 0);
const Fila = ({ label, val, color = 'text-gray-200', signo = '' }) => (
    <div className="flex justify-between"><span className="text-gray-400">{label}</span><span className={color}>{signo}{clpFmt(val)}</span></div>
);
const Seccion = ({ titulo, items, color, signo = '' }) => (
    items.length ? (
        <div className="space-y-1">
            <h5 className="text-[10px] font-black uppercase tracking-widest text-gray-400">{titulo}</h5>
            {items.map((d, i) => (
                <div key={i} className="flex justify-between"><span className="text-gray-300">{d.codigo ? `${d.codigo} · ` : ''}{d.descripcion}</span><span className={color}>{signo}{clpFmt(d.monto)}</span></div>
            ))}
        </div>
    ) : null
);

export default NuevaLiquidacionModal;
