import React from 'react';
import { motion } from 'framer-motion';
import { FileText, Receipt, Building2, Plus, ArrowDownUp, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';

// OJO: los degradados de hover del botón van como STRINGS LITERALES completos
// (`hover:from-… hover:to-…`). Tailwind no genera clases que se arman con
// interpolación (`hover:${tipo.color}`), y además dejaba el `to-…` sin el `hover:`,
// por eso el color se veía raro. Con la clase literal completa se genera bien.
const tiposDocumento = [
    { id: 'factura', codigo: '33', nombre: 'Factura Electrónica', icon: FileText, color: 'from-blue-500 to-cyan-600', hover: 'hover:from-blue-500 hover:to-cyan-600', shadow: 'shadow-blue-500/20' },
    { id: 'exenta', codigo: '34', nombre: 'Factura Exenta', icon: Receipt, color: 'from-emerald-500 to-teal-600', hover: 'hover:from-emerald-500 hover:to-teal-600', shadow: 'shadow-emerald-500/20' },
    // Guía de Despacho y Boleta todavía no están operativas: se muestran como "en proceso".
    { id: 'guia_despacho', codigo: '52', nombre: 'Guía de Despacho', icon: Building2, color: 'from-pink-500 to-rose-600', hover: 'hover:from-pink-500 hover:to-rose-600', shadow: 'shadow-pink-500/20', enProceso: true },
    { id: 'nota_credito_debito', codigo: '61 / 56', nombre: 'Notas de C/D', icon: ArrowDownUp, color: 'from-purple-500 to-fuchsia-600', hover: 'hover:from-purple-500 hover:to-fuchsia-600', shadow: 'shadow-purple-500/20' },
    { id: 'boleta', codigo: '39', nombre: 'Boleta Electrónica', icon: Receipt, color: 'from-yellow-400 to-yellow-600', hover: 'hover:from-yellow-400 hover:to-yellow-600', shadow: 'shadow-yellow-500/20', enProceso: true },
];

const EmisionDTE = ({ onEmitir }) => {
    return (
        <div className="h-full flex flex-col items-center justify-start max-w-6xl mx-auto relative">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full px-4">
                {tiposDocumento.map((tipo, index) => {
                    const Icon = tipo.icon;
                    const enProceso = tipo.enProceso === true;
                    return (
                        <motion.div
                            key={tipo.codigo}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, delay: index * 0.1 }}
                            className={`bg-white rounded-2xl p-6 border border-[#efe8dd] transition-all flex flex-col items-center text-center group relative overflow-hidden min-h-[250px] flex-1 shadow-sm ${
                                enProceso
                                    ? 'opacity-60 cursor-not-allowed'
                                    : 'hover:shadow-md hover:border-[#e5ddd0] cursor-pointer'
                            }`}
                            onClick={() => { if (!enProceso) onEmitir(tipo.id); }}
                        >
                            {/* Cartel "en proceso" para los documentos que todavía no están listos */}
                            {enProceso && (
                                <span className="absolute top-3 right-3 z-20 text-[9px] font-black uppercase tracking-widest bg-amber-100 text-amber-700 border border-amber-300 rounded-full px-2 py-0.5">
                                    En proceso
                                </span>
                            )}
                            {!enProceso && (
                                <div className={`absolute inset-0 bg-gradient-to-br ${tipo.color} opacity-0 group-hover:opacity-5 transition-opacity duration-500`} />
                            )}
                            <div className={`w-16 h-16 bg-gradient-to-br ${tipo.color} rounded-xl flex items-center justify-center mb-4 shadow-lg ${tipo.shadow} transition-transform duration-500 flex-shrink-0 ${enProceso ? 'grayscale' : 'group-hover:scale-110'}`}>
                                <Icon className="h-8 w-8 text-white" />
                            </div>
                            <div className="flex-1 flex flex-col justify-center items-center relative z-10 w-full">
                                <h3 className="text-slate-900 font-bold uppercase text-sm tracking-widest mb-1 leading-tight">{tipo.nombre}</h3>
                                <p className="text-slate-500 text-[10px] font-mono tracking-widest">CÓDIGO SII: {tipo.codigo}</p>
                            </div>
                            {enProceso ? (
                                <Button disabled className="w-full mt-4 bg-slate-50 text-slate-400 border border-[#efe8dd] font-bold uppercase text-[10px] tracking-widest h-10 rounded-lg cursor-not-allowed relative z-10 flex items-center justify-center">
                                    <Clock className="h-4 w-4 mr-2" /> En proceso
                                </Button>
                            ) : (
                                <Button className={`w-full mt-4 bg-slate-50 hover:bg-gradient-to-r ${tipo.hover} text-slate-600 hover:text-white border border-[#efe8dd] hover:border-transparent font-bold uppercase text-[10px] tracking-widest h-10 rounded-lg transition-all duration-300 relative z-10 flex items-center justify-center`}>
                                    <Plus className="h-4 w-4 mr-2" /> Crear Documento
                                </Button>
                            )}
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
};

export default EmisionDTE;
