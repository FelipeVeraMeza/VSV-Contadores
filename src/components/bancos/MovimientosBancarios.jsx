import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
// CAMBIO AQUI: Usamos CheckCircle en lugar de CheckCircle2
import { ArrowDownCircle, ArrowUpCircle, Search, CalendarDays, Building2, Hash, CheckCircle, Clock } from 'lucide-react';
import { Input } from '@/components/ui/input';

const MovimientosBancarios = ({ movimientos = [] }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [mesActivo, setMesActivo] = useState('');

    // --- MAGIA AQUI: AGRUPAR LOS DATOS POR MES ---
    const movimientosPorMes = useMemo(() => {
        const agrupados = {};
        
        // Iteramos sobre el arreglo de movimientos que viene de la API
        movimientos.forEach(mov => {
            // Asegurarnos de que tenga fecha
            if (!mov.fecha) return;

            // Extraemos el Mes y el Año de la fecha (ej. "2026-02-27")
            const fechaObj = new Date(mov.fecha);
            
            // Si la fecha no es válida, la saltamos
            if (isNaN(fechaObj)) return;

            const nombreMes = fechaObj.toLocaleString('es-ES', { month: 'long' });
            const anio = fechaObj.getFullYear();
            
            // Creamos la llave para la pestaña (ej. "Febrero de 2026")
            const llaveMes = `${nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1)} de ${anio}`;

            if (!agrupados[llaveMes]) {
                agrupados[llaveMes] = [];
            }
            agrupados[llaveMes].push(mov);
        });

        return agrupados;
    }, [movimientos]);

    // Extraemos las llaves (nombres de los meses) para hacer las pestañas
    const mesesDisponibles = Object.keys(movimientosPorMes);

    // Seleccionar el primer mes por defecto cuando cambian los datos
    useEffect(() => {
        if (mesesDisponibles.length > 0 && !mesesDisponibles.includes(mesActivo)) {
            setMesActivo(mesesDisponibles[0]);
        }
    }, [mesesDisponibles, mesActivo]);

    // Filtramos los movimientos del mes seleccionado
    const dataFiltrada = useMemo(() => {
        if (!mesActivo || !movimientosPorMes[mesActivo]) return [];
        
        return movimientosPorMes[mesActivo].filter(mov => {
            const search = searchTerm.toLowerCase();
            return (
                mov.descripcion?.toLowerCase().includes(search) ||
                mov.oficina?.toLowerCase().includes(search) ||
                mov.documento?.toString().includes(search)
            );
        });
    }, [movimientosPorMes, mesActivo, searchTerm]);

    // Resumen financiero
    const abonos = dataFiltrada.reduce((acc, curr) => curr.monto > 0 ? acc + curr.monto : acc, 0);
    // Asumimos que los montos negativos son cargos
    const cargos = dataFiltrada.reduce((acc, curr) => curr.monto < 0 ? acc + Math.abs(curr.monto) : acc, 0);

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-[#0f172a]/80 backdrop-blur-2xl rounded-2xl border border-white/10 shadow-2xl flex flex-col h-full overflow-hidden">
            
            {/* CABECERA */}
            <div className="p-4 border-b border-white/5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <h3 className="text-lg font-black text-white uppercase italic flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-blue-400" /> Bóveda de Movimientos
                    </h3>
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-500" />
                        <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Filtrar en este mes..." className="h-8 text-[11px] bg-black/40 border-white/10 text-white pl-8 rounded-lg w-full" />
                    </div>
                </div>

                {/* SELECTOR DE MESES */}
                {mesesDisponibles.length > 0 ? (
                    <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
                        {mesesDisponibles.map(m => (
                            <button key={m} onClick={() => setMesActivo(m)} className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase transition-all whitespace-nowrap ${mesActivo === m ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-500 hover:text-white'}`}>
                                {m}
                            </button>
                        ))}
                    </div>
                ) : (
                   <p className="text-xs text-gray-500 italic">No hay meses con datos.</p>
                )}
            </div>

            {/* TABLA CON SCROLL INTERNO */}
            <div className="flex-1 overflow-auto custom-scrollbar">
                <table className="w-full text-left border-separate border-spacing-0">
                    <thead className="sticky top-0 bg-[#111827] z-10 shadow-sm">
                        <tr>
                            <th className="px-6 py-3 text-[9px] font-black text-gray-500 uppercase tracking-widest border-b border-white/5 whitespace-nowrap"><div className="flex items-center gap-1"><CalendarDays className="h-3 w-3"/> Fecha</div></th>
                            <th className="px-6 py-3 text-[9px] font-black text-gray-500 uppercase tracking-widest border-b border-white/5 whitespace-nowrap">Descripción / Sucursal</th>
                            <th className="px-6 py-3 text-[9px] font-black text-gray-500 uppercase tracking-widest border-b border-white/5 whitespace-nowrap">Banco / Doc</th>
                            <th className="px-6 py-3 text-center text-[9px] font-black text-gray-500 uppercase tracking-widest border-b border-white/5 whitespace-nowrap">Estado</th>
                            <th className="px-6 py-3 text-right text-[9px] font-black text-gray-500 uppercase tracking-widest border-b border-white/5 whitespace-nowrap">Monto</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.03]">
                        {dataFiltrada.length > 0 ? (
                            <AnimatePresence>
                                {dataFiltrada.map((mov, index) => {
                                    const isAbono = mov.monto > 0;
                                    const isConciliado = mov.estado === 'CONCILIADO';
                                    
                                    return (
                                        <motion.tr 
                                            key={mov.id || index}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            className="hover:bg-white/[0.02] group transition-colors"
                                        >
                                            {/* Fecha */}
                                            <td className="px-6 py-3 text-xs font-medium text-gray-400 tabular-nums whitespace-nowrap">{mov.fecha}</td>
                                            
                                            {/* Descripción y Oficina */}
                                            <td className="px-6 py-3 min-w-[200px]">
                                                <div className="text-xs font-bold text-white uppercase group-hover:text-blue-400 transition-colors truncate">{mov.descripcion}</div>
                                                <div className="text-[9px] text-gray-600 font-medium truncate uppercase">{mov.oficina}</div>
                                            </td>

                                            {/* Banco y Doc */}
                                            <td className="px-6 py-3">
                                                 <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">
                                                    {mov.banco}
                                                </div>
                                                <div className="text-[9px] text-gray-500 font-mono mt-0.5 whitespace-nowrap">
                                                    Doc: {mov.documento && mov.documento !== "0" ? mov.documento : 'S/N'}
                                                </div>
                                            </td>

                                            {/* Estado */}
                                            <td className="px-6 py-3 text-center whitespace-nowrap">
                                                <div className={`inline-flex items-center px-2 py-1 rounded-full text-[8px] font-black uppercase tracking-wider border ${
                                                    isConciliado 
                                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                                        : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                                }`}>
                                                    {/* CAMBIO AQUI: Usamos CheckCircle */}
                                                    {isConciliado ? <CheckCircle className="h-3 w-3 mr-1" /> : <Clock className="h-3 w-3 mr-1" />}
                                                    {mov.estado || 'PENDIENTE'}
                                                </div>
                                            </td>

                                            {/* Monto */}
                                            <td className={`px-6 py-3 text-right text-xs font-black tabular-nums whitespace-nowrap ${isAbono ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                 <div className="flex items-center justify-end gap-1">
                                                    {isAbono ? <ArrowUpCircle className="h-3 w-3 opacity-70" /> : <ArrowDownCircle className="h-3 w-3 opacity-70" />}
                                                    {isAbono ? '+' : '-'} {Math.abs(mov.monto).toLocaleString('es-CL', { style: 'currency', currency: 'CLP' })}
                                                </div>
                                            </td>
                                        </motion.tr>
                                    )
                                })}
                            </AnimatePresence>
                        ) : (
                             <tr>
                                <td colSpan="5" className="px-6 py-12 text-center">
                                    <p className="text-gray-500 text-sm">No se encontraron movimientos para esta búsqueda.</p>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* RESUMEN INFERIOR COMPACTO */}
            <div className="p-3 bg-black/40 border-t border-white/5 flex items-center justify-between shrink-0">
                <div className="flex gap-4 items-center">
                    <span className="text-[9px] font-black text-gray-500 uppercase">Resumen {mesActivo}:</span>
                    <div className="flex items-center gap-1.5"><ArrowUpCircle className="h-3 w-3 text-emerald-500" /><span className="text-xs font-bold text-emerald-400 tabular-nums">+{abonos.toLocaleString('es-CL')}</span></div>
                    <div className="flex items-center gap-1.5"><ArrowDownCircle className="h-3 w-3 text-rose-500" /><span className="text-xs font-bold text-rose-400 tabular-nums">-{cargos.toLocaleString('es-CL')}</span></div>
                </div>
                <div className="text-[9px] font-black text-gray-500 uppercase italic hidden sm:block">Protección Bancaria VSV Nivel 4</div>
            </div>
        </motion.div>
    );
};

export default MovimientosBancarios;