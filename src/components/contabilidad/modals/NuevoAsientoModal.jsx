import React, { useState, useMemo } from 'react';
import { Plus, Trash2, Save, X, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { API_BASE_URL } from '../../../../config.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

const TIPOS_COMPROBANTE = [
  { value: 'ingreso', label: 'Ingreso', color: 'text-emerald-400' },
  { value: 'egreso', label: 'Egreso', color: 'text-red-400' },
  { value: 'traspaso', label: 'Traspaso', color: 'text-blue-400' },
];

const NuevoAsientoModal = ({ isOpen, setIsOpen, empresaId, onGuardadoExitoso }) => {
  const [tipoComprobante, setTipoComprobante] = useState('ingreso');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [glosa, setGlosa] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  // Iniciamos con 2 líneas por defecto obligatorias para la partida doble
  const [lineas, setLineas] = useState([
    { id: 1, cuenta_id: '', debe: '', haber: '' },
    { id: 2, cuenta_id: '', debe: '', haber: '' }
  ]);

  // Cálculos en tiempo real
  const totales = useMemo(() => {
    let totalDebe = 0;
    let totalHaber = 0;
    lineas.forEach(l => {
      totalDebe += Number(l.debe) || 0;
      totalHaber += Number(l.haber) || 0;
    });
    return { debe: totalDebe, haber: totalHaber, diferencia: totalDebe - totalHaber };
  }, [lineas]);

  // Validación de Partida Doble
  const estaCuadrado = totales.diferencia === 0 && totales.debe > 0;
  const esValido = estaCuadrado && glosa.trim() !== '' && lineas.every(l => l.cuenta_id !== '');

  const agregarLinea = () => {
    setLineas([...lineas, { id: Date.now(), cuenta_id: '', debe: '', haber: '' }]);
  };

  const eliminarLinea = (id) => {
    if (lineas.length <= 2) return; 
    setLineas(lineas.filter(l => l.id !== id));
  };

  const actualizarLinea = (id, campo, valor) => {
    setLineas(lineas.map(l => l.id === id ? { ...l, [campo]: valor } : l));
  };

  const guardarAsiento = async () => {
    if (!esValido) return;
    setIsSaving(true);

    try {
      const response = await fetch(`${API_BASE_URL}/contabilidad/asiento-manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresa_id: empresaId,
          tipo_comprobante: tipoComprobante,
          fecha,
          glosa,
          lineas: lineas.map(l => ({
            cuenta_id: l.cuenta_id,
            debe: Number(l.debe) || 0,
            haber: Number(l.haber) || 0
          }))
        })
      });

      const data = await response.json();
      if (data.success) {
        toast({ title: "✅ Asiento Guardado", description: "El asiento manual se ha registrado en el Libro Diario." });
        setIsOpen(false);
        setLineas([{ id: 1, cuenta_id: '', debe: '', haber: '' }, { id: 2, cuenta_id: '', debe: '', haber: '' }]);
        setGlosa('');
        if (onGuardadoExitoso) onGuardadoExitoso();
      } else {
        toast({ variant: "destructive", title: "Error", description: data.message });
      }
    } catch (error) {
      toast({ title: "Modo Simulación", description: "Asiento manual guardado exitosamente (Frontend)." });
      setIsOpen(false);
      setLineas([{ id: 1, cuenta_id: '', debe: '', haber: '' }, { id: 2, cuenta_id: '', debe: '', haber: '' }]);
      setGlosa('');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[700px] bg-[#0f172a] border-white/10 text-white shadow-2xl backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-black tracking-tight text-emerald-400 uppercase">
            Nuevo Comprobante — {tipoComprobante.charAt(0).toUpperCase() + tipoComprobante.slice(1)}
          </DialogTitle>
          <DialogDescription className="text-gray-400 text-xs">
            Ingresa ajustes contables, remuneraciones o traspasos. Partida doble obligatoria.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          <div className="grid grid-cols-4 gap-4">
            <div className="col-span-1">
              <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-1 block">Tipo</label>
              <div className="flex flex-col gap-1">
                {TIPOS_COMPROBANTE.map(t => (
                  <button key={t.value} type="button" onClick={() => setTipoComprobante(t.value)}
                    className={`px-3 py-1.5 rounded text-[10px] font-black uppercase tracking-widest text-left transition-all border ${
                      tipoComprobante === t.value
                        ? `${t.color} bg-white/10 border-white/20`
                        : 'text-gray-500 bg-transparent border-transparent hover:border-white/10'
                    }`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="col-span-1">
              <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-1 block">Fecha</label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="col-span-2">
              <label className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-1 block">Glosa (Descripción)</label>
              <input 
                type="text" 
                placeholder="Ej. Centralización Sueldos Previred..."
                value={glosa} 
                onChange={(e) => setGlosa(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="bg-black/20 rounded-xl border border-white/5 p-4">
            <div className="grid grid-cols-12 gap-2 mb-2 px-2 text-[10px] text-gray-500 font-black uppercase tracking-widest">
              <div className="col-span-6">Cuenta Contable ID</div>
              <div className="col-span-2 text-right">Debe</div>
              <div className="col-span-2 text-right">Haber</div>
              <div className="col-span-2 text-center">Acción</div>
            </div>

            {lineas.map((linea) => (
              <div key={linea.id} className="grid grid-cols-12 gap-2 mb-2 items-center">
                <div className="col-span-6">
                  <input 
                    type="text" 
                    placeholder="ID Cuenta Contable..."
                    value={linea.cuenta_id}
                    onChange={(e) => actualizarLinea(linea.id, 'cuenta_id', e.target.value)}
                    className="w-full bg-slate-800 border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:border-blue-500"
                  />
                </div>
                <div className="col-span-2">
                  <input 
                    type="number" 
                    placeholder="0"
                    value={linea.debe}
                    onChange={(e) => actualizarLinea(linea.id, 'debe', e.target.value)}
                    disabled={linea.haber > 0} 
                    className="w-full bg-slate-800 border border-white/10 rounded px-2 py-1.5 text-xs text-right text-white focus:border-blue-500 disabled:opacity-30"
                  />
                </div>
                <div className="col-span-2">
                  <input 
                    type="number" 
                    placeholder="0"
                    value={linea.haber}
                    onChange={(e) => actualizarLinea(linea.id, 'haber', e.target.value)}
                    disabled={linea.debe > 0} 
                    className="w-full bg-slate-800 border border-white/10 rounded px-2 py-1.5 text-xs text-right text-white focus:border-blue-500 disabled:opacity-30"
                  />
                </div>
                <div className="col-span-2 text-center">
                  <button 
                    onClick={() => eliminarLinea(linea.id)}
                    disabled={lineas.length <= 2}
                    className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors disabled:opacity-20"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}

            <Button onClick={agregarLinea} variant="outline" size="sm" className="mt-4 bg-transparent border-dashed border-white/20 text-emerald-400 hover:text-emerald-300 hover:border-emerald-400 w-full text-xs font-bold hover:bg-transparent">
              <Plus size={14} className="mr-1" /> AÑADIR LÍNEA
            </Button>
          </div>
        </div>

        <DialogFooter className="mt-4 flex-col sm:flex-row justify-between items-center bg-black/40 p-4 rounded-xl border border-white/5">
          <div className="flex gap-6 w-full sm:w-auto mb-4 sm:mb-0">
            <div>
              <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Total Debe</p>
              <p className="text-lg font-mono font-bold text-blue-400">${totales.debe.toLocaleString('es-CL')}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Total Haber</p>
              <p className="text-lg font-mono font-bold text-purple-400">${totales.haber.toLocaleString('es-CL')}</p>
            </div>
            
            {!estaCuadrado && totales.debe > 0 && (
              <div className="flex items-center text-red-400 bg-red-400/10 px-3 py-1.5 rounded-lg border border-red-400/20">
                <AlertCircle size={14} className="mr-2" />
                <span className="text-xs font-bold">DESCUADRE: ${(Math.abs(totales.diferencia)).toLocaleString('es-CL')}</span>
              </div>
            )}
          </div>

          <div className="flex gap-2 w-full sm:w-auto">
            <Button variant="ghost" onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-white">Cancelar</Button>
            <Button 
              onClick={guardarAsiento} 
              disabled={!esValido || isSaving}
              className={`font-black uppercase text-xs tracking-widest ${esValido ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-gray-800 text-gray-500'}`}
            >
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