// =====================================================================
// LAS ÚLTIMAS FACTURAS DE UNA EMPRESA
// ---------------------------------------------------------------------
// POR QUÉ EXISTE
// «La información que aparece en Operación Mensual debe ser la última acordada,
// o las últimas 3 facturas: cuándo se hizo y el número de factura, porque una
// empresa puede ser facturada hasta 4 veces al mes. Y si se le hizo una nota de
// crédito debe salir que fue anulada.»
//
// Antes la ficha mostraba UN «N° de Factura» suelto, escrito a mano, sin fecha
// ni estado. Con varias facturas al mes ese número no dice cuál de todas es, y
// una factura anulada por nota de crédito se veía igual que una vigente.
//
// QUÉ MUESTRA
// Cada factura con su folio, cuándo se emitió, en qué estado está y —si ya se
// pagó— quién la pagó. Las anuladas se tachan y se marcan: es la señal de que
// hubo nota de crédito y esa plata no entra.
//
// EL ORDEN ES POR FECHA DE EMISIÓN
// No por período. Una empresa puede tener tres facturas del mismo mes, y la
// última es la más reciente en el tiempo, no la del período más alto.
// =====================================================================
import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, FileText, AlertTriangle, User } from 'lucide-react';
import { ultimasFacturasApi } from '@/services/crmService';

const getSessionId = () => {
    try { return JSON.parse(localStorage.getItem('user') || '{}').sessionId; } catch { return null; }
};

const pesos = (n) => '$' + Number(n || 0).toLocaleString('es-CL');
const fecha = (f) => f ? new Date(f).toLocaleDateString('es-CL') : '—';

// El estado con color. «Anulada» va aparte y gana sobre el resto: una factura
// anulada puede figurar como pagada en la base, y lo que importa saber es que
// hubo nota de crédito.
const ESTADO = {
    PAGADA:         { txt: 'Pagada',    c: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    PENDIENTE_PAGO: { txt: 'Pendiente', c: 'text-amber-700 bg-amber-50 border-amber-200' },
    POR_EMITIR:     { txt: 'Por emitir', c: 'text-slate-600 bg-slate-100 border-slate-200' },
    ANULADA:        { txt: 'Anulada',   c: 'text-red-700 bg-red-50 border-red-200' },
};

const UltimasFacturas = ({ empresaId, limite = 3 }) => {
    const [facturas, setFacturas] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState(null);

    const cargar = useCallback(async () => {
        if (!empresaId) return;
        setCargando(true); setError(null);
        try {
            const r = await ultimasFacturasApi(getSessionId(), empresaId, limite);
            const d = await r.json();
            if (!d.success) throw new Error(d.message || 'No se pudieron cargar.');
            setFacturas(d.facturas || []);
        } catch (e) { setError(e.message); }
        finally { setCargando(false); }
    }, [empresaId, limite]);

    useEffect(() => { cargar(); }, [cargar]);

    if (cargando) return (
        <div className="flex items-center gap-2 text-[11px] text-slate-400 py-2">
            <Loader2 size={12} className="animate-spin" /> Cargando facturas…
        </div>
    );
    if (error) return (
        <p className="text-[11px] text-amber-700 flex items-center gap-1.5 py-2">
            <AlertTriangle size={12} /> {error}
        </p>
    );
    if (!facturas.length) return (
        <p className="text-[11px] text-slate-400 italic py-2">
            Todavía no se le ha emitido ninguna factura.
        </p>
    );

    return (
        <div className="flex flex-col gap-1">
            {facturas.map(f => {
                const e = ESTADO[f.anulada ? 'ANULADA' : f.estado] || ESTADO.POR_EMITIR;
                return (
                    <div key={f.id}
                         className={`flex items-center gap-2.5 bg-white border rounded-lg px-2.5 py-1.5 ${
                            f.anulada ? 'border-red-200' : 'border-[#efe8dd]'}`}>
                        <FileText size={12} className={f.anulada ? 'text-red-400 shrink-0' : 'text-slate-300 shrink-0'} />

                        <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                                {/* El folio tachado dice de un vistazo que esa
                                    factura ya no vale: hubo nota de crédito. */}
                                <span className={`font-mono text-[11px] font-bold ${
                                    f.anulada ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                                    {f.folio ? `N° ${f.folio}` : 'Sin folio'}
                                </span>
                                <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border ${e.c}`}>
                                    {e.txt}
                                </span>
                            </span>
                            <span className="flex items-center gap-2 mt-0.5 flex-wrap">
                                <span className="text-[9px] text-slate-400">
                                    Emitida {fecha(f.fechaEmision)}
                                </span>
                                {/* Quién pagó: la respuesta a «¿quién me pagó por
                                    esa factura?». Solo aparece si se registró. */}
                                {f.pagadoPor && (
                                    <span className="text-[9px] text-emerald-700 flex items-center gap-0.5">
                                        <User size={8} /> {f.pagadoPor}
                                        {f.medioPago && <span className="text-slate-400"> · {f.medioPago}</span>}
                                    </span>
                                )}
                                {f.anulada && f.montoAnulado > 0 && (
                                    <span className="text-[9px] text-red-600">
                                        Nota de crédito {pesos(f.montoAnulado)}
                                    </span>
                                )}
                            </span>
                        </span>

                        <span className={`font-mono text-[11px] font-bold shrink-0 ${
                            f.anulada ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                            {pesos(f.montoFacturado || f.montoEsperado)}
                        </span>
                    </div>
                );
            })}
        </div>
    );
};

export default UltimasFacturas;
