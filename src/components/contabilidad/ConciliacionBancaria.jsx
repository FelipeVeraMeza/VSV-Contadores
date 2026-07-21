import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { GitMerge, Link2, FileWarning, Loader2, Landmark, ArrowDownRight, CheckCircle, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchWithAuth } from '@/services/apiClient';
import { getMovimientosBancariosApi } from '@/services/bancoService';
import { obtenerHistorialBunker } from '@/services/dteConsultasService';

const formatCLP = (val) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(val || 0);
const formatFecha = (f) => f ? new Date(f.length === 10 ? f + 'T00:00:00' : f).toLocaleDateString('es-CL', { timeZone: 'UTC' }) : '—';

const ConciliacionBancaria = ({ empresaId }) => {
  const { user, selectedCompany } = useAuth();
  const targetId = empresaId || selectedCompany?.id || 'ALL';

  // Movimientos del banco (cartola ya cargada)
  const { data: movData, isLoading: loadingMov } = useQuery({
    queryKey: ['mov-bancarios', targetId],
    queryFn: async () => {
      const res = await getMovimientosBancariosApi(user.sessionId, targetId);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user?.sessionId,
  });

  // Facturas emitidas (para cruzar con los abonos)
  const { data: docData, isLoading: loadingDoc } = useQuery({
    queryKey: ['ventas-conciliar', targetId],
    queryFn: async () => {
      const res = await obtenerHistorialBunker(targetId);
      return res.ok ? (res.documentos || []) : [];
    },
    enabled: !!user?.sessionId,
  });

  const movimientos = Array.isArray(movData) ? movData : [];
  const documentos  = Array.isArray(docData) ? docData : [];

  // ── LA UNIÓN: cruzar abonos del banco ↔ facturas por monto total ──
  const { matches, abonosPend, facturasPend } = useMemo(() => {
    const abonos = movimientos.filter(m => Number(m.abono) > 0);
    const facturas = documentos
      .filter(d => d.tipo_dte !== 61) // excluir notas de crédito
      .map(d => {
        const neto = Number(d.monto_neto) || 0;
        const iva  = Number(d.monto_iva) || Math.round(neto * 0.19);
        return { ...d, total: Number(d.monto_total) || (neto + iva) };
      });

    const matches = [];
    const facturasUsadas = new Set();
    abonos.forEach(abono => {
      const fac = facturas.find(f => !facturasUsadas.has(f.id ?? f.folio) && Math.abs(f.total - Number(abono.abono)) < 1);
      if (fac) {
        facturasUsadas.add(fac.id ?? fac.folio);
        matches.push({ abono, factura: fac });
      }
    });
    const abonosPend = abonos.filter(a => !matches.some(m => m.abono === a));
    const facturasPend = facturas.filter(f => !facturasUsadas.has(f.id ?? f.folio));
    return { matches, abonosPend, facturasPend };
  }, [movimientos, documentos]);

  const isLoading = loadingMov || loadingDoc;
  const totalConciliado = matches.reduce((s, m) => s + Number(m.abono.abono), 0);

  // ── Bot: contabiliza la conciliación (asiento Banco / Clientes) ──
  const queryClient = useQueryClient();
  const [isConciliando, setIsConciliando] = useState(false);
  const handleConciliarAuto = async () => {
    if (matches.length === 0) {
      toast({ title: 'Nada que conciliar', description: 'No hay coincidencias banco ↔ factura.' });
      return;
    }
    if (!confirm(`¿Contabilizar la conciliación de ${matches.length} pago(s) por ${formatCLP(totalConciliado)}?`)) return;
    setIsConciliando(true);
    try {
      const empresaIdPayload = (!targetId || targetId === 'ALL') ? null : targetId;
      const fecha = matches[0].abono.fecha || new Date().toISOString().slice(0, 10);
      const res = await fetchWithAuth('/accounting/comprobantes', user.sessionId, {
        method: 'POST',
        body: {
          empresaId: empresaIdPayload,
          tipo: 'traspaso',
          clase: 'conciliacion',
          fecha,
          glosa: `Conciliación Bancaria ${fecha} (${matches.length} pagos)`,
          // La conciliación no tiene folio de documento. Se usa la fecha como
          // identidad (AAAAMMDD) para que rehacer la del mismo día reemplace la
          // anterior en vez de acumular comprobantes duplicados, pero la de otro
          // día siga siendo un asiento propio.
          folio: String(fecha).slice(0, 10).replace(/\D/g, ''),
          lineas: [
            { cuenta: '1101-02', debe: totalConciliado, haber: 0 }, // Banco
            { cuenta: '1104-01', debe: 0, haber: totalConciliado }, // Deudores Clientes
          ],
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Error al contabilizar');
      toast({ title: '✅ Conciliación contabilizada', description: `${matches.length} pagos · ${formatCLP(totalConciliado)} — Comprobante N°${data.numero}` });
      queryClient.invalidateQueries(['comprobantes', targetId]);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setIsConciliando(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="space-y-6">
      {/* RESUMEN */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white/5 p-6 rounded-2xl border border-white/10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400"><GitMerge className="h-5 w-5" /></div>
          <div>
            <h3 className="text-xl font-black text-white uppercase italic tracking-tighter">Conciliación Bancaria</h3>
            <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mt-0.5">Unión automática: abonos del banco ↔ facturas</p>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <div className="text-center">
            <p className="text-[9px] font-black uppercase text-gray-500 tracking-widest">Conciliados</p>
            <p className="text-lg font-black text-emerald-400">{matches.length}</p>
          </div>
          <div className="text-center">
            <p className="text-[9px] font-black uppercase text-gray-500 tracking-widest">Monto Unido</p>
            <p className="text-sm font-black text-emerald-400">{formatCLP(totalConciliado)}</p>
          </div>
          <div className="text-center">
            <p className="text-[9px] font-black uppercase text-gray-500 tracking-widest">Pendientes</p>
            <p className="text-lg font-black text-amber-400">{abonosPend.length + facturasPend.length}</p>
          </div>
          <Button onClick={handleConciliarAuto} disabled={isConciliando || matches.length === 0}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black uppercase text-[10px] tracking-widest h-11 px-5 disabled:opacity-40">
            {isConciliando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Bot className="h-4 w-4 mr-2" />}
            {isConciliando ? 'Conciliando...' : 'Conciliar Automáticamente'}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="h-64 flex flex-col items-center justify-center text-gray-500">
          <Loader2 className="h-10 w-10 animate-spin mb-4 text-blue-500 opacity-40" />
          <p className="text-[10px] font-black uppercase tracking-[0.3em]">Cruzando banco con facturas...</p>
        </div>
      ) : (
        <>
          {/* CONCILIADOS — LA UNIÓN */}
          {matches.length > 0 && (
            <div className="bg-emerald-500/[0.07] rounded-2xl p-5 border border-emerald-500/20">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle className="h-4 w-4 text-emerald-400" />
                <h4 className="text-sm font-black text-emerald-400 uppercase tracking-widest">Conciliados ({matches.length})</h4>
              </div>
              <div className="space-y-2">
                {matches.map((m, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-black/30 rounded-xl border border-white/5">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-gray-400 uppercase font-bold flex items-center gap-1"><Landmark className="h-3 w-3" /> Banco · {formatFecha(m.abono.fecha)}</p>
                      <p className="text-xs text-white font-bold truncate">{m.abono.descripcion}</p>
                    </div>
                    <Link2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0 text-right">
                      <p className="text-[10px] text-gray-400 uppercase font-bold">Factura #{m.factura.folio}</p>
                      <p className="text-xs text-white font-bold truncate">{m.factura.razon_social || m.factura.rut_cliente || 'Cliente'}</p>
                    </div>
                    <span className="text-sm font-black text-emerald-400 font-mono w-28 text-right flex-shrink-0">{formatCLP(m.abono.abono)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PENDIENTES: BANCO | FACTURAS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] px-2 flex items-center gap-2">
                <Landmark className="h-3.5 w-3.5" /> Abonos del banco sin factura ({abonosPend.length})
              </h4>
              <div className="bg-black/20 rounded-2xl p-2 border border-white/5 min-h-[300px]">
                {abonosPend.length ? abonosPend.map((m, i) => (
                  <div key={i} className="flex items-center justify-between p-3 hover:bg-white/5 rounded-xl">
                    <div className="min-w-0">
                      <p className="text-xs text-white font-bold truncate uppercase">{m.descripcion}</p>
                      <p className="text-[9px] text-gray-500 mt-0.5">{formatFecha(m.fecha)}</p>
                    </div>
                    <span className="text-sm font-black text-emerald-400 font-mono">{formatCLP(m.abono)}</span>
                  </div>
                )) : (
                  <div className="h-56 flex flex-col items-center justify-center text-gray-600">
                    <CheckCircle className="h-10 w-10 mb-2 opacity-20" />
                    <p className="text-[10px] font-black uppercase tracking-widest">Banco al día</p>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] px-2 flex items-center gap-2">
                <ArrowDownRight className="h-3.5 w-3.5" /> Facturas sin pago en banco ({facturasPend.length})
              </h4>
              <div className="bg-black/20 rounded-2xl p-2 border border-white/5 min-h-[300px]">
                {facturasPend.length ? facturasPend.map((f, i) => (
                  <div key={i} className="flex items-center justify-between p-3 hover:bg-white/5 rounded-xl">
                    <div className="min-w-0">
                      <p className="text-xs text-white font-bold truncate uppercase">#{f.folio} · {f.razon_social || f.rut_cliente || 'Cliente'}</p>
                      <p className="text-[9px] text-gray-500 mt-0.5">{formatFecha(f.fecha_emision)}</p>
                    </div>
                    <span className="text-sm font-black text-blue-400 font-mono">{formatCLP(f.total)}</span>
                  </div>
                )) : (
                  <div className="h-56 flex flex-col items-center justify-center text-gray-600">
                    <FileWarning className="h-10 w-10 mb-2 opacity-20" />
                    <p className="text-[10px] font-black uppercase tracking-widest">Sin facturas pendientes</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </motion.div>
  );
};

export default ConciliacionBancaria;
