import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, FileWarning, ChevronLeft, ChevronRight, Download, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';

const formatCLP = (val) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(val || 0);
const ITEMS_PER_PAGE = 15;

const AsientosContables = ({ asientosBorrador = [], periodoLabel = '' }) => {
    const [currentPage, setCurrentPage] = useState(1);

    const totalPages = Math.ceil(asientosBorrador.length / ITEMS_PER_PAGE) || 1;
    const currentData = asientosBorrador.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
    const totalLineas = asientosBorrador.filter(a => !a.tipo).length;

    return (
        <div className="space-y-5">

            {/* HEADER */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    {periodoLabel && (
                        <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl px-4 py-2.5">
                            <CalendarDays className="h-4 w-4 text-blue-400" />
                            <span className="text-xs font-black uppercase tracking-widest text-white">
                                {periodoLabel}
                            </span>
                        </div>
                    )}
                    {asientosBorrador.length > 0 && (
                        <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
                            Vista Previa · Sin guardar en BD
                        </span>
                    )}
                </div>
                {asientosBorrador.length > 0 && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toast({ title: 'En desarrollo', description: 'La exportación estará disponible próximamente.' })}
                        className="text-gray-400 hover:text-white border border-white/10 text-[10px] font-black uppercase tracking-widest h-8"
                    >
                        <Download className="h-3.5 w-3.5 mr-1.5" />
                        Exportar
                    </Button>
                )}
            </div>

            {/* TABLA */}
            <div className="bg-[#0f172a]/80 rounded-xl border border-white/5 overflow-hidden backdrop-blur-md shadow-2xl">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-white/5 border-b border-white/10">
                            <tr>
                                {['#', 'Código', 'Descripción', 'Debe', 'Haber', 'Estado'].map(h => (
                                    <th key={h} className={`px-5 py-4 text-[10px] font-black uppercase tracking-widest text-gray-400 ${
                                        h === 'Debe' || h === 'Haber' ? 'text-right' : h === 'Estado' ? 'text-center' : 'text-left'
                                    }`}>
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {asientosBorrador.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="py-24 text-center">
                                        <div className="flex flex-col items-center gap-4">
                                            <div className="bg-white/5 p-5 rounded-full border border-white/10">
                                                <BookOpen className="h-8 w-8 text-gray-500" />
                                            </div>
                                            <div>
                                                <h3 className="text-white font-black uppercase tracking-tight text-sm">Libro Diario Vacío</h3>
                                                <p className="text-gray-500 text-[10px] mt-1.5 uppercase tracking-widest font-bold">
                                                    Ve a Movimientos → LIBRO → Generar Borrador
                                                </p>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                <AnimatePresence>
                                    {currentData.map((linea, idx) => {
                                        if (linea.tipo === 'header') return (
                                            <tr key={`h-${idx}`} className="bg-blue-900/20">
                                                <td colSpan={6} className="px-5 py-2.5 text-xs font-black text-blue-400 tracking-widest uppercase">
                                                    {linea.glosa}
                                                </td>
                                            </tr>
                                        );
                                        const globalIdx = (currentPage - 1) * ITEMS_PER_PAGE + idx;
                                        return (
                                            <motion.tr
                                                key={`l-${globalIdx}`}
                                                initial={{ opacity: 0, y: 4 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: idx * 0.03 }}
                                                className="hover:bg-white/[0.02] transition-colors"
                                            >
                                                <td className="px-5 py-3.5 font-mono text-xs text-gray-600">
                                                    #{String(globalIdx + 1).padStart(4, '0')}
                                                </td>
                                                <td className="px-5 py-3.5 font-mono text-xs text-blue-300 font-bold">
                                                    {linea.codigo}
                                                </td>
                                                <td className="px-5 py-3.5 text-xs text-white font-bold">
                                                    {linea.descripcion || linea.codigo}
                                                </td>
                                                <td className="px-5 py-3.5 text-right font-mono text-xs font-bold text-emerald-400">
                                                    {linea.debe > 0 ? formatCLP(linea.debe) : <span className="text-gray-700">—</span>}
                                                </td>
                                                <td className="px-5 py-3.5 text-right font-mono text-xs font-bold text-orange-400">
                                                    {linea.haber > 0 ? formatCLP(linea.haber) : <span className="text-gray-700">—</span>}
                                                </td>
                                                <td className="px-5 py-3.5 text-center">
                                                    <span className="px-2 py-1 rounded text-[9px] font-black uppercase border bg-amber-500/10 text-amber-400 border-amber-500/20">
                                                        Borrador
                                                    </span>
                                                </td>
                                            </motion.tr>
                                        );
                                    })}
                                </AnimatePresence>
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="bg-black/20 px-5 py-4 flex items-center justify-between border-t border-white/5">
                    <p className="text-[10px] font-black uppercase text-gray-500 tracking-widest">
                        Total de Asientos: <span className="text-white">{totalLineas}</span>
                    </p>
                    {totalPages > 1 && (
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" disabled={currentPage === 1}
                                onClick={() => setCurrentPage(p => p - 1)}
                                className="text-white hover:bg-white/10 disabled:opacity-20 h-8">
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest px-3">
                                Página {currentPage} de {totalPages}
                            </span>
                            <Button variant="ghost" size="sm" disabled={currentPage === totalPages}
                                onClick={() => setCurrentPage(p => p + 1)}
                                className="text-white hover:bg-white/10 disabled:opacity-20 h-8">
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AsientosContables;
