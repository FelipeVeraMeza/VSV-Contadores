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
                      <th className="px-4 py-2.5 font-black text-right">Neto a Pagar</th>
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

                      return (
                        <tr 
                          key={client.id} 
                          onClick={() => onClientSelect(client)}
                          className={`border-b border-white/5 transition-all cursor-pointer hover:bg-white/[0.02] ${selectedClientId === client.id ? 'bg-white/[0.04] border-blue-500/30' : ''}`}
                        >
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/10 flex items-center justify-center text-blue-400">
                                {tipoCliente === 'Empresa' ? <Building2 size={16}/> : <User size={16}/>}
                              </div>
                              <div className="flex flex-col">
                                 <span className="font-bold text-white text-xs uppercase tracking-tight">{razonSocial}</span>
                                 <span className="text-[10px] text-gray-500 font-mono tracking-wider">{rut}</span>
                              </div>
                            </div>
                          </td>
                          
                          <td className="px-4 py-2.5">
                             <div className="flex flex-col items-start gap-1">
                                <span className="bg-white/10 text-gray-200 border border-white/10 px-2 py-0.5 rounded text-[9px] font-black uppercase max-w-[120px] truncate" title={plan}>{plan}</span>
                                <span className={`text-[9px] font-black px-2 py-0.5 rounded border ${getScoreColor(score)}`}>Score: {score}</span>
                             </div>
                          </td>
                          
                          <td className="px-4 py-2.5">
                             <div className="flex flex-col items-start gap-1.5">
                                {importante && importante !== 'SIN_DATO' && (
                                    <span className="flex items-center gap-1 text-[9px] font-black text-red-400 bg-red-400/10 px-2 py-0.5 rounded border border-red-400/20 uppercase max-w-[150px] truncate" title={importante}>
                                        <AlertTriangle size={10} /> {importante}
                                    </span>
                                )}
                                {whatsapp && whatsapp !== 'SIN_DATO' && whatsapp !== 'Sin Registro' ? (
                                    <a href={`https://wa.me/${whatsapp.replace(/\D/g,'')}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 hover:text-emerald-300 transition-colors" onClick={(e) => e.stopPropagation()}>
                                        <MessageSquare size={12} /> {whatsapp}
                                    </a>
                                ) : (
                                    <span className="text-[10px] text-gray-500 truncate max-w-[150px]">{correo || 'Sin correo'}</span>
                                )}
                             </div>
                          </td>

                          <td className="px-4 py-2.5">
                             <div className="flex flex-col items-start gap-1">
                                <span className={`text-[9px] font-black px-2 py-0.5 rounded border uppercase ${isAlDiaPago ? 'text-emerald-400 border-emerald-400/20 bg-emerald-400/10' : 'text-red-400 border-red-400/20 bg-red-400/10'}`}>
                                    Pago: {pagoServicio}
                                </span>
                                <span className={`text-[9px] font-black px-2 py-0.5 rounded border uppercase ${isAlDiaF29 ? 'text-blue-400 border-blue-400/20 bg-blue-400/10' : 'text-amber-400 border-amber-400/20 bg-amber-400/10'}`}>
                                    F29: {estadoFormulario}
                                </span>
                             </div>
                          </td>

                          <td className="px-4 py-2.5 text-right">
                             <div className="flex flex-col items-end gap-1">
                                 <span className="text-gray-400 text-[9px] font-bold uppercase tracking-widest">Neto a Pagar</span>
                                 <span className="text-emerald-400 font-mono font-bold text-sm">${(isNaN(neto) ? 0 : neto).toLocaleString('es-CL')}</span>
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