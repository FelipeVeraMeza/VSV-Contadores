import React from 'react';
import { Search, Filter, ChevronDown, ChevronUp, Users, AlertTriangle, FileText, CheckCircle2, Building2, User, MessageSquare, SlidersHorizontal } from 'lucide-react';
import { FilterChip } from '../ui/CrmUI';

const CrmTableList = ({
    filteredClients, stats, onClientSelect, selectedClientId,
    searchTerm, setSearchTerm, statusFilter, setStatusFilter, typeFilter, setTypeFilter,
    vistaActivas, setVistaActivas // RECIBE LOS PROPS
}) => {
    const [showFilters, setShowFilters] = React.useState(true);

    const getScoreColor = (score) => {
        if(score >= 80) return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
        if(score >= 50) return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
        return 'text-red-500 bg-red-500/10 border-red-500/20';
    };

    // Color del plan según nivel (mejor lectura visual)
    const getPlanColor = (plan) => {
        const p = String(plan).toUpperCase();
        if (p.includes('TERMINO') || p.includes('BAJA')) return 'bg-slate-600/20 text-slate-400 border-slate-500/30';
        if (p.includes('FREE')) return 'bg-gray-500/15 text-gray-300 border-gray-500/30';
        if (p.includes('FULL')) return 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30';
        if (p.includes('EXECUTIVE')) return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
        if (p.includes('EMPRENDEDOR')) return 'bg-purple-500/15 text-purple-300 border-purple-500/30';
        if (p.includes('GO')) return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
        return 'bg-white/10 text-gray-200 border-white/10';
    };

    // Estilo (color + punto) para estado de pago
    const pagoStyle = (pago) => {
        if (pago === 'PAGADO' || pago === 'AL DIA') return { c: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30', dot: 'bg-emerald-400' };
        if (pago === 'NO PAGADO') return { c: 'text-red-300 bg-red-500/10 border-red-500/30', dot: 'bg-red-400' };
        return { c: 'text-slate-300 bg-slate-500/10 border-slate-500/30', dot: 'bg-slate-400' }; // suspendido, de baja, free, término giro
    };

    // Estilo (color + punto) para estado F29
    const f29Style = (f29) => {
        if (f29 === 'DECLARADO' || f29 === 'NO DECLARAR') return { c: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30', dot: 'bg-emerald-400' };
        if (f29 === 'PENDIENTE') return { c: 'text-amber-300 bg-amber-500/10 border-amber-500/30', dot: 'bg-amber-400' };
        return { c: 'text-orange-300 bg-orange-500/10 border-orange-500/30', dot: 'bg-orange-400' }; // notificado, revisar, etc.
    };

    return (
        <div className={`flex flex-col gap-3 lg:gap-4 transition-all duration-500 ease-in-out h-full min-h-0 ${selectedClientId ? 'lg:w-3/5' : 'w-full'}`}>
            
            {/* FILTROS RÁPIDOS COMPACTOS (antes KPI CARDS) */}
            <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10 bg-black/40 text-[10px] font-black uppercase tracking-wider text-gray-400 hover:text-white transition-all"
                title={showFilters ? 'Ocultar filtros' : 'Mostrar filtros'}
              >
                <SlidersHorizontal size={14} />
                <span className="hidden sm:inline">Filtros</span>
                {showFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {showFilters && (
                <>
                  <FilterChip icon={Users} label="Global" value={stats?.total || 0} color="text-blue-500" onClick={() => setStatusFilter('Todos')} active={statusFilter === 'Todos'} />
                  <FilterChip icon={AlertTriangle} label="Críticos" value={stats?.criticos || 0} color="text-red-500" onClick={() => setStatusFilter('Críticos')} active={statusFilter === 'Críticos'} />
                  <FilterChip icon={FileText} label="F29 Pendientes" value={stats?.f29Pendientes || 0} color="text-amber-500" onClick={() => setStatusFilter('F29 Pendientes')} active={statusFilter === 'F29 Pendientes'} />
                  <FilterChip icon={CheckCircle2} label="Al Día" value={stats?.alDia || 0} color="text-emerald-500" onClick={() => setStatusFilter('Al Día')} active={statusFilter === 'Al Día'} />
                </>
              )}
            </div>

            {/* TOGGLE ACTIVOS/INACTIVOS + BÚSQUEDA + FILTRO (una sola fila compacta) */}
            <div className="flex flex-col lg:flex-row gap-2 lg:gap-3 flex-shrink-0 lg:items-center">
                <div className="flex bg-black/40 p-1 rounded-xl border border-white/10 w-fit flex-shrink-0">
                    <button
                        onClick={() => setVistaActivas(true)}
                        className={`px-3 lg:px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                            vistaActivas
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                            : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                        }`}
                    >
                        Activos
                    </button>
                    <button
                        onClick={() => setVistaActivas(false)}
                        className={`px-3 lg:px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                            !vistaActivas
                            ? 'bg-red-600/80 text-white shadow-lg shadow-red-500/20'
                            : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                        }`}
                    >
                        Inactivos
                    </button>
                </div>

                <div className="flex flex-1 gap-2 bg-[#0f172a]/80 p-2 rounded-xl border border-white/10 backdrop-blur-xl">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                        <input
                            type="text"
                            placeholder="Buscar por nombre, RUT, correo, teléfono o representante..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-black/20 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-xs text-white outline-none focus:border-blue-500 transition-colors placeholder:text-gray-600"
                        />
                    </div>
                    <div className="relative shrink-0">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
                        <select
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value)}
                            className="h-full bg-black/20 border border-white/10 rounded-lg pl-9 pr-8 py-2 text-xs text-white outline-none focus:border-blue-500 appearance-none cursor-pointer"
                        >
                            <option value="Todos">Todos los Tipos</option>
                            <option value="Empresa">Empresas</option>
                            <option value="Persona">Personas</option>
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" size={14} />
                    </div>
                </div>
            </div>

            {/* TABLA DE CLIENTES */}
            <div className="flex-1 overflow-hidden rounded-2xl border border-white/10 bg-[#0f172a]/50 backdrop-blur-xl flex flex-col">
              <div className="overflow-auto flex-1 scrollbar-hide">
                <table className="w-full min-w-[680px] text-left border-collapse">
                  <thead className="bg-[#0f172a] sticky top-0 z-10">
                    <tr className="border-b border-white/10 text-[10px] uppercase tracking-widest text-gray-500">
                      <th className="px-4 py-2.5 font-black">Cliente</th>
                      <th className="px-4 py-2.5 font-black">Plan & Score</th>
                      <th className="px-4 py-2.5 font-black">Contacto y Alertas</th>
                      <th className="px-4 py-2.5 font-black">Estados</th>
                      <th className="px-4 py-2.5 font-black text-right">Impuesto a pagar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClients.map((client) => {
                      const razonSocial = client.razon_social || client.razonSocial || 'Sin Nombre';
                      const rut = client.rut_encrypted || client.rut || '';
                      const tipoCliente = client.tipo_cliente || client.type || 'Empresa';
                      
                      const plan = client.plan || client.plan_nombre || (client.plan_id ? 'FALTA JOIN EN BD' : 'FREE');
                      
                      const score = client.score ?? 100;
                      const importante = client.nota_urgente || client.importante || '';
                      
                      const telRaw = client.telefono || client.telefono_corporativo || '';
                      const wsRaw = client.whatsapp || '';
                      const whatsapp = telRaw.length > 5 ? telRaw : (wsRaw.length > 5 ? wsRaw : '');
                      
                      const correo = client.email_corporativo || client.correo || '';
                      
                      const pagoServicio = String(client.estado_pago || client.pagoServicio || 'AL DIA').trim().toUpperCase();
                      const estadoFormulario = String(client.estado_f29 || client.estadoFormulario || 'PENDIENTE').trim().toUpperCase();
                      const neto = Number(client.impuesto_pagar ?? client.neto ?? 0);

                      const isAlDiaPago = pagoServicio === 'AL DIA' || pagoServicio === 'PAGADO';
                      const isAlDiaF29 = estadoFormulario === 'DECLARADO' || estadoFormulario === 'NO DECLARAR';
                      const tieneImportante = importante && importante !== 'SIN_DATO';
                      const pSt = pagoStyle(pagoServicio);
                      const fSt = f29Style(estadoFormulario);

                      // Semáforo lateral: rojo si hay alerta o impago, ámbar si F29 no al día, verde si todo ok
                      const accent = (tieneImportante || pagoServicio === 'NO PAGADO')
                        ? 'bg-red-500'
                        : (!isAlDiaF29 ? 'bg-amber-500' : 'bg-emerald-500/50');

                      return (
                        <tr
                          key={client.id}
                          onClick={() => onClientSelect(client)}
                          className={`border-b border-white/5 transition-colors cursor-pointer hover:bg-white/[0.04] ${selectedClientId === client.id ? 'bg-blue-500/10' : ''}`}
                        >
                          <td className="pl-2 pr-4 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <span className={`w-1 self-stretch min-h-[34px] rounded-full ${accent}`} />
                              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/10 flex items-center justify-center text-blue-400 shrink-0">
                                {tipoCliente === 'Empresa' ? <Building2 size={15}/> : <User size={15}/>}
                              </div>
                              <div className="flex flex-col min-w-0">
                                 <span className="font-bold text-white text-xs uppercase tracking-tight truncate max-w-[220px]" title={razonSocial}>{razonSocial}</span>
                                 <span className="text-[10px] text-gray-500 font-mono tracking-wider">{rut}</span>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-2.5">
                             <div className="flex flex-col items-start gap-1.5">
                                <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase border max-w-[130px] truncate ${getPlanColor(plan)}`} title={plan}>{plan}</span>
                                <span className={`text-[9px] font-black px-2 py-0.5 rounded-md border ${getScoreColor(score)}`}>Score {score}</span>
                             </div>
                          </td>

                          <td className="px-4 py-2.5">
                             <div className="flex flex-col items-start gap-1.5">
                                {tieneImportante && (
                                    <span className="flex items-center gap-1 text-[9px] font-black text-red-300 bg-red-500/10 px-2 py-0.5 rounded-md border border-red-500/30 uppercase max-w-[170px] truncate" title={importante}>
                                        <AlertTriangle size={10} className="shrink-0" /> {importante}
                                    </span>
                                )}
                                {whatsapp && whatsapp !== 'SIN_DATO' && whatsapp !== 'Sin Registro' ? (
                                    <a href={`https://wa.me/${whatsapp.replace(/\D/g,'')}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 hover:text-emerald-300 transition-colors" onClick={(e) => e.stopPropagation()}>
                                        <MessageSquare size={12} className="shrink-0" /> {whatsapp}
                                    </a>
                                ) : (
                                    <span className="flex items-center gap-1.5 text-[10px] text-gray-500 truncate max-w-[170px]">{correo || 'Sin contacto'}</span>
                                )}
                             </div>
                          </td>

                          <td className="px-4 py-2.5">
                             <div className="flex flex-col items-start gap-1.5">
                                <span className={`flex items-center gap-1.5 text-[9px] font-black px-2 py-0.5 rounded-full border uppercase ${pSt.c}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${pSt.dot}`} /> {pagoServicio}
                                </span>
                                <span className={`flex items-center gap-1.5 text-[9px] font-black px-2 py-0.5 rounded-full border uppercase ${fSt.c}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${fSt.dot}`} /> F29 {estadoFormulario}
                                </span>
                             </div>
                          </td>

                          <td className="px-4 py-2.5 text-right">
                             <div className="flex flex-col items-end gap-0.5">
                                 <span className="text-gray-500 text-[8px] font-black uppercase tracking-widest">Impuesto a pagar</span>
                                 <span className={`font-mono font-bold text-sm ${neto > 0 ? 'text-white' : 'text-gray-600'}`}>${(isNaN(neto) ? 0 : neto).toLocaleString('es-CL')}</span>
                             </div>
                          </td>
                        </tr>
                      );
                    })}
                    
                    {filteredClients.length === 0 && (
                      <tr>
                        <td colSpan="5" className="p-8 text-center text-gray-500 text-sm">
                          {vistaActivas ? 'No se encontraron clientes activos.' : 'No tienes empresas inactivas o sin registro.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
        </div>
    );
};

export default CrmTableList;