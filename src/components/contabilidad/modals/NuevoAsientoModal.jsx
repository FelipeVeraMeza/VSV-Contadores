import React, { useState, useMemo } from 'react';
import { Plus, Trash2, Save, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { fetchWithAuth } from '@/services/apiClient';

const TIPOS = [
  { value: 'ingreso',  label: 'Ingreso',  color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' },
  { value: 'egreso',   label: 'Egreso',   color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/30' },
  { value: 'traspaso', label: 'Traspaso', color: 'text-blue-400',    bg: 'bg-blue-500/10 border-blue-500/30' },
];

const TIPO_DB = { ingreso: 'INGRESO', egreso: 'EGRESO', traspaso: 'TRASPASO' };

const NuevoAsientoModal = ({ isOpen, setIsOpen, empresaId, onGuardadoExitoso }) => {
  const { user } = useAuth();
  const [tipo, setTipo]   = useState('ingreso');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [glosa, setGlosa] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [lineas, setLineas] = useState([
    { id: 1, cuenta: '', nombre: '', debe: '', haber: '' },
    { id: 2, cuenta: '', nombre: '', debe: '', haber: '' },
  ]);

  /* ── plan de cuentas ── */
  const { data: planData } = useQuery({
    queryKey: ['plan-cuentas-global'],
    queryFn: async () => {
      const res = await fetchWithAuth('/accounting/chart-of-accounts', user.sessionId);
      if (!res.ok) return { plan: [] };
      return res.json();
    },
    enabled: isOpen && !!user?.sessionId,
    staleTime: 60000,
  });
  const plan = useMemo(
    () => (planData?.plan || []).filter(c => c.codigo?.includes('-')),
    [planData]
  );
  const getNombre = (codigo) => plan.find(c => c.codigo === codigo)?.descripcion || '';

  /* ── totales ── */
  const totales = useMemo(() => {
    const debe  = lineas.reduce((s, l) => s + (Number(l.debe)  || 0), 0);
    const haber = lineas.reduce((s, l) => s + (Number(l.haber) || 0), 0);
    return { debe, haber, diff: debe - haber };
  }, [lineas]);

  const cuadrado = totales.diff === 0 && totales.debe > 0;
  const valido   = cuadrado && glosa.trim() && lineas.every(l => l.cuenta);

  /* ── handlers ── */
  const agregarLinea  = () => setLineas(p => [...p, { id: Date.now(), cuenta: '', nombre: '', debe: '', haber: '' }]);
  const eliminarLinea = (id) => { if (lineas.length > 2) setLineas(p => p.filter(l => l.id !== id)); };

  const setCuenta = (id, codigo) =>
    setLineas(p => p.map(l => l.id === id ? { ...l, cuenta: codigo, nombre: getNombre(codigo) } : l));

  const setMonto = (id, campo, val) =>
    setLineas(p => p.map(l => l.id === id ? { ...l, [campo]: val } : l));

  const reset = () => {
    setTipo('ingreso'); setGlosa('');
    setFecha(new Date().toISOString().split('T')[0]);
    setLineas([
      { id: 1, cuenta: '', nombre: '', debe: '', haber: '' },
      { id: 2, cuenta: '', nombre: '', debe: '', haber: '' },
    ]);
  };

  const guardar = async () => {
    if (!valido) return;
    setIsSaving(true);
    try {
      const empId = (!empresaId || empresaId === 'ALL' || empresaId === 'null') ? null : empresaId;
      const res = await fetchWithAuth('/accounting/comprobantes', user.sessionId, {
        method: 'POST',
        body: {
          empresaId: empId,
          tipo: tipo,
          fecha,
          glosa,
          lineas: lineas.map(l => ({ cuenta: l.cuenta, debe: Number(l.debe)||0, haber: Number(l.haber)||0 })),
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Error al guardar');
      toast({ title: '✅ Comprobante guardado', description: `${tipo.charAt(0).toUpperCase()+tipo.slice(1)} registrado en el Libro Diario.` });
      reset();
      setIsOpen(false);
      if (onGuardadoExitoso) onGuardadoExitoso();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  const tipoActivo = TIPOS.find(t => t.value === tipo);

  return (
    <Dialog open={isOpen} onOpenChange={(v) => { if (!v) reset(); setIsOpen(v); }}>
      <DialogContent className="sm:max-w-[740px] bg-[#0f172a] border-white/10 text-white shadow-2xl">
        <DialogHeader>
          <DialogTitle className={`text-xl font-black tracking-tight uppercase ${tipoActivo?.color}`}>
            Nuevo Comprobante — {tipoActivo?.label}
          </DialogTitle>
          <DialogDescription className="text-gray-400 text-xs">
            Ajustes contables, remuneraciones o traspasos. Se guardan en el <strong className="text-white">Libro Diario</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-3">

          {/* TIPO + FECHA + GLOSA */}
          <div className="grid grid-cols-[auto_1fr_2fr] gap-4 items-start">
            {/* Tipo */}
            <div>
              <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-2">Tipo</p>
              <div className="flex flex-col gap-1.5">
                {TIPOS.map(t => (
                  <button key={t.value} onClick={() => setTipo(t.value)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-left border transition-all ${
                      tipo === t.value ? `${t.color} ${t.bg}` : 'text-gray-500 border-transparent hover:border-white/10 hover:text-white'
                    }`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Fecha */}
            <div>
              <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-2">Fecha</p>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
            </div>

            {/* Glosa */}
            <div>
              <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-2">Glosa</p>
              <input type="text" placeholder="Ej: Centralización sueldos mayo 2026..."
                value={glosa} onChange={e => setGlosa(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
            </div>
          </div>

          {/* LÍNEAS */}
          <div className="bg-black/20 rounded-xl border border-white/5 p-4">
            <div className="grid grid-cols-[1fr_110px_110px_36px] gap-2 mb-2 px-1">
              <span className="text-[10px] text-gray-600 font-black uppercase tracking-widest">Cuenta</span>
              <span className="text-[10px] text-gray-600 font-black uppercase tracking-widest text-right">Debe</span>
              <span className="text-[10px] text-gray-600 font-black uppercase tracking-widest text-right">Haber</span>
              <span />
            </div>

            {lineas.map(l => (
              <div key={l.id} className="grid grid-cols-[1fr_110px_110px_36px] gap-2 mb-2 items-center">
                <Select value={l.cuenta} onValueChange={val => setCuenta(l.id, val)}>
                  <SelectTrigger className="bg-slate-900/80 border-white/10 text-xs text-white h-9">
                    <SelectValue placeholder="Seleccionar cuenta...">
                      {l.cuenta
                        ? <span className="font-mono">{l.cuenta} — {l.nombre || getNombre(l.cuenta)}</span>
                        : <span className="text-gray-500">Seleccionar cuenta...</span>}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-white/10 text-white max-h-[260px] overflow-y-auto z-50">
                    {plan.map(c => (
                      <SelectItem key={c.codigo} value={c.codigo} className="text-xs">
                        <span className="font-mono text-blue-400">{c.codigo}</span>
                        <span className="ml-2 text-gray-300">{c.descripcion}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <input type="number" min="0" placeholder="0" value={l.debe}
                  onChange={e => setMonto(l.id, 'debe', e.target.value)}
                  className="w-full bg-slate-900/80 border border-white/10 rounded px-3 py-2 text-xs text-right text-emerald-400 font-mono focus:outline-none focus:border-emerald-500" />

                <input type="number" min="0" placeholder="0" value={l.haber}
                  onChange={e => setMonto(l.id, 'haber', e.target.value)}
                  className="w-full bg-slate-900/80 border border-white/10 rounded px-3 py-2 text-xs text-right text-orange-400 font-mono focus:outline-none focus:border-orange-500" />

                <button onClick={() => eliminarLinea(l.id)} disabled={lineas.length <= 2}
                  className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors disabled:opacity-20 flex items-center justify-center">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}

            <Button onClick={agregarLinea} variant="outline" size="sm"
              className="mt-3 bg-transparent border-dashed border-white/20 text-blue-400 hover:text-blue-300 hover:border-blue-400 w-full text-xs font-bold hover:bg-transparent">
              <Plus size={13} className="mr-1" /> AÑADIR LÍNEA
            </Button>
          </div>
        </div>

        {/* FOOTER */}
        <DialogFooter className="mt-4 flex-col sm:flex-row justify-between items-center bg-black/40 p-4 rounded-xl border border-white/5 gap-3">
          <div className="flex items-center gap-6">
            <div>
              <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Debe</p>
              <p className="text-lg font-mono font-bold text-emerald-400">${totales.debe.toLocaleString('es-CL')}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Haber</p>
              <p className="text-lg font-mono font-bold text-orange-400">${totales.haber.toLocaleString('es-CL')}</p>
            </div>
            {totales.debe > 0 && !cuadrado && (
              <div className="flex items-center gap-2 text-red-400 bg-red-400/10 px-3 py-1.5 rounded-lg border border-red-400/20">
                <AlertCircle size={13} />
                <span className="text-xs font-bold">DESCUADRE ${Math.abs(totales.diff).toLocaleString('es-CL')}</span>
              </div>
            )}
            {cuadrado && (
              <span className="text-xs font-black text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
                ✓ CUADRADO
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => { reset(); setIsOpen(false); }} className="text-gray-400 hover:text-white">
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={!valido || isSaving}
              className={`font-black uppercase text-xs tracking-widest ${valido ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-gray-800 text-gray-500'}`}>
              {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              GUARDAR ASIENTO
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NuevoAsientoModal;
