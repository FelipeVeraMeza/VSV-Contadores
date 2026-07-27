import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DownloadCloud, RefreshCcw, CalendarDays, AlertCircle, ChevronRight } from 'lucide-react';

const MESES = [
  { value: '01', label: 'Enero' }, { value: '02', label: 'Febrero' },
  { value: '03', label: 'Marzo' }, { value: '04', label: 'Abril' },
  { value: '05', label: 'Mayo' }, { value: '06', label: 'Junio' },
  { value: '07', label: 'Julio' }, { value: '08', label: 'Agosto' },
  { value: '09', label: 'Septiembre' }, { value: '10', label: 'Octubre' },
  { value: '11', label: 'Noviembre' }, { value: '12', label: 'Diciembre' }
];
const ANIOS = ['2023', '2024', '2025', '2026', '2027'];

const SyncSIIModal = ({ isOpen, setIsOpen, onSync, isSyncing, empresaNombre }) => {
  const now = new Date();
  const mesActual = (now.getMonth() + 1).toString().padStart(2, '0');
  const anioActual = now.getFullYear().toString();

  const [mesDesde, setMesDesde] = useState(mesActual);
  const [anioDesde, setAnioDesde] = useState(anioActual);
  const [mesHasta, setMesHasta] = useState(mesActual);
  const [anioHasta, setAnioHasta] = useState(anioActual);

  const totalMeses = useMemo(() => {
    const desde = parseInt(anioDesde) * 12 + parseInt(mesDesde);
    const hasta = parseInt(anioHasta) * 12 + parseInt(mesHasta);
    return hasta - desde + 1;
  }, [mesDesde, anioDesde, mesHasta, anioHasta]);

  const esValido = totalMeses >= 1 && totalMeses <= 36;
  const desdeStr = `${MESES.find(m => m.value === mesDesde)?.label} ${anioDesde}`;
  const hastaStr = `${MESES.find(m => m.value === mesHasta)?.label} ${anioHasta}`;

  const handleEjecutar = () => {
    onSync({ mesDesde, anioDesde, mesHasta, anioHasta });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!isSyncing) setIsOpen(open); }}>
      <DialogContent className="sm:max-w-[480px] bg-white border-[#efe8dd] text-slate-700 shadow-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <DownloadCloud className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <DialogTitle className="text-lg font-black tracking-tight uppercase text-blue-600">
                Extraer Datos del SII
              </DialogTitle>
              <DialogDescription className="text-slate-500 text-xs mt-0.5">
                {empresaNombre ? `Empresa: ${empresaNombre}` : 'Selecciona el rango de períodos a sincronizar'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* DESDE */}
          <div className="bg-slate-50 rounded-xl border border-[#efe8dd] p-4">
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-3 flex items-center gap-2">
              <CalendarDays className="h-3 w-3" /> Desde
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1.5 block">Mes</label>
                <select
                  value={mesDesde}
                  onChange={(e) => setMesDesde(e.target.value)}
                  className="w-full bg-slate-50 border border-[#efe8dd] rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500 appearance-none"
                >
                  {MESES.map(m => (
                    <option key={m.value} value={m.value} className="bg-white">{m.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1.5 block">Año</label>
                <select
                  value={anioDesde}
                  onChange={(e) => setAnioDesde(e.target.value)}
                  className="w-full bg-slate-50 border border-[#efe8dd] rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500 appearance-none"
                >
                  {ANIOS.map(a => (
                    <option key={a} value={a} className="bg-white">{a}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* FLECHA */}
          <div className="flex items-center justify-center">
            <div className="flex items-center gap-2 text-slate-400">
              <div className="h-px w-12 bg-slate-100" />
              <ChevronRight className="h-4 w-4" />
              <div className="h-px w-12 bg-slate-100" />
            </div>
          </div>

          {/* HASTA */}
          <div className="bg-slate-50 rounded-xl border border-[#efe8dd] p-4">
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-3 flex items-center gap-2">
              <CalendarDays className="h-3 w-3" /> Hasta
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1.5 block">Mes</label>
                <select
                  value={mesHasta}
                  onChange={(e) => setMesHasta(e.target.value)}
                  className="w-full bg-slate-50 border border-[#efe8dd] rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500 appearance-none"
                >
                  {MESES.map(m => (
                    <option key={m.value} value={m.value} className="bg-white">{m.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1.5 block">Año</label>
                <select
                  value={anioHasta}
                  onChange={(e) => setAnioHasta(e.target.value)}
                  className="w-full bg-slate-50 border border-[#efe8dd] rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500 appearance-none"
                >
                  {ANIOS.map(a => (
                    <option key={a} value={a} className="bg-white">{a}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* RESUMEN DEL RANGO */}
          {totalMeses >= 1 && totalMeses <= 36 ? (
            <div className="flex items-center gap-3 bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3">
              <CalendarDays className="h-4 w-4 text-blue-600 flex-shrink-0" />
              <div>
                <p className="text-xs font-black text-blue-600 uppercase tracking-widest">
                  {desdeStr} → {hastaStr}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {totalMeses} {totalMeses === 1 ? 'período' : 'períodos'} — el robot extraerá compras y ventas de cada mes
                </p>
              </div>
            </div>
          ) : totalMeses < 1 ? (
            <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
              <p className="text-xs font-black text-red-500">La fecha "Hasta" debe ser igual o posterior a "Desde"</p>
            </div>
          ) : (
            <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
              <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0" />
              <p className="text-xs font-black text-amber-600">El rango máximo es 36 meses. Reduce el período seleccionado.</p>
            </div>
          )}

          {/* ADVERTENCIA ROBOT */}
          {esValido && totalMeses > 6 && (
            <div className="text-[10px] text-slate-400 font-bold text-center">
              ⏱ Rangos largos pueden tardar varios minutos. No cierres el navegador.
            </div>
          )}
        </div>

        <DialogFooter className="mt-4 flex gap-2">
          <Button
            variant="ghost"
            onClick={() => setIsOpen(false)}
            disabled={isSyncing}
            className="text-slate-500 hover:text-slate-900"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleEjecutar}
            disabled={!esValido || isSyncing}
            className={`font-black uppercase text-xs tracking-widest flex-1 ${
              esValido && !isSyncing
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'bg-slate-50 text-slate-400'
            }`}
          >
            {isSyncing
              ? <><RefreshCcw className="h-4 w-4 mr-2 animate-spin" /> Extrayendo datos...</>
              : <><DownloadCloud className="h-4 w-4 mr-2" /> Iniciar Extracción</>
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SyncSIIModal;
