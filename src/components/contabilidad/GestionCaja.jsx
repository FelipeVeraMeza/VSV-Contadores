import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Loader2, Trash2, Wallet, ArrowDownRight, FileWarning, Banknote, CreditCard, ArrowLeftRight, Coins } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { crearMovimientoCajaApi, listarMovimientosCajaApi, eliminarMovimientoCajaApi } from '@/services/cajaService';
import { obtenerHistorialBunker, obtenerComprasBunker } from '@/services/dteConsultasService';

const formatCLP = (v) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(v || 0);
const formatFecha = (f) => f ? new Date(String(f).length === 10 ? f + 'T00:00:00' : f).toLocaleDateString('es-CL', { timeZone: 'UTC' }) : '—';

const MEDIOS = [
  { id: 'efectivo',      label: 'Efectivo',      icon: Coins },
  { id: 'transferencia', label: 'Transferencia', icon: ArrowLeftRight },
  { id: 'cheque',        label: 'Cheque',        icon: Banknote },
  { id: 'tarjeta',       label: 'Tarjeta',       icon: CreditCard },
  { id: 'otro',          label: 'Otro',          icon: Wallet },
];
const medioLabel = (id) => MEDIOS.find(m => m.id === id)?.label || id;

const GestionCaja = ({ empresaId, rango, tipo }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const esRecaudacion = tipo === 'recaudacion';
  const targetId = empresaId || 'ALL';
  const color = esRecaudacion ? 'emerald' : 'red';

  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [form, setForm] = useState({
    fecha: new Date().toISOString().slice(0, 10),
    rut: '', nombre: '', folio_asociado: '', monto: '', medio_pago: 'efectivo', glosa: '',
  });

  const desde = rango?.desde, hasta = rango?.hasta;
  const { data, isLoading } = useQuery({
    queryKey: ['caja', tipo, targetId, desde, hasta],
    queryFn: async () => {
      const res = await listarMovimientosCajaApi(user.sessionId, empresaId, tipo, desde, hasta);
      if (!res.ok) return { movimientos: [] };
      return res.json();
    },
    enabled: !!user?.sessionId,
    staleTime: 0,
  });
  const movimientos = data?.movimientos || [];
  const total = movimientos.reduce((s, m) => s + Number(m.monto || 0), 0);

  // Documentos (ventas si recaudación / compras si pago) para autocompletar por folio
  const { data: docs } = useQuery({
    queryKey: ['docs-caja', tipo, targetId],
    queryFn: async () => {
      const res = esRecaudacion ? await obtenerHistorialBunker(targetId) : await obtenerComprasBunker(targetId);
      return res.ok ? (res.documentos || []) : [];
    },
    enabled: isOpen && !!user?.sessionId,
    staleTime: 60000,
  });
  const documentos = Array.isArray(docs) ? docs : [];

  // Al escribir el folio, busca el documento y autocompleta RUT / Nombre / Monto
  const onChangeFolio = (val) => {
    const doc = documentos.find(d => String(d.folio) === val.trim());
    if (doc) {
      const rut    = esRecaudacion ? doc.rut_cliente : doc.rut_proveedor;
      const nombre = esRecaudacion ? doc.razon_social : doc.razon_social_proveedor;
      const neto  = Number(doc.monto_neto) || 0;
      const iva   = Number(doc.monto_iva) || Math.round(neto * 0.19);
      const totalDoc = Number(doc.monto_total) || (neto + iva);
      setForm(f => ({ ...f, folio_asociado: val, rut: rut || f.rut, nombre: nombre || f.nombre, monto: String(totalDoc) }));
    } else {
      setForm(f => ({ ...f, folio_asociado: val }));
    }
  };

  const resetForm = () => setForm({
    fecha: new Date().toISOString().slice(0, 10),
    rut: '', nombre: '', folio_asociado: '', monto: '', medio_pago: 'efectivo', glosa: '',
  });

  const handleGuardar = async () => {
    if (!(Number(form.monto) > 0)) { toast({ variant: 'destructive', title: 'Monto requerido', description: 'Ingresa un monto mayor a 0.' }); return; }
    setIsSaving(true);
    try {
      const res = await crearMovimientoCajaApi(user.sessionId, { empresaId: targetId, tipo, ...form, monto: Number(form.monto) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Error al registrar');
      toast({ title: `✅ ${esRecaudacion ? 'Recaudación' : 'Pago'} registrad${esRecaudacion ? 'a' : 'o'}`, description: formatCLP(form.monto) });
      resetForm(); setIsOpen(false);
      queryClient.invalidateQueries(['caja', tipo, targetId]);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally { setIsSaving(false); }
  };

  const handleEliminar = async (id) => {
    if (!confirm('¿Eliminar este movimiento?')) return;
    setDeletingId(id);
    try {
      const res = await eliminarMovimientoCajaApi(user.sessionId, id);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      toast({ title: '🗑️ Eliminado' });
      queryClient.invalidateQueries(['caja', tipo, targetId]);
    } catch (e) { toast({ variant: 'destructive', title: 'Error', description: e.message }); }
    finally { setDeletingId(null); }
  };

  const labelContraparte = esRecaudacion ? 'Cliente' : 'Proveedor';

  return (
    <div className="space-y-5">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-black/20 rounded-xl border border-white/5 px-5 py-3">
            <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Movimientos</p>
            <p className="font-black text-white text-lg">{movimientos.length}</p>
          </div>
          <div className="bg-black/20 rounded-xl border border-white/5 px-5 py-3">
            <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Total {esRecaudacion ? 'Recaudado' : 'Pagado'}</p>
            <p className={`font-black text-lg ${esRecaudacion ? 'text-emerald-400' : 'text-red-400'}`}>{formatCLP(total)}</p>
          </div>
        </div>
        <Button onClick={() => setIsOpen(true)}
          className={`${esRecaudacion ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700' : 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700'} text-white font-black uppercase text-[10px] tracking-widest h-11 px-5`}>
          <Plus className="h-4 w-4 mr-2" /> {esRecaudacion ? 'Registrar Recaudación' : 'Registrar Pago'}
        </Button>
      </div>

      {/* LISTADO */}
      <div className="bg-[#0f172a]/80 rounded-xl border border-white/5 overflow-hidden shadow-2xl">
        {isLoading ? (
          <div className="py-16 flex justify-center"><Loader2 className="h-8 w-8 text-blue-500 animate-spin opacity-40" /></div>
        ) : movimientos.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-3 text-center">
            <div className="bg-white/5 p-5 rounded-full border border-white/10">
              {esRecaudacion ? <Wallet className="h-8 w-8 text-gray-500" /> : <ArrowDownRight className="h-8 w-8 text-gray-500" />}
            </div>
            <p className="text-white font-black uppercase text-sm">Sin registros</p>
            <p className="text-gray-500 text-[10px] uppercase tracking-widest font-bold">No hay {esRecaudacion ? 'recaudaciones' : 'pagos'} en este período.</p>
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm min-w-[760px]">
              <thead className="bg-white/5 border-b border-white/10 text-[10px] uppercase tracking-widest font-black text-gray-400">
                <tr>
                  <th className="px-5 py-4">Fecha</th>
                  <th className="px-5 py-4">{labelContraparte}</th>
                  <th className="px-5 py-4">Folio Asoc.</th>
                  <th className="px-5 py-4">Medio</th>
                  <th className="px-5 py-4">Glosa</th>
                  <th className="px-5 py-4 text-right">Monto</th>
                  <th className="px-5 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {movimientos.map((m) => (
                  <tr key={m.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-5 py-3 text-xs text-gray-400 font-bold whitespace-nowrap">{formatFecha(m.fecha)}</td>
                    <td className="px-5 py-3">
                      <p className="text-xs text-white font-bold truncate max-w-[180px]">{m.nombre || '—'}</p>
                      <p className="text-[9px] text-gray-500 font-mono">{m.rut}</p>
                    </td>
                    <td className="px-5 py-3 text-xs font-mono text-gray-400">{m.folio_asociado ? `#${m.folio_asociado}` : '—'}</td>
                    <td className="px-5 py-3">
                      <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">{medioLabel(m.medio_pago)}</span>
                    </td>
                    <td className="px-5 py-3 text-xs text-gray-400 truncate max-w-[160px]">{m.glosa || '—'}</td>
                    <td className={`px-5 py-3 text-right font-black font-mono ${esRecaudacion ? 'text-emerald-400' : 'text-red-400'}`}>{formatCLP(m.monto)}</td>
                    <td className="px-5 py-3 text-center">
                      <button onClick={() => handleEliminar(m.id)} disabled={deletingId === m.id}
                        className="p-1.5 text-gray-600 hover:text-red-400 rounded opacity-0 group-hover:opacity-100 transition-all disabled:opacity-40">
                        {deletingId === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL REGISTRAR */}
      <Dialog open={isOpen} onOpenChange={(o) => { if (!o) resetForm(); setIsOpen(o); }}>
        <DialogContent className="sm:max-w-[560px] bg-[#0f172a] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className={`text-lg font-black uppercase tracking-tight ${esRecaudacion ? 'text-emerald-400' : 'text-red-400'}`}>
              {esRecaudacion ? 'Registrar Recaudación' : 'Registrar Pago'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <Campo label="Fecha">
                <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} className="inp [color-scheme:dark]" />
              </Campo>
              <Campo label="Monto">
                <input type="number" min="0" placeholder="0" value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} className="inp font-mono" />
              </Campo>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Campo label={`RUT ${labelContraparte}`}>
                <input type="text" placeholder="76.123.456-7" value={form.rut} onChange={e => setForm(f => ({ ...f, rut: e.target.value }))} className="inp font-mono" />
              </Campo>
              <Campo label={`Nombre ${labelContraparte}`}>
                <input type="text" placeholder="Razón social" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} className="inp" />
              </Campo>
            </div>
            <Campo label="Folio asociado (escribe el N° y se autocompleta)">
              <input type="text" placeholder="N° de factura" value={form.folio_asociado} onChange={e => onChangeFolio(e.target.value)} className="inp" />
              {form.folio_asociado.trim() && (
                documentos.some(d => String(d.folio) === form.folio_asociado.trim())
                  ? <p className="text-[9px] text-emerald-400 font-bold mt-1">✓ Documento encontrado — datos autocompletados</p>
                  : <p className="text-[9px] text-gray-600 mt-1">No se encontró factura con ese folio (puedes registrar igual).</p>
              )}
            </Campo>

            <div>
              <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-2">Medio de Pago</p>
              <div className="grid grid-cols-5 gap-2">
                {MEDIOS.map(med => {
                  const Icon = med.icon; const active = form.medio_pago === med.id;
                  return (
                    <button key={med.id} onClick={() => setForm(f => ({ ...f, medio_pago: med.id }))}
                      className={`flex flex-col items-center gap-1 py-2.5 rounded-lg text-[8px] font-black uppercase tracking-wide transition-all border ${
                        active ? 'bg-blue-600 border-blue-400/50 text-white' : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                      }`}>
                      <Icon className="h-4 w-4" /> {med.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <Campo label="Glosa / Descripción">
              <input type="text" placeholder="Ej: Pago factura #123" value={form.glosa} onChange={e => setForm(f => ({ ...f, glosa: e.target.value }))} className="inp" />
            </Campo>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="ghost" onClick={() => { resetForm(); setIsOpen(false); }} className="text-gray-400 hover:text-white">Cancelar</Button>
            <Button onClick={handleGuardar} disabled={isSaving || !(Number(form.monto) > 0)}
              className={`${esRecaudacion ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'} text-white font-black uppercase text-xs tracking-widest disabled:opacity-40`}>
              {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />} Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <style>{`.inp{width:100%;background:rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.1);border-radius:.5rem;padding:.5rem .75rem;font-size:.875rem;color:#fff;outline:none}.inp:focus{border-color:#3b82f6}`}</style>
    </div>
  );
};

const Campo = ({ label, children }) => (
  <div>
    <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-1.5 block">{label}</label>
    {children}
  </div>
);

export default GestionCaja;
