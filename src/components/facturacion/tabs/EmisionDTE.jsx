import React from 'react';
import { motion } from 'framer-motion';
import { FileText, Receipt, Building2, Plus, ArrowDownUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

const tiposDocumento = [
    { id: 'factura', codigo: '33', nombre: 'Factura Electrónica', icon: FileText, color: 'from-blue-500 to-cyan-600', shadow: 'shadow-blue-500/20' },
    { id: 'exenta', codigo: '34', nombre: 'Factura Exenta', icon: Receipt, color: 'from-emerald-500 to-teal-600', shadow: 'shadow-emerald-500/20' },
    { id: 'guia_despacho', codigo: '52', nombre: 'Guía de Despacho', icon: Building2, color: 'from-pink-500 to-rose-600', shadow: 'shadow-pink-500/20' },
    { id: 'nota_credito_debito', codigo: '61 / 56', nombre: 'Notas de C/D', icon: ArrowDownUp, color: 'from-purple-500 to-fuchsia-600', shadow: 'shadow-purple-500/20' },
    { id: 'boleta', codigo: '39', nombre: 'Boleta Electrónica', icon: Receipt, color: 'from-yellow-400 to-yellow-600', shadow: 'shadow-yellow-500/20' },
];

const EmisionDTE = ({ onEmitir }) => {
    return (
        <div className="h-full flex flex-col items-center justify-start max-w-6xl mx-auto space-y-8 py-8 relative">
            <div className="text-center space-y-2 w-full">
                <h3 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter">Emisión de Documentos</h3>
                <p className="text-gray-400 text-xs md:text-sm font-bold uppercase tracking-widest">Selecciona el tipo de DTE que deseas generar</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full px-4">
                {tiposDocumento.map((tipo, index) => {
                    const Icon = tipo.icon;
                    return (
                        <motion.div
                            key={tipo.codigo}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, delay: index * 0.1 }}
                            className="bg-[#1e293b]/50 backdrop-blur-xl rounded-2xl p-6 border border-white/10 hover:bg-[#1e293b] hover:border-white/20 transition-all flex flex-col items-center text-center group cursor-pointer shadow-lg relative overflow-hidden min-h-[250px] flex-1"
                            onClick={() => onEmitir(tipo.id)}
                        >
                            <div className={`absolute inset-0 bg-gradient-to-br ${tipo.color} opacity-0 group-hover:opacity-5 transition-opacity duration-500`} />
                            <div className={`w-16 h-16 bg-gradient-to-br ${tipo.color} rounded-xl flex items-center justify-center mb-4 shadow-lg ${tipo.shadow} group-hover:scale-110 transition-transform duration-500 flex-shrink-0`}>
                                <Icon className="h-8 w-8 text-white" />
                            </div>
                            <div className="flex-1 flex flex-col justify-center items-center relative z-10 w-full">
                                <h3 className="text-white font-bold uppercase text-sm tracking-widest mb-1 leading-tight">{tipo.nombre}</h3>
                                <p className="text-gray-400 text-[10px] font-mono tracking-widest">CÓDIGO SII: {tipo.codigo}</p>
                            </div>
                            <Button className={`w-full mt-4 bg-white/5 hover:bg-gradient-to-r hover:${tipo.color} text-gray-300 hover:text-white border border-white/10 hover:border-transparent font-bold uppercase text-[10px] tracking-widest h-10 rounded-lg transition-all duration-300 relative z-10 flex items-center justify-center`}>
                                <Plus className="h-4 w-4 mr-2" /> Crear Documento
                            </Button>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
};

export default EmisionDTE;