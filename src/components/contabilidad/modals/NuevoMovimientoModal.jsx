import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Plus, Trash2, Save, Loader2, AlertCircle, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { fetchWithAuth } from '@/services/apiClient';
import { API_BASE_URL } from '../../../../config.js';

const TIPOS_DOCUMENTO = [
  { value: '33', label: 'Factura Electrónica' },
  { value: '34', label: 'Factura Exenta' },
  { value: '61', label: 'Nota de Crédito' },
  { value: '56', label: 'Nota de Débito' },
  { value: '39', label: 'Boleta Electrónica' },
  { value: 'HON', label: 'Boleta de Honorarios' },
  { value: 'OTRO', label: 'Otro' },
];

const TIPO_LABEL = { ventas: 'Venta', compras: 'Compra', honorarios: 'Honorario' };

const DEFAULTS = {
  compras: [
    { cuenta: '4201-08', nombre: 'GASTOS GENERALES',   debe: '', haber: '' },
    { cuenta: '1108-02', nombre: 'IVA CREDITO FISCAL', debe: '', haber: '' },
    { cuenta: '2116-01', nombre: 'FACTURAS POR PAGAR', debe: '', haber: '' },
  ],
  ventas: [
    { cuenta: '1104-01', nombre: 'DEUDORES CLIENTES',  debe: '', haber: '' },
    { cuenta: '5101-01', nombre: 'VENTAS',             debe: '', haber: '' },
    { cuenta: '2108-02', nombre: 'IVA DEBITO FISCAL',  debe: '', haber: '' },
  ],
  honorarios: [
    { cuenta: '4201-02', nombre: 'HONORARIOS PROFESIONALES', debe: '', haber: '' },
    { cuenta: '2105-04', nombre: 'HONORARIOS POR PAGAR',     debe: '', haber: '' },
  ],
};

const makeLineas = (tipo) =>
  (DEFAULTS[tipo] || DEFAULTS.compras).map((l, i) => ({ ...l, id: i + 1 }));

const NuevoMovimientoModal = ({ isOpen, setIsOpen, tipo, empresaId, onGuardado }) => {
  const { user } = useAuth();
  const [rut, setRut]           = useState('');
  const [nombre, setNombre]     = useState('');
  const [tipoDoc, setTipoDoc]   = useState('33');
  const [folio, setFolio]       = useState('');
  const [fecha, setFecha]       = useState(new Date().toISOString().split('T')[0]);
  const [descripcion, setDescripcion] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [lineas, setLineas]     = useState(() => makeLineas(tipo));
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [rutQuery, setRutQuery] = useState('');
  const rutInputRef = useRef(null);
  const suggestionsRef = useRef(null);

  // Buscador CRM solo activo en vista global (sin empresa específica seleccionada),
  // para cualquier tipo: compra, venta u honorario.
  const crmHabilitado = !empresaId || empresaId === 'ALL';

  // Reiniciar líneas si cambia el tipo
  useEffect(() => { setLineas(makeLineas(tipo)); }, [tipo]);

  // Cerrar sugerencias al hacer click fuera
  useEffect(() => {
    const handler = (e) => {
      if (rutInputRef.current && !rutInputRef.current.contains(e.target) &&
          suggestionsRef.current && !suggestionsRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Clientes CRM (solo en vista global, para ventas)
  const { data: crmData } = useQuery({
    queryKey: ['crm-clientes'],
    queryFn: async () => {
      const res = await fetchWithAuth('/clientes/crm', user.sessionId);
      if (!res.ok) return [];
      const data = await res.json();
      return data.clients || data.clientes || (Array.isArray(data) ? data : []);
    },
    enabled: isOpen && crmHabilitado && !!user?.sessionId,
    staleTime: 300000,
  });

  const sugerenciasCRM = useMemo(() => {
    if (!Array.isArray(crmData) || !rutQuery.trim()) return [];
    const q = rutQuery.toLowerCase().replace(/[.\-]/g, '');
    return crmData.filter(c => {
      const rutClean = (c.rut || '').toLowerCase().replace(/[.\-]/g, '');
      const nombre  = (c.razonSocial || c.razon_social || '').toLowerCase();
      return rutClean.includes(q) || nombre.includes(q);
    }).slice(0, 8);
  }, [crmData, rutQuery]);

  const seleccionarCRM = (cliente) => {
    setRut(cliente.rut || '');
    setNombre(cliente.razonSocial || cliente.razon_social || '');
    setRutQuery(cliente.rut || '');
    setShowSuggestions(false);
  };

  // Plan de cuentas para el selector
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
  const plan = useMemo(() => (planData?.plan || []).filter(c => c.codigo?.includes('-')), [planData]);
  const getNombre = (codigo) => plan.find(c => c.codigo === codigo)?.descripcion || '';

  // ── Cálculo automático de IVA (19%) ───────────────────────────
  // Clasifica cada línea para repartir neto / IVA / total automáticamente.
  const esLineaIva = (l) =>
    /IVA/i.test(l.nombre || '') || ['1108-02', '2108-02'].includes(l.cuenta);
  const esLineaContrapartida = (l) => {
    const n = (l.nombre || '').toUpperCase();
    if (tipo === 'compras') return /POR PAGAR|PROVEEDOR/.test(n) || l.cuenta === '2116-01';
    if (tipo === 'ventas')  return /DEUDOR|CLIENTE/.test(n)     || l.cuenta === '1104-01';
    return false;
  };
  const esLineaNeto = (l) => !!l.cuenta && !esLineaIva(l) && !esLineaContrapartida(l);

  // Lado contable de cada concepto según el tipo de movimiento
  const ladoNeto  = tipo === 'compras' ? 'debe'  : 'haber'; // gasto/venta + IVA
  const ladoTotal = tipo === 'compras' ? 'haber' : 'debe';  // por pagar / deudores
  const setLado = (l, lado, monto) => ({ ...l, [lado]: monto, [lado === 'debe' ? 'haber' : 'debe']: '' });

  // Lado correcto donde debe ir el monto de una cuenta (null = ambos libres).
  // Bloquea el lado equivocado para que el asiento no se descuadre.
  const ladoDeLinea = (l) => {
    if (tipo !== 'ventas' && tipo !== 'compras') return null; // honorarios: libre
    if (!l.cuenta) return null;                               // sin cuenta aún
    return esLineaContrapartida(l) ? ladoTotal : ladoNeto;
  };

  // A partir del NETO (suma de cuentas de gasto/venta) rellena IVA y total.
  const distribuirDesdeNeto = (arr) => {
    const neto = arr.filter(esLineaNeto)
      .reduce((s, l) => s + (Number(l.debe) || 0) + (Number(l.haber) || 0), 0);
    if (neto <= 0) return arr;
    const iva = Math.round(neto * 0.19);
    return arr.map(l =>
      esLineaIva(l)           ? setLado(l, ladoNeto,  iva) :
      esLineaContrapartida(l) ? setLado(l, ladoTotal, neto + iva) : l
    );
  };

  // A partir del TOTAL (cuenta deudores/por pagar) desglosa neto e IVA hacia atrás.
  const distribuirDesdeTotal = (arr, total) => {
    if (total <= 0) return arr;
    const neto = Math.round(total / 1.19);
    const iva  = total - neto;
    let netoSet = false;
    return arr.map(l => {
      if (esLineaIva(l)) return setLado(l, ladoNeto, iva);
      if (esLineaNeto(l) && !netoSet) { netoSet = true; return setLado(l, ladoNeto, neto); }
      return l;
    });
  };

  const totales = useMemo(() => {
    const debe  = lineas.reduce((s, l) => s + (Number(l.debe)  || 0), 0);
    const haber = lineas.reduce((s, l) => s + (Number(l.haber) || 0), 0);
    return { debe, haber, diferencia: debe - haber };
  }, [lineas]);

  const estaCuadrado = totales.diferencia === 0 && totales.debe > 0;
  const esValido     = estaCuadrado && rut.trim() && folio.trim();

  const agregarLinea = () =>
    setLineas(prev => [...prev, { id: Date.now(), cuenta: '', nombre: '', debe: '', haber: '' }]);

  const eliminarLinea = (id) => {
    if (lineas.length <= 2) return;
    setLineas(prev => prev.filter(l => l.id !== id));
  };

  const actualizarCuenta = (id, codigo) => {
    const nombre = getNombre(codigo);
    setLineas(prev => prev.map(l => l.id === id ? { ...l, cuenta: codigo, nombre } : l));
  };

  const actualizarMonto = (id, campo, valor) =>
    setLineas(prev => {
      const next = prev.map(l => l.id === id ? { ...l, [campo]: valor } : l);
      if (tipo !== 'ventas' && tipo !== 'compras') return next;
      const editada = next.find(l => l.id === id);
      // Neto (gasto/venta) → calcula IVA y total. Total (deudores/por pagar) → desglosa.
      // IVA editado directamente → se respeta el valor manual.
      if (esLineaNeto(editada))          return distribuirDesdeNeto(next);
      if (esLineaContrapartida(editada)) return distribuirDesdeTotal(next, Number(editada[ladoTotal]) || 0);
      return next;
    });

  const resetForm = () => {
    setRut(''); setNombre(''); setTipoDoc('33'); setFolio('');
    setFecha(new Date().toISOString().split('T')[0]); setDescripcion('');
    setLineas(makeLineas(tipo));
    setRutQuery(''); setShowSuggestions(false);
  };

  const handleGuardar = async () => {
    if (!esValido) return;
    setIsSaving(true);
    try {
      const res = await fetchWithAuth('/dte-consulta/movimiento', user.sessionId, {
        method: 'POST',
        body: {
          empresa_id: empresaId, tipo_movimiento: tipo,
          rut, nombre, tipo_documento: tipoDoc, folio, fecha, descripcion,
          lineas: lineas.map(l => ({
            numero_cuenta: l.cuenta, nombre_cuenta: l.nombre,
            debe: Number(l.debe) || 0, haber: Number(l.haber) || 0,
          })),
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar');
      toast({ title: `✅ ${TIPO_LABEL[tipo]} registrada`, description: 'Aparece en la lista de movimientos.' });
      resetForm();
      setIsOpen(false);
      if (onGuardado) onGuardado();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  const tLabel = TIPO_LABEL[tipo] || 'Movimiento';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) resetForm(); setIsOpen(open); }}>
      <DialogContent className="sm:max-w-[820px] bg-white border-[#efe8dd] text-slate-700 shadow-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-black tracking-tight text-blue-600 uppercase">
            Nueva {tLabel}
          </DialogTitle>
          <DialogDescription className="text-slate-500 text-xs">
            Registra el documento y su asiento contable.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* DATOS DEL DOCUMENTO */}
          <div className="bg-slate-50 rounded-xl border border-[#efe8dd] p-4 space-y-4">
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Datos del Documento</p>

            <div className="grid grid-cols-2 gap-4">
              <div className="relative" ref={rutInputRef}>
                <label className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1.5 block">
                  RUT {tipo === 'compras' ? 'Proveedor' : 'Cliente'}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Ej: 76.123.456-7"
                    value={crmHabilitado ? rutQuery : rut}
                    onChange={e => {
                      if (crmHabilitado) {
                        setRutQuery(e.target.value);
                        setRut(e.target.value);
                        setNombre('');
                        setShowSuggestions(true);
                      } else {
                        setRut(e.target.value);
                      }
                    }}
                    onFocus={() => crmHabilitado && rutQuery && setShowSuggestions(true)}
                    className="w-full bg-slate-50 border border-[#efe8dd] rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500 transition-colors pr-8"
                  />
                  {crmHabilitado && (
                    <Search size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  )}
                </div>
                {/* Dropdown sugerencias CRM */}
                {crmHabilitado && showSuggestions && sugerenciasCRM.length > 0 && (
                  <div ref={suggestionsRef} className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-[#efe8dd] rounded-lg shadow-2xl overflow-hidden max-h-52 overflow-y-auto">
                    {sugerenciasCRM.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onMouseDown={() => seleccionarCRM(c)}
                        className="w-full text-left px-3 py-2 hover:bg-blue-500/20 transition-colors border-b border-[#efe8dd] last:border-0"
                      >
                        <p className="text-xs font-mono text-blue-600">{c.rut}</p>
                        <p className="text-xs text-slate-600 truncate">{c.razonSocial || c.razon_social}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1.5 block">
                  {tipo === 'compras' ? 'Nombre del Proveedor' : 'Nombre del Cliente'}
                </label>
                <input type="text" placeholder="Razón social" value={nombre}
                  onChange={e => setNombre(e.target.value)}
                  className="w-full bg-slate-50 border border-[#efe8dd] rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500 transition-colors" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1.5 block">Tipo Documento</label>
                <select value={tipoDoc} onChange={e => setTipoDoc(e.target.value)}
                  className="w-full bg-slate-50 border border-[#efe8dd] rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500 appearance-none transition-colors">
                  {TIPOS_DOCUMENTO.map(t => (
                    <option key={t.value} value={t.value} className="bg-white">{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1.5 block">Folio</label>
                <input type="text" placeholder="Nº de folio" value={folio}
                  onChange={e => setFolio(e.target.value)}
                  className="w-full bg-slate-50 border border-[#efe8dd] rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500 transition-colors" />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1.5 block">Fecha</label>
                <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                  className="w-full bg-slate-50 border border-[#efe8dd] rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500 transition-colors" />
              </div>
            </div>

            <div>
              <label className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1.5 block">Glosa / Descripción</label>
              <input type="text" placeholder="Ej: Compra materiales oficina" value={descripcion}
                onChange={e => setDescripcion(e.target.value)}
                className="w-full bg-slate-50 border border-[#efe8dd] rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500 transition-colors" />
            </div>
          </div>

          {/* ASIENTO CONTABLE */}
          <div className="bg-slate-50 rounded-xl border border-[#efe8dd] p-4">
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-4">Asiento Contable — Partida Doble</p>

            {/* Header */}
            <div className="grid grid-cols-[1fr_120px_120px_36px] gap-2 mb-2 px-1">
              <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Cuenta</span>
              <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest text-right">Debe</span>
              <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest text-right">Haber</span>
              <span />
            </div>

            {lineas.map((linea) => {
              const lado = ladoDeLinea(linea);
              const debeOff  = lado === 'haber';
              const haberOff = lado === 'debe';
              return (
              <div key={linea.id} className="grid grid-cols-[1fr_120px_120px_36px] gap-2 mb-2 items-center">
                {/* Selector de cuenta */}
                <Select value={linea.cuenta} onValueChange={val => actualizarCuenta(linea.id, val)}>
                  <SelectTrigger className="bg-white border-[#efe8dd] text-xs text-slate-900 h-9 w-full">
                    <SelectValue placeholder="Seleccionar cuenta...">
                      {linea.cuenta
                        ? <span className="font-mono">{linea.cuenta} — {linea.nombre || getNombre(linea.cuenta)}</span>
                        : <span className="text-slate-400">Seleccionar cuenta...</span>}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-white border-[#efe8dd] text-slate-700 max-h-[260px] overflow-y-auto z-50">
                    {plan.map(c => (
                      <SelectItem key={c.codigo} value={c.codigo} className="text-xs">
                        <span className="font-mono text-blue-600">{c.codigo}</span>
                        <span className="ml-2 text-slate-600">{c.descripcion}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Debe */}
                <input type="number" min="0" placeholder={debeOff ? '—' : '0'} value={linea.debe}
                  disabled={debeOff}
                  onChange={e => actualizarMonto(linea.id, 'debe', e.target.value)}
                  className="w-full bg-white border border-[#efe8dd] rounded px-3 py-2 text-xs text-right text-emerald-600 font-mono focus:outline-none focus:border-emerald-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed" />

                {/* Haber */}
                <input type="number" min="0" placeholder={haberOff ? '—' : '0'} value={linea.haber}
                  disabled={haberOff}
                  onChange={e => actualizarMonto(linea.id, 'haber', e.target.value)}
                  className="w-full bg-white border border-[#efe8dd] rounded px-3 py-2 text-xs text-right text-orange-600 font-mono focus:outline-none focus:border-orange-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed" />

                {/* Eliminar */}
                <button onClick={() => eliminarLinea(linea.id)} disabled={lineas.length <= 2}
                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-400/10 rounded transition-colors disabled:opacity-20 flex items-center justify-center">
                  <Trash2 size={13} />
                </button>
              </div>
              );
            })}

            <Button onClick={agregarLinea} variant="outline" size="sm"
              className="mt-3 bg-transparent border-dashed border-[#efe8dd] text-blue-600 hover:text-blue-700 hover:border-blue-400 w-full text-xs font-bold hover:bg-transparent">
              <Plus size={13} className="mr-1" /> AÑADIR LÍNEA
            </Button>
          </div>
        </div>

        {/* FOOTER */}
        <DialogFooter className="mt-4 flex-col sm:flex-row justify-between items-center bg-slate-50 p-4 rounded-xl border border-[#efe8dd] gap-4">
          <div className="flex gap-6 w-full sm:w-auto">
            <div>
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Debe</p>
              <p className="text-lg font-mono font-bold text-emerald-600">${totales.debe.toLocaleString('es-CL')}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Haber</p>
              <p className="text-lg font-mono font-bold text-orange-600">${totales.haber.toLocaleString('es-CL')}</p>
            </div>
            {totales.debe > 0 && !estaCuadrado && (
              <div className="flex items-center gap-2 text-red-500 bg-red-400/10 px-3 py-1.5 rounded-lg border border-red-400/20">
                <AlertCircle size={13} />
                <span className="text-xs font-bold">DESCUADRE ${Math.abs(totales.diferencia).toLocaleString('es-CL')}</span>
              </div>
            )}
            {estaCuadrado && (
              <div className="flex items-center gap-2 text-emerald-600 bg-emerald-400/10 px-3 py-1.5 rounded-lg border border-emerald-400/20">
                <span className="text-xs font-bold">✓ CUADRADO</span>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => { resetForm(); setIsOpen(false); }} className="text-slate-500 hover:text-slate-900">
              Cancelar
            </Button>
            <Button onClick={handleGuardar} disabled={!esValido || isSaving}
              className={`font-black uppercase text-xs tracking-widest ${esValido ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-slate-50 text-slate-400'}`}>
              {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              GUARDAR {tLabel.toUpperCase()}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NuevoMovimientoModal;
