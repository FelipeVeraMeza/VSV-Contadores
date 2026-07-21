import React from 'react';
import { Search, Filter, ChevronDown, ChevronUp, Users, AlertTriangle, FileText, CheckCircle2, Building2, User, MessageSquare, SlidersHorizontal, Layers, Trash2, Download, X, CheckSquare } from 'lucide-react';
import { FilterChip } from '../ui/CrmUI';

const CrmTableList = ({
    filteredClients, stats, onClientSelect, selectedClientId,
    searchTerm, setSearchTerm, statusFilter, setStatusFilter, typeFilter, setTypeFilter,
    planFilter, setPlanFilter, planes = [],
    vista, setVista, // 'activos' | 'suspendidos' | 'completar' | 'baja' | 'usuarios'
    conteos = {}, // KPI: cantidad de clientes por pestaña
    creadorFilter, setCreadorFilter, creadores = [], // Filtro por creador (master)
    onBulkDelete, onBulkEstadoPago, onCrear,
    esAdminMaster = false, // Solo el Administrador master ve la columna "Creado por"
    getCompletitud = () => 0 // Medidor de completitud de ficha (0-100)
}) => {
    // Pestañas por estado real del cliente
    const ESTADOS_TABS = [
        { id: 'activos',     label: 'Activos',       activo: 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' },
        { id: 'suspendidos', label: 'Suspendidos',   activo: 'bg-orange-600/80 text-white shadow-lg shadow-orange-500/20' },
        { id: 'completar',   label: 'Por completar', activo: 'bg-amber-600/80 text-white shadow-lg shadow-amber-500/20' },
        { id: 'baja',        label: 'De baja',       activo: 'bg-red-600/80 text-white shadow-lg shadow-red-500/20' },
    ];
    const [showFilters, setShowFilters] = React.useState(true);
    const [sortBy, setSortBy] = React.useState(null);
    const [sortDir, setSortDir] = React.useState('asc');
    const [selectedIds, setSelectedIds] = React.useState(new Set());
    // Modo selección: los checkboxes solo aparecen al activarlo (look más limpio)
    const [selectMode, setSelectMode] = React.useState(false);
    const exitSelectMode = () => { setSelectMode(false); setSelectedIds(new Set()); };

    const toggleSort = (col) => {
        if (sortBy === col) {
            setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortBy(col);
            setSortDir('asc');
        }
    };

    const sortValue = (c, col) => {
        switch (col) {
            case 'cliente': return String(c.razon_social || c.razonSocial || '').toLowerCase();
            case 'plan': return String(c.plan || c.plan_nombre || '').toLowerCase();
            case 'score': return Number(c.score ?? 0);
            case 'neto': return Number(c.impuesto_pagar ?? c.neto ?? 0);
            default: return '';
        }
    };

    const sortedClients = React.useMemo(() => {
        if (!sortBy) return filteredClients;
        const arr = [...filteredClients];
        arr.sort((a, b) => {
            const va = sortValue(a, sortBy);
            const vb = sortValue(b, sortBy);
            if (va < vb) return sortDir === 'asc' ? -1 : 1;
            if (va > vb) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
        return arr;
    }, [filteredClients, sortBy, sortDir]);

    const SortIcon = ({ col }) => {
        if (sortBy !== col) return <ChevronDown size={11} className="opacity-30" />;
        return sortDir === 'asc' ? <ChevronUp size={11} className="text-blue-400" /> : <ChevronDown size={11} className="text-blue-400" />;
    };

    // --- Selección múltiple ---
    const toggleRow = (id, e) => {
        e.stopPropagation();
        setSelectedIds(prev => {
            const n = new Set(prev);
            n.has(id) ? n.delete(id) : n.add(id);
            return n;
        });
    };
    const allVisibleSelected = sortedClients.length > 0 && sortedClients.every(c => selectedIds.has(c.id));
    const toggleAll = () => setSelectedIds(allVisibleSelected ? new Set() : new Set(sortedClients.map(c => c.id)));
    const clearSel = () => setSelectedIds(new Set());
    const selectedClients = sortedClients.filter(c => selectedIds.has(c.id));

    const bulkDelete = () => {
        if (!window.confirm(`¿Eliminar ${selectedClients.length} cliente(s)? Esta acción es permanente.`)) return;
        onBulkDelete?.(selectedClients);
        clearSel();
    };
    const bulkEstado = (estado) => { onBulkEstadoPago?.(selectedClients, estado); clearSel(); };

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

    // Estado del COBRO del mes pasado (¿se le facturó? ¿pagó?)
    const cobroStyle = (client) => {
        const estado = client.cobroMesPasado;
        const vence = client.vencimientoMesPasado ? new Date(client.vencimientoMesPasado) : null;
        const vencido = vence && vence < new Date();

        if (!estado || estado === 'POR_EMITIR') {
            return { label: 'Sin facturar', c: 'text-red-300 bg-red-500/10 border-red-500/30', dot: 'bg-red-400',
                     title: 'El mes pasado no se le emitió factura' };
        }
        if (estado === 'PAGADA') {
            return { label: 'Pagada', c: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30', dot: 'bg-emerald-400',
                     title: 'Factura del mes pasado pagada' };
        }
        if (estado === 'PENDIENTE_RECIBO') {
            return { label: 'Pend. recibo', c: 'text-sky-300 bg-sky-500/10 border-sky-500/30', dot: 'bg-sky-400',
                     title: 'Pagada, falta emitir el recibo' };
        }
        // PENDIENTE_PAGO
        return vencido
            ? { label: 'Pago vencido', c: 'text-red-300 bg-red-500/10 border-red-500/30', dot: 'bg-red-400',
                title: `Venció el ${vence.toLocaleDateString('es-CL')}` }
            : { label: 'Pend. pago', c: 'text-amber-300 bg-amber-500/10 border-amber-500/30', dot: 'bg-amber-400',
                title: vence ? `Vence el ${vence.toLocaleDateString('es-CL')}` : 'Factura emitida, pendiente de pago' };
    };

    return (
        <div className="flex flex-col gap-3 lg:gap-4 h-full min-h-0 w-full">
            
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
                <div className="flex flex-wrap bg-black/40 p-1 rounded-xl border border-white/10 w-fit flex-shrink-0">
                    {ESTADOS_TABS.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setVista(t.id)}
                            className={`flex items-center gap-1.5 px-3 lg:px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                vista === t.id ? t.activo : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                            }`}
                        >
                            {t.label}
                            <span className={`text-[9px] tabular-nums px-1.5 py-0.5 rounded-full ${vista === t.id ? 'bg-black/25' : 'bg-white/10'}`}>
                                {conteos[t.id] ?? 0}
                            </span>
                        </button>
                    ))}
                    {esAdminMaster && (
                        <button
                            onClick={() => setVista('usuarios')}
                            className={`flex items-center gap-1.5 px-3 lg:px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                vista === 'usuarios'
                                ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20'
                                : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                            }`}
                        >
                            Creadas por usuarios
                            <span className={`text-[9px] tabular-nums px-1.5 py-0.5 rounded-full ${vista === 'usuarios' ? 'bg-black/25' : 'bg-white/10'}`}>
                                {conteos.usuarios ?? 0}
                            </span>
                        </button>
                    )}
                </div>

                <div className="flex flex-1 gap-2 bg-[#0f172a]/80 p-2 rounded-xl border border-white/10 backdrop-blur-xl">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                        <input
                            type="text"
                            aria-label="Buscar clientes por nombre, RUT, correo, teléfono, representante, giro o comuna"
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
                            aria-label="Filtrar por tipo de cliente"
                            className="h-full bg-black/20 border border-white/10 rounded-lg pl-9 pr-8 py-2 text-xs text-white outline-none focus:border-blue-500 appearance-none cursor-pointer"
                        >
                            <option value="Todos">Todos los Tipos</option>
                            <option value="Empresa">Empresas</option>
                            <option value="Persona">Personas</option>
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" size={14} />
                    </div>
                    <div className="relative shrink-0">
                        <Layers className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
                        <select
                            value={planFilter}
                            onChange={(e) => setPlanFilter(e.target.value)}
                            aria-label="Filtrar por plan"
                            className="h-full bg-black/20 border border-white/10 rounded-lg pl-9 pr-8 py-2 text-xs text-white outline-none focus:border-blue-500 appearance-none cursor-pointer"
                        >
                            <option value="Todos">Todos los Planes</option>
                            {planes.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" size={14} />
                    </div>
                    {esAdminMaster && vista === 'usuarios' && (
                      <div className="relative shrink-0">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
                          <select
                              value={creadorFilter}
                              onChange={(e) => setCreadorFilter(e.target.value)}
                              aria-label="Filtrar por creador"
                              className="h-full bg-black/20 border border-white/10 rounded-lg pl-9 pr-8 py-2 text-xs text-white outline-none focus:border-purple-500 appearance-none cursor-pointer"
                          >
                              <option value="Todos">Todos los creadores</option>
                              {creadores.map(nombre => <option key={nombre} value={nombre}>{nombre}</option>)}
                          </select>
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" size={14} />
                      </div>
                    )}
                </div>
            </div>

            {/* Contador de resultados */}
            <div className="flex items-center justify-between flex-shrink-0 -mt-1">
                <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                        Mostrando <span className="text-white">{sortedClients.length}</span> {sortedClients.length === 1 ? 'cliente' : 'clientes'}
                    </span>
                    {!selectMode ? (
                        <button onClick={() => setSelectMode(true)} className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-gray-500 hover:text-white transition-colors">
                            <CheckSquare size={12} /> Seleccionar
                        </button>
                    ) : (
                        <>
                            <button onClick={toggleAll} className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-blue-400 hover:text-blue-300 transition-colors">
                                <CheckSquare size={12} /> {allVisibleSelected ? 'Quitar todos' : 'Seleccionar todos'}
                            </button>
                            <button onClick={exitSelectMode} className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-gray-500 hover:text-white transition-colors">
                                <X size={12} /> Cancelar
                            </button>
                        </>
                    )}
                </div>
                {sortBy && (
                    <button onClick={() => { setSortBy(null); setSortDir('asc'); }} className="text-[9px] font-black uppercase tracking-widest text-gray-500 hover:text-white transition-colors">
                        Quitar orden
                    </button>
                )}
            </div>

            {/* BARRA DE ACCIONES MASIVAS */}
            {selectedIds.size > 0 && (
                <div className="flex items-center flex-wrap gap-2 flex-shrink-0 bg-blue-600/15 border border-blue-500/30 rounded-xl px-3 py-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-blue-300">{selectedIds.size} seleccionado(s)</span>
                    <div className="h-4 w-px bg-white/10 mx-1" />
                    <button onClick={() => bulkEstado('AL DIA')} className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-300 hover:text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 rounded-lg transition-colors">
                        <CheckCircle2 size={12} /> Marcar Al Día
                    </button>
                    <button onClick={() => bulkEstado('NO PAGADO')} className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-red-300 hover:text-red-200 bg-red-500/10 hover:bg-red-500/20 px-2.5 py-1 rounded-lg transition-colors">
                        <AlertTriangle size={12} /> Marcar No Pagado
                    </button>
                    <button onClick={bulkDelete} className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-red-300 hover:text-white bg-red-600/20 hover:bg-red-600 px-2.5 py-1 rounded-lg transition-colors">
                        <Trash2 size={12} /> Eliminar
                    </button>
                    <button onClick={clearSel} className="ml-auto flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-white transition-colors">
                        <X size={12} /> Limpiar
                    </button>
                </div>
            )}

            {/* TABLA DE CLIENTES */}
            <div className="flex-1 overflow-hidden rounded-2xl border border-white/10 bg-[#0f172a]/50 backdrop-blur-xl flex flex-col">
              <div className="overflow-auto flex-1 scrollbar-hide">
                <table className="w-full min-w-[680px] text-left border-collapse">
                  <thead className="bg-[#0f172a] sticky top-0 z-10">
                    <tr className="border-b border-white/10 text-[10px] uppercase tracking-widest text-gray-500">
                      {selectMode && <th className="pl-3 pr-1 py-2.5 w-8" />}
                      <th className="px-4 py-2.5 font-black">
                        <button onClick={() => toggleSort('cliente')} className="flex items-center gap-1 hover:text-white transition-colors uppercase tracking-widest">
                          Cliente <SortIcon col="cliente" />
                        </button>
                      </th>
                      <th className="px-4 py-2.5 font-black">
                        <div className="flex items-center gap-2">
                          <button onClick={() => toggleSort('plan')} className="flex items-center gap-1 hover:text-white transition-colors uppercase tracking-widest">Plan <SortIcon col="plan" /></button>
                          <span className="opacity-30">·</span>
                          <button onClick={() => toggleSort('score')} className="flex items-center gap-1 hover:text-white transition-colors uppercase tracking-widest">Score <SortIcon col="score" /></button>
                        </div>
                      </th>
                      <th className="px-4 py-2.5 font-black">Contacto y Alertas</th>
                      <th className="px-4 py-2.5 font-black">Estados</th>
                      {esAdminMaster && vista === 'usuarios' && <th className="px-4 py-2.5 font-black">Creado por</th>}
                      <th className="px-4 py-2.5 font-black text-right">
                        <button onClick={() => toggleSort('neto')} className="flex items-center gap-1 hover:text-white transition-colors uppercase tracking-widest ml-auto">
                          Impuesto a pagar <SortIcon col="neto" />
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedClients.map((client) => {
                      const razonSocial = client.razon_social || client.razonSocial || 'Sin Nombre';
                      const rut = client.rut_encrypted || client.rut || '';
                      const completitud = getCompletitud(client);
                      const tipoCliente = client.tipo_cliente || client.type || 'Empresa';
                      
                      const plan = client.plan || client.plan_nombre || 'FREE';

                      const score = client.score ?? 50;
                      const importante = client.nota_urgente || client.importante || '';

                      // Prioriza WhatsApp igual que la ficha (consistencia entre tabla y drawer)
                      const wsRaw = client.whatsapp || '';
                      const telRaw = client.telefono_corporativo || client.telefono || '';
                      const whatsapp = wsRaw.length > 5 ? wsRaw : (telRaw.length > 5 ? telRaw : '');
                      
                      const correo = client.email_corporativo || client.correo || '';
                      
                      const pagoServicio = String(client.estado_pago || client.pagoServicio || 'AL DIA').trim().toUpperCase();
                      const estadoFormulario = String(client.estado_f29 || client.estadoFormulario || 'PENDIENTE').trim().toUpperCase();
                      const neto = Number(client.impuesto_pagar ?? client.neto ?? 0);

                      const isAlDiaPago = pagoServicio === 'AL DIA' || pagoServicio === 'PAGADO';
                      const isAlDiaF29 = estadoFormulario === 'DECLARADO' || estadoFormulario === 'NO DECLARAR';
                      const tieneImportante = importante && importante !== 'SIN_DATO';
                      const pSt = pagoStyle(pagoServicio);
                      const fSt = f29Style(estadoFormulario);
                      const cSt = cobroStyle(client);

                      // Semáforo lateral: rojo si hay alerta o impago, ámbar si F29 no al día, verde si todo ok
                      const accent = (tieneImportante || pagoServicio === 'NO PAGADO')
                        ? 'bg-red-500'
                        : (!isAlDiaF29 ? 'bg-amber-500' : 'bg-emerald-500/50');

                      return (
                        <tr
                          key={client.id}
                          onClick={() => onClientSelect(client)}
                          className={`border-b border-white/5 transition-colors cursor-pointer hover:bg-white/[0.04] ${selectedClientId === client.id ? 'bg-blue-500/10' : selectedIds.has(client.id) ? 'bg-blue-500/[0.06]' : ''}`}
                        >
                          {selectMode && (
                            <td className="pl-3 pr-1 py-2.5" onClick={(e) => toggleRow(client.id, e)}>
                              <input type="checkbox" checked={selectedIds.has(client.id)} onChange={(e) => toggleRow(client.id, e)} onClick={(e) => e.stopPropagation()} className="w-3.5 h-3.5 accent-blue-500 cursor-pointer" />
                            </td>
                          )}
                          <td className="pl-2 pr-4 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <span className={`w-1 self-stretch min-h-[34px] rounded-full ${accent}`} />
                              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/10 flex items-center justify-center text-blue-400 shrink-0">
                                {tipoCliente === 'Empresa' ? <Building2 size={15}/> : <User size={15}/>}
                              </div>
                              <div className="flex flex-col min-w-0">
                                 <span className="font-bold text-white text-xs uppercase tracking-tight truncate max-w-[220px]" title={razonSocial}>{razonSocial}</span>
                                 <span className="text-[10px] text-gray-500 font-mono tracking-wider">{rut}</span>
                                 <div className="flex items-center gap-1.5 mt-1" title={`Ficha ${completitud}% completa`}>
                                    <div className="h-1 w-16 bg-white/10 rounded-full overflow-hidden">
                                       <div
                                          className={`h-full rounded-full ${completitud >= 80 ? 'bg-emerald-500' : completitud >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                                          style={{ width: `${completitud}%` }}
                                       />
                                    </div>
                                    <span className="text-[8px] font-black text-gray-500 tabular-nums">{completitud}%</span>
                                 </div>
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
                                {/* Cobro del mes pasado */}
                                <span className={`flex items-center gap-1.5 text-[9px] font-black px-2 py-0.5 rounded-full border uppercase ${cSt.c}`} title={cSt.title}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${cSt.dot}`} /> {cSt.label}
                                </span>
                             </div>
                          </td>

                          {esAdminMaster && vista === 'usuarios' && (
                            <td className="px-4 py-2.5">
                              {client.usuarioCreador && client.usuarioCreador !== 'Sin asignar' ? (
                                <span className="flex items-center gap-1.5 text-[9px] font-black px-2 py-0.5 rounded-md border uppercase bg-purple-500/10 text-purple-300 border-purple-500/30 max-w-[140px] truncate" title={client.usuarioCreador}>
                                  <User size={10} className="shrink-0" /> {client.usuarioCreador}
                                </span>
                              ) : (
                                <span className="text-[9px] font-bold text-gray-600 uppercase tracking-widest">Sin asignar</span>
                              )}
                            </td>
                          )}

                          <td className="px-4 py-2.5 text-right">
                             <div className="flex flex-col items-end gap-0.5">
                                 <span className="text-gray-500 text-[8px] font-black uppercase tracking-widest">Impuesto a pagar</span>
                                 <span className={`font-mono font-bold text-sm ${neto > 0 ? 'text-white' : 'text-gray-600'}`}>${(isNaN(neto) ? 0 : neto).toLocaleString('es-CL')}</span>
                             </div>
                          </td>
                        </tr>
                      );
                    })}
                    
                    {sortedClients.length === 0 && (
                      <tr>
                        <td colSpan={5 + (selectMode ? 1 : 0) + (esAdminMaster && vista === 'usuarios' ? 1 : 0)} className="p-10 text-center">
                          <div className="flex flex-col items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-500">
                              <Users size={22} />
                            </div>
                            <p className="text-gray-400 text-sm">
                              {searchTerm || statusFilter !== 'Todos' || typeFilter !== 'Todos' || planFilter !== 'Todos'
                                ? 'Ningún cliente coincide con los filtros.'
                                : vista === 'usuarios' ? 'Aún no hay empresas creadas por tus clientes.'
                                : vista === 'suspendidos' ? 'No tienes clientes con servicio suspendido.'
                                : vista === 'completar' ? 'No hay fichas pendientes por completar.'
                                : vista === 'baja' ? 'No tienes clientes dados de baja.'
                                : 'Aún no tienes clientes activos.'}
                            </p>
                            {onCrear && vista === 'activos' && !searchTerm && (
                              <button onClick={onCrear} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors">
                                + Crear el primer cliente
                              </button>
                            )}
                          </div>
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