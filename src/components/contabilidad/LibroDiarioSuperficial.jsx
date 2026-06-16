import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, FileWarning, Eye, Link2 } from 'lucide-react';

const formatCLP = (val) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(val || 0);
const formatFecha = (f) => f ? new Date(String(f).length === 10 ? f + 'T00:00:00' : f).toLocaleDateString('es-CL', { timeZone: 'UTC' }) : '—';

const LibroDiarioSuperficial = ({ asientos }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [expandido, setExpandido] = useState(null);
  const ITEMS_PER_PAGE = 12;

  const totalPages = Math.ceil(asientos.length / ITEMS_PER_PAGE) || 1;
  const currentData = asientos.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  return (
    <div className="bg-[#0f172a]/80 rounded-xl border border-white/5 overflow-hidden backdrop-blur-md shadow-2xl flex flex-col animate-in fade-in duration-500">
      {/* CABECERA */}
      <div className="p-4 border-b border-white/10 flex justify-between items-center bg-black/20">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400"><BookOpen size={18} /></div>
          <h3 className="text-white font-black uppercase tracking-widest text-sm">Borrador: Libro Diario</h3>
        </div>
        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
          Modo Superficial (No guardado en BD)
        </span>
      </div>

      {asientos.length === 0 ? (
        <div className="p-16 text-center flex flex-col items-center justify-center">
          <div className="bg-white/5 p-5 rounded-full mb-4 border border-white/10">
            <FileWarning className="h-8 w-8 text-gray-500" />
          </div>
          <h4 className="text-white font-black tracking-wide uppercase text-sm">Libro Diario Vacío</h4>
          <p className="text-gray-500 text-[10px] mt-2 uppercase tracking-widest font-black max-w-md leading-relaxed">
            No se encontraron asientos contables en este búnker.
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm text-gray-300 min-w-[800px]">
              <thead className="bg-white/5 border-b border-white/10 text-[10px] uppercase tracking-widest font-black text-gray-400">
                <tr>
                  <th className="px-6 py-4">Cuenta</th>
                  <th className="px-6 py-4 text-right">Debe</th>
                  <th className="px-6 py-4 text-right">Haber</th>
                  <th className="px-6 py-4 text-center">Vinculado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {currentData.map((linea, idx) => {
                  const globalIdx = (currentPage - 1) * ITEMS_PER_PAGE + idx;
                  if (linea.tipo === 'header') {
                    return (
                      <tr key={`h-${globalIdx}`} className="bg-white/[0.02]">
                        <td colSpan={4} className="px-6 py-3 text-xs font-black text-emerald-400 tracking-widest uppercase">{linea.glosa}</td>
                      </tr>
                    );
                  }
                  const detalle = linea.detalle || [];
                  const abierto = expandido === globalIdx;
                  return (
                    <React.Fragment key={`l-${globalIdx}`}>
                      <tr className="hover:bg-white/[0.02] transition-colors group">
                        <td className="px-6 py-4">
                          <span className="text-xs text-white font-black uppercase tracking-tight">{linea.codigo}</span>
                          {linea.descripcion && <span className="text-[10px] text-gray-500 ml-2">{linea.descripcion}</span>}
                        </td>
                        <td className="px-6 py-4 text-right font-mono font-bold text-xs text-blue-400">{linea.debe > 0 ? formatCLP(linea.debe) : ''}</td>
                        <td className="px-6 py-4 text-right font-mono font-bold text-xs text-purple-400">{linea.haber > 0 ? formatCLP(linea.haber) : ''}</td>
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() => setExpandido(abierto ? null : globalIdx)}
                            title="Ver documentos vinculados"
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                              abierto ? 'bg-blue-500/20 text-blue-300' : 'text-blue-400 hover:bg-blue-500/10'
                            }`}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            {detalle.length} doc{detalle.length !== 1 ? 's' : ''}
                          </button>
                        </td>
                      </tr>

                      {/* DETALLE: documentos vinculados a esta cuenta */}
                      <AnimatePresence>
                        {abierto && (
                          <tr>
                            <td colSpan={4} className="p-0">
                              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden bg-black/30">
                                <div className="px-6 py-3">
                                  <p className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-2 flex items-center gap-1.5">
                                    <Link2 className="h-3 w-3" /> Documentos que componen {linea.codigo} ({detalle.length})
                                  </p>
                                  <div className="max-h-60 overflow-y-auto custom-scrollbar divide-y divide-white/5">
                                    {detalle.map((d, i) => (
                                      <div key={i} className="grid grid-cols-[80px_1fr_110px_110px] gap-2 items-center py-1.5 text-[11px]">
                                        <span className="font-black text-white italic">#{d.folio}</span>
                                        <span className="text-gray-300 truncate uppercase">{d.razon}</span>
                                        <span className="text-right font-mono text-blue-400">{d.debe > 0 ? formatCLP(d.debe) : ''}</span>
                                        <span className="text-right font-mono text-purple-400">{d.haber > 0 ? formatCLP(d.haber) : ''}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </motion.div>
                            </td>
                          </tr>
                        )}
                      </AnimatePresence>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between px-6 py-4 bg-black/20 border-t border-white/10">
            <div className="text-[10px] text-gray-500 font-black uppercase tracking-widest">
              {asientos.filter(a => !a.tipo).length} líneas de centralización
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="text-[10px] font-black uppercase text-gray-400 hover:text-white disabled:opacity-30 px-2">Ant</button>
                <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest px-2">{currentPage} / {totalPages}</span>
                <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="text-[10px] font-black uppercase text-gray-400 hover:text-white disabled:opacity-30 px-2">Sig</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default LibroDiarioSuperficial;
