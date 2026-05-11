import { useState, useMemo, useEffect } from 'react';
import { Building2 } from 'lucide-react';
import { Input } from '@/components/ui/input';

const MovimientosBancarios = ({ movimientos = [] }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [mesActivo, setMesActivo] = useState('');

    // --- AGRUPAR POR MES Y REPARAR FECHAS ---
    const movimientosPorMes = useMemo(() => {
        const agrupados = {};
        
        if (!movimientos || movimientos.length === 0) return agrupados;

        movimientos.forEach(mov => {
            if (!mov.fecha) return;

            const fechaLimpia = typeof mov.fecha === 'string' && mov.fecha.includes('T') 
                ? mov.fecha.split('T')[0] 
                : mov.fecha;
                
            const partes = fechaLimpia.split(/[-/]/); 
            if (partes.length !== 3) return; 

            let anio, mes, dia;
            if (partes[0].length === 4) { 
                [anio, mes, dia] = partes;
            } else { 
                [dia, mes, anio] = partes;
            }

            const fechaObj = new Date(anio, mes - 1, dia);
            const nombreMes = fechaObj.toLocaleString('es-ES', { month: 'long' });
            const llaveMes = `${nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1)} de ${anio}`;

            if (!agrupados[llaveMes]) agrupados[llaveMes] = [];
            agrupados[llaveMes].push(mov);
        });

        return agrupados;
    }, [movimientos]);

    const mesesDisponibles = Object.keys(movimientosPorMes);

    // --- AUTO-SELECCIONAR EL PRIMER MES CON DATOS ---
    useEffect(() => {
        if (mesesDisponibles.length > 0) {
            if (!mesesDisponibles.includes(mesActivo)) {
                setMesActivo(mesesDisponibles[0]);
            }
        } else {
            setMesActivo('');
        }
    }, [mesesDisponibles, mesActivo]);

    const dataFiltrada = useMemo(() => {
        const base = movimientosPorMes[mesActivo] || [];
        return base.filter(mov => 
            mov.descripcion?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            mov.oficina?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            mov.documento?.toString().includes(searchTerm)
        );
    }, [movimientosPorMes, mesActivo, searchTerm]);

    const totalMostrado = dataFiltrada.length;

    // Función auxiliar para formatear dinero
    const formatMoney = (amount) => {
        return Number(amount).toLocaleString('es-CL', { style: 'currency', currency: 'CLP' });
    };

    return (
        <div className="bg-[#0f172a]/80 backdrop-blur-2xl rounded-2xl border border-white/10 shadow-2xl flex flex-col h-full overflow-hidden">
            <div className="p-4 border-b border-white/5">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-black text-white uppercase italic flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-blue-400" /> Bóveda de Movimientos
                        {totalMostrado > 0 && <span className="text-xs text-gray-400 font-normal ml-2">({totalMostrado} registros)</span>}
                    </h3>
                    <Input 
                        value={searchTerm} 
                        onChange={(e) => setSearchTerm(e.target.value)} 
                        placeholder="Buscar por movimiento, oficina o doc..." 
                        className="w-72 h-8 bg-black/40 border-white/10 text-white text-xs"
                    />
                </div>
                
                {/* SELECTOR DE MESES */}
                <div className="flex gap-2 overflow-x-auto pb-2">
                    {mesesDisponibles.length === 0 && (
                        <span className="text-xs text-amber-400 bg-amber-500/10 px-3 py-1 rounded">No hay meses con datos válidos</span>
                    )}
                    {mesesDisponibles.map(m => (
                        <button 
                            key={m} 
                            onClick={() => setMesActivo(m)} 
                            className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase transition-all whitespace-nowrap ${mesActivo === m ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'bg-white/5 text-gray-500 hover:bg-white/10'}`}
                        >
                            {m}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 overflow-auto">
                {dataFiltrada.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-3">
                        <Building2 className="h-12 w-12 opacity-20" />
                        <p className="text-sm">No hay movimientos para mostrar en {mesActivo || 'este filtro'}</p>
                    </div>
                ) : (
                    <table className="w-full text-left relative">
                        <thead className="sticky top-0 bg-[#111827] text-[10px] text-gray-400 font-black uppercase z-10 shadow-md">
                            <tr>
                                <th className="p-4">Fecha</th>
                                <th className="p-4">Oficina</th>
                                <th className="p-4">Movimiento</th>
                                <th className="p-4">N° Documento</th>
                                <th className="p-4 text-right">Cargo</th>
                                <th className="p-4 text-right">Abono</th>
                                <th className="p-4 text-right">Saldo</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {dataFiltrada.map((mov, i) => {
                                const cargoNum = Number(mov.cargo) || 0;
                                const abonoNum = Number(mov.abono) || 0;
                                const saldoNum = Number(mov.saldo) || 0;
                                
                                return (
                                    <tr key={mov.id || i} className="hover:bg-white/[0.04] text-xs transition-colors">
                                        
                                        {/* 1. FECHA */}
                                        <td className="p-4 text-gray-400 tabular-nums whitespace-nowrap">
                                            {typeof mov.fecha === 'string' && mov.fecha.includes('T') ? mov.fecha.split('T')[0] : mov.fecha}
                                        </td>
                                        
                                        {/* 2. OFICINA */}
                                        <td className="p-4 text-gray-300">
                                            {mov.oficina || '-'}
                                        </td>
                                        
                                        {/* 3. MOVIMIENTO (Descripción) */}
                                        <td className="p-4">
                                            <div className="font-bold text-white uppercase truncate max-w-[200px] md:max-w-xs" title={mov.descripcion}>
                                                {mov.descripcion || 'SIN DETALLE'}
                                            </div>
                                        </td>
                                        
                                        {/* 4. N° DOCUMENTO */}
                                        <td className="p-4 text-gray-400 font-mono">
                                            {mov.documento && mov.documento !== '0' ? mov.documento : '-'}
                                        </td>
                                        
                                        {/* 5. CARGO (Rojo) */}
                                        <td className="p-4 text-right font-black tabular-nums whitespace-nowrap text-rose-400">
                                            {cargoNum > 0 ? formatMoney(cargoNum) : '-'}
                                        </td>
                                        
                                        {/* 6. ABONO (Verde) */}
                                        <td className="p-4 text-right font-black tabular-nums whitespace-nowrap text-emerald-400">
                                            {abonoNum > 0 ? formatMoney(abonoNum) : '-'}
                                        </td>
                                        
                                        {/* 7. SALDO (Azul/Blanco) */}
                                        <td className="p-4 text-right font-black tabular-nums whitespace-nowrap text-blue-300 bg-blue-500/5">
                                            {formatMoney(saldoNum)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default MovimientosBancarios;