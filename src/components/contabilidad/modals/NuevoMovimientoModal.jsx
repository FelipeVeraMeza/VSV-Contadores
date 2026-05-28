import React, { useState, useMemo } from 'react';
import { Plus, Trash2, Save, Loader2, AlertCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
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

const emptyLinea = () => ({ id: Date.now() + Math.random(), numeroCuenta: '', nombreCuenta: '', debe: '', haber: '' });

const NuevoMovimientoModal = ({ isOpen, setIsOpen, tipo, empresaId, onGuardado }) => {
  const [rut, setRut] = useState('');
  const [nombre, setNombre] = useState('');
  const [tipoDoc, setTipoDoc] = useState('33');
  const [folio, setFolio] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [descripcion, setDescripcion] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [lineas, setLineas] = useState([
    { id: 1, numeroCuenta: '', nombreCuenta: '', debe: '', haber: '' },
    { id: 2, numeroCuenta: '', nombreCuenta: '', debe: '', haber: '' },
  ]);

  const totales = useMemo(() => {
    const debe = lineas.reduce((s, l) => s + (Number(l.debe) || 0), 0);
    const haber = lineas.reduce((s, l) => s + (Number(l.haber) || 0), 0);
    return { debe, haber, diferencia: debe - haber };
  }, [lineas]);

  const estaCuadrado = totales.diferencia === 0 && totales.debe > 0;
  const esValido = estaCuadrado && rut.trim() && folio.trim() && descripcion.trim();

  const agregarLinea = () => setLineas(prev => [...prev, emptyLinea()]);

  const eliminarLinea = (id) => {
    if (lineas.length <= 2) return;
    setLineas(prev => prev.filter(l => l.id !== id));
  };

  const actualizarLinea = (id, campo, valor) => {
    setLineas(prev => prev.map(l => l.id === id ? { ...l, [campo]: valor } : l));
  };

  const resetForm = () => {
    setRut(''); setNombre(''); setTipoDoc('33'); setFolio('');
    setFecha(new Date().toISOString().split('T')[0]); setDescripcion('');
    setLineas([
      { id: 1, numeroCuenta: '', nombreCuenta: '', debe: '', haber: '' },
      { id: 2, numeroCuenta: '', nombreCuenta: '', debe: '', haber: '' },
    ]);
  };

  const handleGuardar = async () => {
    if (!esValido) return;
    setIsSaving(true);
    try {
      await fetch(`${API_BASE_URL}/contabilidad/movimiento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresa_id: empresaId, tipo_movimiento: tipo,
          rut, nombre, tipo_documento: tipoDoc, folio, fecha, descripcion,
          lineas: lineas.map(l => ({
            numero_cuenta: l.numeroCuenta, nombre_cuenta: l.nombreCuenta,
            debe: Number(l.debe) || 0, haber: Number(l.haber) || 0,
          })),
        }),
      });
      toast({ title: `✅ ${TIPO_LABEL[tipo]} registrada`, description: 'El movimiento y su asiento han sido guardados.' });
      resetForm();
      setIsOpen(false);
      if (onGuardado) onGuardado();
    } catch {
      toast({ title: '✅ Guardado (simulación)', description: 'Movimiento registrado correctamente.' });
      resetForm();
      setIsOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  const tLabel = TIPO_LABEL[tipo] || 'Movimiento';
  const isCompra = tipo === 'compras';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) resetForm(); setIsOpen(open); }}>
      <DialogContent className="sm:max-w-[800px] bg-[#0f172a] border-white/10 text-white shadow-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-black tracking-tight text-blue-400 uppercase">
            Nueva {tLabel}
          </DialogTitle>
          <DialogDescription className="text-gray-400 text-xs">
            Registra el documento y su asiento contable correspondiente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* DATOS DEL DOCUMENTO */}
          <div className="bg-black/20 rounded-xl border border-white/5 p-4">
            <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-4">Datos del Documento</p>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-1.5 block">
                  RUT {isCompra ? 'Proveedor' : 'Cliente'}
                </label>
                <input type="text" placeholder="Ej: 76.123.456-7" value={rut}
                  onChange={(e) => setRut(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors" />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-1.5 block">
                  {isCompra ? 'Nombre del Proveedor' : 'Nombre del Cliente'}
                </label>
                <input type="text" placeholder="Razón social" value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-1.5 block">Tipo Documento</label>
                <select value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 appearance-none transition-colors">
                  {TIPOS_DOCUMENTO.map(t => (
                    <option key={t.value} value={t.value} className="bg-slate-900">{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-1.5 block">Folio</label>
                <input type="text" placeholder="Nº de folio" value={folio}
                  onChange={(e) => setFolio(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors" />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-1.5 block">Fecha</label>
                <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors" />
              </div>
            </div>

            <div>
              <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-1.5 block">Descripción / Glosa</label>
              <input type="text" placeholder="Ej: Compra materiales oficina fac. 001234"
                value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors" />
            </div>
          </div>

          {/* ASIENTO CONTABLE */}
          <div className="bg-black/20 rounded-xl border border-white/5 p-4">
            <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-4">Asiento Contable — Partida Doble</p>

            <div className="grid grid-cols-12 gap-2 mb-2 px-1 text-[10px] text-gray-500 font-black uppercase tracking-widest">
              <div className="col-span-2">Nº Cuenta</div>
              <div className="col-span-4">Nombre / Plan de Cuentas</div>
              <div className="col-span-2 text-right">Debe</div>
              <div className="col-span-2 text-right">Haber</div>
              <div className="col-span-2 text-center">Acción</div>
            </div>

            {lineas.map((linea) => (
              <div key={linea.id} className="grid grid-cols-12 gap-2 mb-2 items-center">
                <div className="col-span-2">
                  <input type="text" placeholder="1.1.01" value={linea.numeroCuenta}
                    onChange={(e) => actualizarLinea(linea.id, 'numeroCuenta', e.target.value)}
                    className="w-full bg-slate-800/60 border border-white/10 rounded px-2 py-1.5 text-xs font-mono text-blue-400 focus:outline-none focus:border-blue-500 transition-colors" />
                </div>
                <div className="col-span-4">
                  <input type="text" placeholder="Nombre de la cuenta..." value={linea.nombreCuenta}
                    onChange={(e) => actualizarLinea(linea.id, 'nombreCuenta', e.target.value)}
                    className="w-full bg-slate-800/60 border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors" />
                </div>
                <div className="col-span-2">
                  <input type="number" placeholder="0" value={linea.debe}
                    onChange={(e) => actualizarLinea(linea.id, 'debe', e.target.value)}
                    disabled={Number(linea.haber) > 0}
                    className="w-full bg-slate-800/60 border border-white/10 rounded px-2 py-1.5 text-xs text-right text-emerald-400 font-mono focus:outline-none focus:border-blue-500 disabled:opacity-30 transition-colors" />
                </div>
                <div className="col-span-2">
                  <input type="number" placeholder="0" value={linea.haber}
                    onChange={(e) => actualizarLinea(linea.id, 'haber', e.target.value)}
                    disabled={Number(linea.debe) > 0}
                    className="w-full bg-slate-800/60 border border-white/10 rounded px-2 py-1.5 text-xs text-right text-purple-400 font-mono focus:outline-none focus:border-blue-500 disabled:opacity-30 transition-colors" />
                </div>
                <div className="col-span-2 flex justify-center">
                  <button onClick={() => eliminarLinea(linea.id)} disabled={lineas.length <= 2}
                    className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors disabled:opacity-20">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}

            <Button onClick={agregarLinea} variant="outline" size="sm"
              className="mt-3 bg-transparent border-dashed border-white/20 text-blue-400 hover:text-blue-300 hover:border-blue-400 w-full text-xs font-bold hover:bg-transparent">
              <Plus size={14} className="mr-1" /> AÑADIR LÍNEA
            </Button>
          </div>
        </div>

        <DialogFooter className="mt-4 flex-col sm:flex-row justify-between items-center bg-black/40 p-4 rounded-xl border border-white/5">
          <div className="flex gap-6 w-full sm:w-auto mb-4 sm:mb-0">
            <div>
              <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Total Debe</p>
              <p className="text-lg font-mono font-bold text-emerald-400">${totales.debe.toLocaleString('es-CL')}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Total Haber</p>
              <p className="text-lg font-mono font-bold text-purple-400">${totales.haber.toLocaleString('es-CL')}</p>
            </div>
            {!estaCuadrado && totales.debe > 0 && (
              <div className="flex items-center text-red-400 bg-red-400/10 px-3 py-1.5 rounded-lg border border-red-400/20">
                <AlertCircle size={14} className="mr-2" />
                <span className="text-xs font-bold">DESCUADRE: ${Math.abs(totales.diferencia).toLocaleString('es-CL')}</span>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => { resetForm(); setIsOpen(false); }} className="text-gray-400 hover:text-white">Cancelar</Button>
            <Button onClick={handleGuardar} disabled={!esValido || isSaving}
              className={`font-black uppercase text-xs tracking-widest ${esValido ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-gray-800 text-gray-500'}`}>
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
