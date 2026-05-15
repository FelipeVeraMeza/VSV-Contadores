import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, FileWarning, Eye, Edit, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const formatCLP = (val) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(val || 0);

const LibroDiarioSuperficial = ({ asientos }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;
  
  const totalPages = Math.ceil(asientos.length / ITEMS_PER_PAGE) || 1;
  const currentData = asientos.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  return (
    <div className="bg-[#0f172a]/80 rounded-xl border border-white/5 overflow-hidden backdrop-blur-md shadow-2xl flex flex-col animate-in fade-in duration-500">
      
      {/* CABECERA DE LA TABLA */}
      <div className="p-4 border-b border-white/10 flex justify-between items-center bg-black/20">
        <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
                <BookOpen size={18} />
            </div>
            <h3 className="text-white font-black uppercase tracking-widest text-sm">Borrador: Libro Diario</h3>
        </div>
        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
          Modo Superficial (No guardado en BD)
        </span>
      </div>

      {/* CUERPO DE LA TABLA */}
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
            <table className="w-full text-left text-sm text-gray-300 min-w-[900px]">
              <thead className="bg-white/5 border-b border-white/10 text-[10px] uppercase tracking-widest font-black text-gray-400">
                <tr>
                  <th className="px-6 py-4">ID / Ref</th>
                  <th className="px-6 py-4">Fecha</th>
                  <th className="px-6 py-4">Descripción (Cuenta)</th>
                  <th className="px-6 py-4 text-right">Debe</th>
                  <th className="px-6 py-4 text-right">Haber</th>
                  <th className="px-6 py-4 text-center">Estado</th>
                  <th className="px-6 py-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {currentData.map((linea, idx) => {
                  const isHeader = linea.tipo === 'header';
                  const globalIdx = (currentPage - 1) * ITEMS_PER_PAGE + idx;

                  if (isHeader) {
                      return (
                          <tr key={`h-${globalIdx}`} className="bg-white/[0.02]">
                              <td colSpan={7} className="px-6 py-3 text-xs font-black text-emerald-400 tracking-widest uppercase">
                                  {linea.glosa}
                              </td>
                          </tr>
                      );
                  }

                  return (
                    <motion.tr 
                      key={`l-${globalIdx}`} 
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="hover:bg-white/[0.02] transition-colors group"
                    >
                      <td className="px-6 py-4 font-mono text-xs text-gray-500">#{String(globalIdx + 1).padStart(4, '0')}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-400 font-bold">
                        {new Date().toLocaleDateString('es-CL')}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                            <span className="text-xs text-white font-black uppercase tracking-tight">
                                CUENTA {linea.codigo}
                            </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right font-mono font-bold text-xs text-blue-400">
                        {linea.debe > 0 ? formatCLP(linea.debe) : ''}
                      </td>
                      <td className="px-6 py-4 text-right font-mono font-bold text-xs text-purple-400">
                        {linea.haber > 0 ? formatCLP(linea.haber) : ''}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="px-2 py-1 rounded text-[9px] font-black uppercase border bg-amber-500/10 text-amber-400 border-amber-500/20">
                          Borrador
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-400 hover:bg-blue-500/20"><Eye className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-yellow-400 hover:bg-yellow-500/20"><Edit className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:bg-red-500/20"><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* FOOTER - RESUMEN */}
          <div className="flex items-center justify-between px-6 py-4 bg-black/20 border-t border-white/10">
            <div className="text-[10px] text-gray-500 font-black uppercase tracking-widest">
              Total de Asientos: {asientos.length}
            </div>
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-2">
              Página {currentPage} de {totalPages}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default LibroDiarioSuperficial;