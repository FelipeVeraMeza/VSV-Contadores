import React, { useState, useMemo } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, CalendarDays, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchWithAuth } from '@/services/apiClient';
import { toast } from '@/components/ui/use-toast';

const formatCLP = (v) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(v || 0);

const TIPO_COLOR = {
  'INGRESO':  'text-emerald-600 bg-emerald-500/10 border-emerald-500/20',
  'EGRESO':   'text-red-500 bg-red-500/10 border-red-500/20',
  'TRASPASO': 'text-blue-600 bg-blue-500/10 border-blue-500/20',
};

const getTipoDisplay = (tipo, glosa = '') => {
  const g = glosa.toLowerCase();
  if (g.startsWith('nota crédito') || g.startsWith('nota credito')) return { label: 'N. CRÉDITO', color: 'text-amber-600 bg-amber-500/10 border-amber-500/20' };
  if (g.startsWith('nota débito')  || g.startsWith('nota debito'))  return { label: 'N. DÉBITO',  color: 'text-orange-600 bg-orange-500/10 border-orange-500/20' };
  return { label: tipo, color: TIPO_COLOR[tipo] || TIPO_COLOR.TRASPASO };
};

const MESES = [
  { v:'01',l:'Enero' },{ v:'02',l:'Febrero' },{ v:'03',l:'Marzo' },{ v:'04',l:'Abril' },
  { v:'05',l:'Mayo' },{ v:'06',l:'Junio' },{ v:'07',l:'Julio' },{ v:'08',l:'Agosto' },
  { v:'09',l:'Septiembre' },{ v:'10',l:'Octubre' },{ v:'11',l:'Noviembre' },{ v:'12',l:'Diciembre' },
];
// Los anios del selector se calculan, no se escriben. La lista fija
// ['2024'...'2027'] deja de ofrecer el anio en curso apenas llega 2028, y el
// sintoma es de los que nadie relaciona con esto: "no me deja elegir el anio".
const ANIOS = (() => {
  const y = new Date().getFullYear();
  return Array.from({ length: 4 }, (_, i) => String(y - 2 + i));
})();
const ITEMS_PER_PAGE = 15;

const AsientosContables = ({ empresaId, mes: mesProp, anio: anioProp, setMes: setMesProp, setAnio: setAnioProp, rango }) => {
  const { user, selectedCompany } = useAuth();
  const targetId = empresaId || selectedCompany?.id;

  const now = new Date();
  const [mesInterno,  setMesInterno]  = useState((now.getMonth()+1).toString().padStart(2,'0'));
  const [anioInterno, setAnioInterno] = useState(now.getFullYear().toString());
  const mes   = mesProp   ?? mesInterno;
  const anio  = anioProp  ?? anioInterno;
  const setMes  = setMesProp  ?? setMesInterno;
  const setAnio = setAnioProp ?? setAnioInterno;
  const queryClient = useQueryClient();
  const [expanded, setExpanded]   = useState(new Set());
  const [deletingId, setDeletingId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  /* ── cargar comprobantes desde BD ── */
  const empParam = (!targetId || targetId === 'ALL') ? 'null' : targetId;
  const { data, isLoading } = useQuery({
    queryKey: ['comprobantes-libro', empParam],
    queryFn: async () => {
      const res = await fetchWithAuth(`/accounting/comprobantes?empresaId=${empParam}`, user.sessionId);
      if (!res.ok) return { comprobantes: [] };
      return res.json();
    },
    enabled: !!user?.sessionId,
    staleTime: 0,
  });

  /* ── filtrar por período ── */
  const comprobantes = useMemo(() => {
    const all = data?.comprobantes || [];
    return all.filter(c => {
      if (!c.fecha) return true;
      if (rango?.desde && rango?.hasta) {
        const f = String(c.fecha).slice(0, 10);
        return f >= rango.desde && f <= rango.hasta;
      }
      return c.fecha.slice(0, 7) === `${anio}-${mes}`;
    });
  }, [data, mes, anio, rango]);

  const totalPages = Math.ceil(comprobantes.length / ITEMS_PER_PAGE) || 1;
  const currentData = comprobantes.slice((currentPage-1)*ITEMS_PER_PAGE, currentPage*ITEMS_PER_PAGE);

  /* ── totales del período ── */
  const totalesPeriodo = useMemo(() => comprobantes.reduce((acc, c) => {
    (c.lineas || []).forEach(l => {
      acc.debe  += Number(l.debe)  || 0;
      acc.haber += Number(l.haber) || 0;
    });
    return acc;
  }, { debe: 0, haber: 0 }), [comprobantes]);

  const handleEliminar = async (id, glosa) => {
    if (!confirm(`¿Eliminar el comprobante "${glosa}"?`)) return;
    setDeletingId(id);
    try {
      const res = await fetchWithAuth(`/accounting/comprobantes/${id}`, user.sessionId, { method: 'DELETE' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message);
      toast({ title: '✅ Comprobante eliminado' });
      queryClient.invalidateQueries(['comprobantes-libro']);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setDeletingId(null);
    }
  };

  const toggleExpanded = (id) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });


  return (
    <div className="space-y-5">


      {/* FILTRO PERÍODO */}
      <div className="flex items-center justify-between gap-4">
        {rango?.desde ? (
          <div className="text-[10px] font-black uppercase tracking-widest text-blue-600">
            Rango: {rango.desde} → {rango.hasta}
          </div>
        ) : (
          <div className="flex items-center bg-slate-50 border border-[#efe8dd] rounded-xl px-1 py-1">
            <div className="flex items-center pl-3 pr-1"><CalendarDays className="h-4 w-4 text-blue-600"/></div>
            <select value={mes} onChange={e => { setMes(e.target.value); setCurrentPage(1); }}
              className="bg-transparent text-slate-700 text-xs font-black uppercase tracking-widest px-2 py-2 focus:outline-none appearance-none cursor-pointer hover:text-blue-600">
              {MESES.map(m => <option key={m.v} value={m.v} className="bg-white">{m.l}</option>)}
            </select>
            <span className="text-slate-700/20 mx-1">/</span>
            <select value={anio} onChange={e => { setAnio(e.target.value); setCurrentPage(1); }}
              className="bg-transparent text-slate-700 text-xs font-black uppercase tracking-widest px-2 py-2 focus:outline-none appearance-none cursor-pointer hover:text-blue-600">
              {ANIOS.map(a => <option key={a} value={a} className="bg-white">{a}</option>)}
            </select>
          </div>
        )}

        {/* Stats del período */}
        <div className="flex items-center gap-4">
          <div className="text-center">
            <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Comprobantes</p>
            <p className="text-lg font-black text-slate-900">{comprobantes.length}</p>
          </div>
          <div className="text-center">
            <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Total Debe</p>
            <p className="text-sm font-black text-emerald-600">{formatCLP(totalesPeriodo.debe)}</p>
          </div>
          <div className="text-center">
            <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Total Haber</p>
            <p className="text-sm font-black text-orange-600">{formatCLP(totalesPeriodo.haber)}</p>
          </div>
        </div>
      </div>

      {/* TABLA */}
      <div className="bg-white rounded-xl border border-[#efe8dd] overflow-hidden shadow-2xl">
        {isLoading ? (
          <div className="py-16 flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 text-blue-500 animate-spin opacity-40"/>
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Cargando Libro Diario...</p>
          </div>
        ) : comprobantes.length === 0 ? (
          <div className="py-20 flex flex-col items-center gap-4">
            <div className="bg-slate-50 p-5 rounded-full border border-[#efe8dd]">
              <BookOpen className="h-8 w-8 text-slate-400"/>
            </div>
            <div className="text-center">
              <p className="text-slate-900 font-black uppercase text-sm">Sin comprobantes</p>
              <p className="text-slate-400 text-[10px] mt-1 uppercase tracking-widest font-bold">
                No hay asientos guardados para {MESES.find(m=>m.v===mes)?.l} {anio}
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Header tabla */}
            <div className="grid grid-cols-[60px_100px_80px_1fr_100px_60px_40px] bg-slate-50 border-b border-[#efe8dd] px-5 py-3">
              {['N°','Fecha','Tipo','Glosa','Monto','Estado',''].map((h,i) => (
                <span key={i} className="text-[10px] font-black uppercase tracking-widest text-slate-500">{h}</span>
              ))}
            </div>

            <div className="divide-y divide-white/5">
              {currentData.map(comp => {
                const isExp = expanded.has(comp.id);
                const lineas = comp.lineas || [];
                const totalDebe  = lineas.reduce((s,l) => s+(Number(l.debe)||0), 0);
                const totalHaber = lineas.reduce((s,l) => s+(Number(l.haber)||0), 0);
                const cuadrado   = Math.abs(totalDebe-totalHaber) < 1;
                const { label: tipoLabel, color: tipoColor } = getTipoDisplay((comp.tipo||'').toUpperCase(), comp.glosa || '');
                const fechaStr   = comp.fecha || comp.createdAt || '';
                const fechaDate  = fechaStr ? new Date(fechaStr.length === 10 ? fechaStr + 'T00:00:00' : fechaStr) : null;
                const fecha      = fechaDate && !isNaN(fechaDate) ? fechaDate.toLocaleDateString('es-CL', { timeZone: 'UTC' }) : '—';

                return (
                  <div key={comp.id}>
                    {/* Fila principal */}
                    <div
                      className="grid grid-cols-[60px_100px_80px_1fr_100px_60px_40px] items-center px-5 py-3 hover:bg-white cursor-pointer transition-colors group"
                      onClick={() => toggleExpanded(comp.id)}
                    >
                      <span className="font-mono text-xs text-slate-400 font-bold">#{comp.numeroComprobante ?? comp.numero_comprobante ?? '—'}</span>
                      <span className="text-xs text-slate-600">{fecha}</span>
                      <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border w-fit ${tipoColor}`}>
                        {tipoLabel}
                      </span>
                      <span className="text-xs text-slate-700 font-semibold truncate pr-4">{comp.glosa}</span>
                      <span className="text-xs font-mono font-bold text-emerald-600">{formatCLP(totalDebe)}</span>
                      <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border w-fit ${cuadrado ? 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20' : 'text-amber-600 bg-amber-500/10 border-amber-500/20'}`}>
                        {cuadrado ? '✓' : '!'}
                      </span>
                      <button
                        onClick={e => { e.stopPropagation(); handleEliminar(comp.id, comp.glosa); }}
                        disabled={deletingId === comp.id}
                        className="p-1.5 rounded text-red-500 hover:bg-red-500/20 transition-colors disabled:opacity-40 opacity-0 group-hover:opacity-100"
                        title="Eliminar comprobante">
                        {deletingId === comp.id ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <Trash2 className="h-3.5 w-3.5"/>}
                      </button>
                    </div>

                    {/* Líneas expandidas */}
                    {isExp && (
                      <div className="bg-slate-50 border-t border-[#efe8dd] px-10 py-3">
                        <div className="grid grid-cols-[1fr_120px_120px] gap-2 mb-1.5 px-1">
                          <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Cuenta</span>
                          <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest text-right">Debe</span>
                          <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest text-right">Haber</span>
                        </div>
                        {lineas.map((l, i) => (
                          <div key={i} className="grid grid-cols-[1fr_120px_120px] gap-2 py-1 border-b border-white/[0.04] last:border-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-mono text-[10px] text-blue-600 font-bold flex-shrink-0">{l.cuentaCodigo || l.cuenta_codigo}</span>
                              <span className="text-[10px] text-slate-500 truncate">{l.descripcion}</span>
                            </div>
                            <span className="text-right font-mono text-[10px] text-emerald-600 font-bold">
                              {Number(l.debe)>0 ? formatCLP(l.debe) : <span className="text-slate-600">—</span>}
                            </span>
                            <span className="text-right font-mono text-[10px] text-orange-600 font-bold">
                              {Number(l.haber)>0 ? formatCLP(l.haber) : <span className="text-slate-600">—</span>}
                            </span>
                          </div>
                        ))}
                        <div className="grid grid-cols-[1fr_120px_120px] gap-2 pt-2 mt-1">
                          <span className="text-[9px] font-black uppercase text-slate-400">Totales</span>
                          <span className="text-right font-mono text-[10px] font-black text-emerald-600">{formatCLP(totalDebe)}</span>
                          <span className="text-right font-mono text-[10px] font-black text-orange-600">{formatCLP(totalHaber)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Paginación */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-t border-[#efe8dd]">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                  {comprobantes.length} comprobantes
                </span>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" disabled={currentPage===1} onClick={() => setCurrentPage(p=>p-1)}
                    className="h-8 text-slate-500 hover:text-slate-900 disabled:opacity-20">
                    <ChevronLeft className="h-4 w-4"/>
                  </Button>
                  <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest px-2">
                    {currentPage} / {totalPages}
                  </span>
                  <Button variant="ghost" size="sm" disabled={currentPage===totalPages} onClick={() => setCurrentPage(p=>p+1)}
                    className="h-8 text-slate-500 hover:text-slate-900 disabled:opacity-20">
                    <ChevronRight className="h-4 w-4"/>
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AsientosContables;
