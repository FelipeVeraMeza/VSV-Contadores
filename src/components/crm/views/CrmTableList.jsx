import React from 'react';
import { Search, Filter, ChevronDown, ChevronUp, Users, AlertTriangle, FileText, CheckCircle2, Building2, User, MessageSquare, SlidersHorizontal, Layers, Trash2, Download, X, CheckSquare, Mail, Copy, Archive, DollarSign } from 'lucide-react';
import { FilterChip } from '../ui/CrmUI';
import { toast } from '@/components/ui/use-toast';

// Copiar sin salir de la lista. Es de lo que más se usa —el correo y el RUT— y
// hasta ahora obligaba a abrir la ficha y seleccionar el texto a mano.
const copiar = async (texto, titulo) => {
    try {
        await navigator.clipboard.writeText(texto);
        toast({ title: titulo, description: texto });
    } catch {
        toast({ variant: 'destructive', title: 'No se pudo copiar' });
    }
};

const CrmTableList = ({
    filteredClients, stats, onClientSelect, selectedClientId,
    searchTerm, setSearchTerm, statusFilter, setStatusFilter, typeFilter, setTypeFilter,
    planFilter, setPlanFilter, planes = [],
    vista, setVista, // 'activos' | 'suspendidos' | 'completar' | 'baja' | 'usuarios'
    carteraModo = '', setCarteraModo = () => {}, // '' = cartera vigente · 'fuera' = fuera de la planilla
    conteos = {}, // KPI: cantidad de clientes por pestaña
    creadorFilter, setCreadorFilter, creadores = [], // Filtro por creador (master)
    onBulkDelete, onBulkRegistrarPago, onCrear,
    esAdminMaster = false, // Solo el Administrador master ve la columna "Creado por"
    getCompletitud = () => 0, // Medidor de completitud de ficha (0-100)
    getFaltantes = () => []   // Qué campos faltan, para poder decirlo
}) => {
    // Si la pestaña "Creadas por usuarios" desaparece (llegó a 0) mientras estaba
    // seleccionada, la vista quedaría filtrando por algo sin botón visible: se
    // vuelve a Activos.
    React.useEffect(() => {
        if (vista === 'usuarios' && (conteos.usuarios ?? 0) === 0) setVista('activos');
    }, [vista, conteos.usuarios, setVista]);

    // Pestañas por estado real del cliente
    const ESTADOS_TABS = [
        { id: 'activos',     label: 'Activos',       activo: 'bg-[#199b4d] text-white shadow-sm' },
        { id: 'baja',        label: 'De baja',       activo: 'bg-red-500 text-white shadow-sm' },
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
            case 'neto': return Number(c.honorarioNeto ?? c.honorario_neto ?? 0);
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
        return sortDir === 'asc' ? <ChevronUp size={11} className="text-[#199b4d]" /> : <ChevronDown size={11} className="text-[#199b4d]" />;
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
    // Cuántos cobran distinto a su tramo, dentro de lo que se está mirando.
    // Se cuenta sobre la lista ya filtrada, igual que los demás contadores de
    // esta barra: el chip dice cuántos hay en la vista actual, no en toda la
    // cartera. Al activar el filtro el número queda igual, porque los que
    // quedan son justamente esos.
    const descalzados = React.useMemo(() => (filteredClients || []).filter(c => {
        const sug = c.precioSugerido ?? null;
        const cobra = Number(c.precioMensual) || 0;
        return sug !== null && cobra > 0 && Math.abs(sug - cobra) >= 1000;
    }).length, [filteredClients]);

    const allVisibleSelected = sortedClients.length > 0 && sortedClients.every(c => selectedIds.has(c.id));
    const toggleAll = () => setSelectedIds(allVisibleSelected ? new Set() : new Set(sortedClients.map(c => c.id)));
    const clearSel = () => setSelectedIds(new Set());
    const selectedClients = sortedClients.filter(c => selectedIds.has(c.id));

    const bulkDelete = () => {
        if (!window.confirm(`¿Eliminar ${selectedClients.length} cliente(s)? Esta acción es permanente.`)) return;
        onBulkDelete?.(selectedClients);
        clearSel();
    };
    const bulkPagar = () => { onBulkRegistrarPago?.(selectedClients); clearSel(); };


    // Color del plan según nivel (mejor lectura visual)
    const getPlanColor = (plan) => {
        const p = String(plan).toUpperCase();
        if (p.includes('TERMINO') || p.includes('BAJA')) return 'bg-slate-100 text-slate-500 border-slate-200';
        // FREE con color propio. Antes era gris —el mismo del plan dado de baja
        // y el mismo del valor por omisión—, así que se perdía entre las demás
        // y había que leer la palabra para notarlo. Un cliente que no paga es
        // justo lo que uno quiere ver de un vistazo al recorrer la columna.
        if (p.includes('SIN PLAN')) return 'bg-amber-50 text-amber-700 border-amber-300';
        if (p.includes('FREE')) return 'bg-teal-50 text-teal-700 border-teal-300';
        if (p.includes('FULL')) return 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200';
        if (p.includes('EXECUTIVE')) return 'bg-amber-50 text-amber-700 border-amber-200';
        if (p.includes('EMPRENDEDOR')) return 'bg-purple-50 text-purple-700 border-purple-200';
        if (p.includes('GO')) return 'bg-blue-50 text-blue-700 border-blue-200';
        return 'bg-slate-100 text-slate-600 border-slate-200';
    };

    // Estilo (color + punto) para estado de pago
    // Estado de cobranza REAL, calculado desde cobro_mensual. Reemplaza al badge que
    // leía empresa.estado_pago: ese campo viene de la importación del Excel y nadie
    // lo actualiza, así que mostraba "AL DIA" a clientes con deuda vencida y
    // "NO PAGADO" a clientes que ya habían pagado.
    // Tres estados, no dos. "Al día" a secas se leía como "no debe nada", y era falso:
    // un cliente recién facturado debe su factura del mes, solo que aún en plazo.
    const cobranzaStyle = (client) => {
        if (client.activo === false) {
            return { label: 'De baja', c: 'text-slate-500 bg-slate-100 border-slate-200', dot: 'bg-slate-400',
                     title: 'Cliente dado de baja' };
        }
        const vencida = Number(client.deudaVencida) || 0;
        const total = Number(client.deudaTotal) || 0;
        const meses = Number(client.mesesVencidos) || 0;
        const fmt = (n) => `$${n.toLocaleString('es-CL')}`;

        if (vencida > 0 || client.cobroVencido) {
            const desde = client.venceMasAntiguo
                ? ` desde el ${new Date(client.venceMasAntiguo).toLocaleDateString('es-CL')}`
                : '';
            const resto = total > vencida ? ` · ${fmt(total - vencida)} más aún en plazo` : '';
            return {
                label: `No pagó ${fmt(vencida)}`,
                c: 'text-red-600 bg-red-50 border-red-200', dot: 'bg-red-500',
                title: `Se le pasó el plazo: ${meses} factura(s) sin pagar${desde}. Debe ${fmt(total)} en total${resto}`,
            };
        }
        if (total > 0) {
            const vence = client.proximoVencimiento
                ? new Date(client.proximoVencimiento).toLocaleDateString('es-CL')
                : null;
            return {
                label: `Pend. pago ${fmt(total)}`,
                c: 'text-amber-700 bg-amber-50 border-amber-200', dot: 'bg-amber-500',
                title: vence
                    ? `Factura emitida, esperando el pago. Tiene plazo hasta el ${vence}.`
                    : 'Factura emitida, esperando el pago.',
            };
        }
        return { label: 'Sin deuda', c: 'text-emerald-700 bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500',
                 title: 'No tiene facturas impagas' };
    };

    // Estilo (color + punto) para estado F29
    const f29Style = (f29) => {
        if (f29 === 'DECLARADO' || f29 === 'NO DECLARAR') return { c: 'text-emerald-700 bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' };
        if (f29 === 'PENDIENTE') return { c: 'text-amber-700 bg-amber-50 border-amber-200', dot: 'bg-amber-500' };
        return { c: 'text-orange-700 bg-orange-50 border-orange-200', dot: 'bg-orange-500' }; // notificado, revisar, etc.
    };

    // Estado del COBRO del mes pasado. El badge lleva el nombre del mes: sin eso
    // parecía contradecir a la factura recién emitida del mes en curso.
    const MES_PASADO = (() => {
        const d = new Date(); d.setMonth(d.getMonth() - 1);
        const m = d.toLocaleDateString('es-CL', { month: 'long' });
        return m.charAt(0).toUpperCase() + m.slice(1);
    })();

    const cobroStyle = (client) => {
        const estado = client.cobroMesPasado;
        const vence = client.vencimientoMesPasado ? new Date(client.vencimientoMesPasado) : null;
        const vencido = vence && vence < new Date();

        if (!estado || estado === 'POR_EMITIR') {
            return { label: `${MES_PASADO}: sin facturar`, c: 'text-red-600 bg-red-50 border-red-200', dot: 'bg-red-500',
                     title: `En ${MES_PASADO.toLowerCase()} no se le emitió factura` };
        }
        if (estado === 'PAGADA') {
            return { label: `${MES_PASADO}: pagada`, c: 'text-emerald-700 bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500',
                     title: `Factura de ${MES_PASADO.toLowerCase()} pagada` };
        }
        if (estado === 'PENDIENTE_RECIBO') {
            return { label: `${MES_PASADO}: pend. recibo`, c: 'text-sky-700 bg-sky-50 border-sky-200', dot: 'bg-sky-500',
                     title: 'Pagada, falta emitir el recibo' };
        }
        // PENDIENTE_PAGO
        return vencido
            ? { label: `${MES_PASADO}: vencida`, c: 'text-red-600 bg-red-50 border-red-200', dot: 'bg-red-500',
                title: `Venció el ${vence.toLocaleDateString('es-CL')}` }
            : { label: `${MES_PASADO}: por pagar`, c: 'text-amber-700 bg-amber-50 border-amber-200', dot: 'bg-amber-500',
                title: vence ? `Vence el ${vence.toLocaleDateString('es-CL')}` : 'Factura emitida, pendiente de pago' };
    };

    // ========================================================================
    // Los datos que se muestran de un cliente, en un solo lugar.
    //
    // Existen DOS vistas de la misma lista: la tabla (escritorio) y las
    // tarjetas (teléfono). Antes esto vivía dentro del `.map()` de la tabla;
    // al agregar las tarjetas habría quedado escrito dos veces, y dos copias
    // de la misma regla se separan a la primera corrección que se haga en una
    // sola de ellas. Se calcula una vez y lo usan las dos.
    // ========================================================================
    const derivar = (client) => {
        const razonSocial = client.razon_social || client.razonSocial || 'Sin Nombre';
        const rut = client.rut_encrypted || client.rut || '';
        const completitud = getCompletitud(client);
        const faltantes = getFaltantes(client);
        const tipoCliente = client.tipo_cliente || client.type || 'Empresa';
        // Sin plan NO es lo mismo que FREE. Antes se caía a 'FREE' por omisión y
        // eso etiquetaba como gratis a 74 empresas a las que simplemente nadie
        // les asignó plan — afirmar «no paga» sobre un dato que no existe.
        // Ahora se dice lo que hay: falta el dato.
        const plan = client.plan || client.plan_nombre || 'SIN PLAN';
        const ultimoFolio = client.ultimoFolio || null;
        const ultimaEmision = client.ultimaEmision || null;
        const facturasDelMes = client.facturasDelMes ?? 0;
        const responsableNombre = client.responsableNombre || null;
        const importante = client.nota_urgente || client.importante || '';

        // Prioriza WhatsApp igual que la ficha (consistencia entre tabla y drawer)
        const wsRaw = client.whatsapp || '';
        const telRaw = client.telefono_corporativo || client.telefono || '';
        const whatsapp = wsRaw.length > 5 ? wsRaw : (telRaw.length > 5 ? telRaw : '');
        const correo = client.email_corporativo || client.correo || '';

        const estadoFormulario = String(client.estado_f29 || client.estadoFormulario || 'PENDIENTE').trim().toUpperCase();
        const neto = Number(client.honorarioNeto ?? client.honorario_neto ?? 0);

        // DESCALCE ENTRE LO QUE SE COBRA Y LO QUE DICE SU TRAMO.
        //
        // El plan no cobra lo mismo a todos: cobra según cuánto factura la
        // empresa. Medido el 04-09-2026: 29 empresas cobran distinto al tramo
        // que les corresponde, 16 de menos y 13 de más.
        //
        // Va DESPUÉS de `neto` a propósito: lo necesita para comparar. Cuando se
        // insertó antes, `sugerido` quedaba sin declarar y el CRM entero se caía
        // con «sugerido is not defined».
        //
        // Se ignoran diferencias menores a $1.000: hay precios históricos con
        // centavos —BARBERIA cobra 60.504 contra un tramo de 60.500— y marcar
        // eso enseñaría a ignorar el aviso.
        const sugerido = client.precioSugerido ?? null;
        const difPrecio = (sugerido !== null && neto > 0) ? sugerido - neto : 0;
        const descalzado = Math.abs(difPrecio) >= 1000;

        const isAlDiaF29 = estadoFormulario === 'DECLARADO' || estadoFormulario === 'NO DECLARAR';
        const tieneImportante = importante && importante !== 'SIN_DATO';
        const moroso = Number(client.deudaVencida) > 0 || Boolean(client.cobroVencido);

        return {
            razonSocial, rut, completitud, faltantes, tipoCliente, plan, importante,
            ultimoFolio, ultimaEmision, facturasDelMes, responsableNombre,
            sugerido, difPrecio, descalzado,
            whatsapp, correo, estadoFormulario, neto, isAlDiaF29, tieneImportante, moroso,
            pSt: cobranzaStyle(client),   // deuda real, no el campo estático
            fSt: f29Style(estadoFormulario),
            cSt: cobroStyle(client),
            // Semáforo lateral: rojo si debe o hay alerta, ámbar si F29 no al día, verde si todo ok
            accent: (tieneImportante || moroso) ? 'bg-red-500' : (!isAlDiaF29 ? 'bg-amber-500' : 'bg-emerald-500'),
            tituloFicha: getFaltantes(client).length
                ? `Ficha ${completitud}% completa.\nFalta por registrar:\n· ${getFaltantes(client).join('\n· ')}`
                : 'Ficha completa: no falta ningún dato',
        };
    };

    return (
        <div className="flex flex-col gap-3 lg:gap-4 h-full min-h-0 w-full">

            {/* FILTROS RÁPIDOS COMPACTOS (antes KPI CARDS) */}
            <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#efe8dd] bg-white text-[10px] font-black uppercase tracking-wider text-slate-500 hover:text-slate-900 transition-all"
                title={showFilters ? 'Ocultar filtros' : 'Mostrar filtros'}
              >
                <SlidersHorizontal size={14} />
                <span className="hidden sm:inline">Filtros</span>
                {showFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {showFilters && (
                <>
                  {/* Los rótulos dicen exactamente qué miden: "Al Día" a secas se leía
                      como "no debe nada" cuando en realidad significaba "nada vencido". */}
                  <FilterChip icon={Users} label="Global" value={stats?.total || 0} color="text-blue-500" onClick={() => setStatusFilter('Todos')} active={statusFilter === 'Todos'} />
                  <FilterChip icon={AlertTriangle} label="Con deuda vencida" value={stats?.criticos || 0} color="text-red-500" onClick={() => setStatusFilter('Críticos')} active={statusFilter === 'Críticos'} />
                  <FilterChip icon={FileText} label="F29 Pendientes" value={stats?.f29Pendientes || 0} color="text-amber-500" onClick={() => setStatusFilter('F29 Pendientes')} active={statusFilter === 'F29 Pendientes'} />
                  <FilterChip icon={CheckCircle2} label="Sin vencidos" value={stats?.alDia || 0} color="text-emerald-500" onClick={() => setStatusFilter('Al Día')} active={statusFilter === 'Al Día'} />
                  {/* PRECIO DESCALZADO · cobran distinto a lo que dice su tramo.
                      Solo se dibuja si hay alguno: un cero permanente es ruido.
                      Medido el 04-09-2026: 32 empresas, 16 de menos y 16 de más. */}
                  {descalzados > 0 && (
                    <FilterChip icon={DollarSign} label="Precio descalzado" value={descalzados}
                      color="text-amber-600"
                      onClick={() => setStatusFilter('Precio descalzado')}
                      active={statusFilter === 'Precio descalzado'} />
                  )}
                </>
              )}
            </div>

            {/* TOGGLE ACTIVOS/INACTIVOS + BÚSQUEDA + FILTRO (una sola fila compacta) */}
            <div className="flex flex-col lg:flex-row gap-2 lg:gap-3 flex-shrink-0 lg:items-center">
                <div className="flex flex-wrap bg-white p-1 rounded-xl border border-[#efe8dd] w-fit flex-shrink-0">
                    {ESTADOS_TABS.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setVista(t.id)}
                            className={`flex items-center gap-1.5 px-3 lg:px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                vista === t.id ? t.activo : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                            }`}
                        >
                            {t.label}
                            <span className={`text-[9px] tabular-nums px-1.5 py-0.5 rounded-full ${vista === t.id ? 'bg-black/15 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                {conteos[t.id] ?? 0}
                            </span>
                        </button>
                    ))}
                    {/* "Creadas por usuarios" solo tiene sentido si existe alguna:
                        son las empresas registradas por un usuario con rol Cliente.
                        En una organización sin clientes con cuenta propia la pestaña
                        quedaba siempre en 0, ocupando espacio y confundiendo. */}
                    {esAdminMaster && (conteos.usuarios ?? 0) > 0 && (
                        <button
                            onClick={() => setVista('usuarios')}
                            className={`flex items-center gap-1.5 px-3 lg:px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                vista === 'usuarios'
                                ? 'bg-purple-600 text-white shadow-sm'
                                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                            }`}
                        >
                            Creadas por usuarios
                            <span className={`text-[9px] tabular-nums px-1.5 py-0.5 rounded-full ${vista === 'usuarios' ? 'bg-black/15 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                {conteos.usuarios ?? 0}
                            </span>
                        </button>
                    )}

                    {/* «FUERA DE CARTERA» SE SACÓ DE LA PANTALLA (04-09-2026).
                        Pedido de Felipe: «fuera de cartera no va, eso es activo;
                        de baja listo, solo 2».

                        Eran tres botones para dos estados reales. Medido al
                        sacarlo: de las 92 empresas fuera de cartera, 89 YA
                        estaban de baja —o sea, ya salían en «De baja»— y solo 3
                        seguían activas, que es donde corresponde que se vean.

                        El mecanismo `carteraModo` NO se borró: sigue en el
                        servidor y en `useBunkerData`. Existe porque estas fichas
                        llegaron a ser inalcanzables —81 empresas que no aparecían
                        en ninguna pestaña, y un ex cliente que volvía terminaba
                        duplicado—. Lo que se quita es el botón, no la salida de
                        emergencia. */}
                </div>

                {/* `flex-wrap`: los tres controles no caben en una fila de 390px.
                    Sin envolver, el último («Todos los Planes») quedaba cortado
                    contra el borde derecho, a medio leer y sin poder abrirlo. */}
                <div className="flex flex-wrap flex-1 gap-2 bg-white p-2 rounded-xl border border-[#efe8dd]">
                    <div className="relative flex-1 min-w-[160px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            type="text"
                            aria-label="Buscar clientes por nombre, RUT, correo, teléfono, representante, giro o comuna"
                            placeholder="Buscar por nombre, RUT (empresa o representante), quien pagó, correo, teléfono..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-slate-50 border border-[#e5ddd0] rounded-lg pl-10 pr-4 py-2 text-xs text-slate-900 outline-none focus:border-[#199b4d] transition-colors placeholder:text-slate-400"
                        />
                    </div>
                    <div className="relative shrink-0 max-w-full">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                        <select
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value)}
                            aria-label="Filtrar por tipo de cliente"
                            className="h-full bg-slate-50 border border-[#e5ddd0] rounded-lg pl-9 pr-8 py-2 text-xs text-slate-900 outline-none focus:border-[#199b4d] appearance-none cursor-pointer max-w-full"
                        >
                            <option value="Todos">Todos los Tipos</option>
                            <option value="Empresa">Empresas</option>
                            <option value="Persona">Personas</option>
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                    </div>
                    <div className="relative shrink-0 max-w-full">
                        <Layers className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                        <select
                            value={planFilter}
                            onChange={(e) => setPlanFilter(e.target.value)}
                            aria-label="Filtrar por plan"
                            className="h-full bg-slate-50 border border-[#e5ddd0] rounded-lg pl-9 pr-8 py-2 text-xs text-slate-900 outline-none focus:border-[#199b4d] appearance-none cursor-pointer max-w-full"
                        >
                            <option value="Todos">Todos los Planes</option>
                            {planes.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                    </div>
                    {/* Filtrar por quién lleva cada cliente. Antes solo aparecía dentro
                        de "Creadas por usuarios", que es una pestaña que casi nunca se
                        usa: en la práctica no había forma de mirar la lista y ver de
                        quién es cada cliente. */}
                    {esAdminMaster && creadores.length > 1 && (
                      <div className="relative shrink-0 max-w-full">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                          <select
                              value={creadorFilter}
                              onChange={(e) => setCreadorFilter(e.target.value)}
                              aria-label="Filtrar por quién lleva el cliente"
                              title="Filtrar por quién lleva el cliente"
                              className="h-full bg-slate-50 border border-[#e5ddd0] rounded-lg pl-9 pr-8 py-2 text-xs text-slate-900 outline-none focus:border-purple-500 appearance-none cursor-pointer max-w-full"
                          >
                              <option value="Todos">Todos los responsables</option>
                              {creadores.map(nombre => <option key={nombre} value={nombre}>{nombre}</option>)}
                          </select>
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                      </div>
                    )}
                </div>
            </div>

            {/* Contador de resultados */}
            <div className="flex items-center justify-between flex-shrink-0 -mt-1">
                <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                        Mostrando <span className="text-slate-900">{sortedClients.length}</span> {sortedClients.length === 1 ? 'cliente' : 'clientes'}
                    </span>
                    {!selectMode ? (
                        <button onClick={() => setSelectMode(true)} className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-900 transition-colors">
                            <CheckSquare size={12} /> Seleccionar
                        </button>
                    ) : (
                        <>
                            <button onClick={toggleAll} className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-[#199b4d] hover:text-[#147a3d] transition-colors">
                                <CheckSquare size={12} /> {allVisibleSelected ? 'Quitar todos' : 'Seleccionar todos'}
                            </button>
                            <button onClick={exitSelectMode} className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-900 transition-colors">
                                <X size={12} /> Cancelar
                            </button>
                        </>
                    )}
                </div>
                {sortBy && (
                    <button onClick={() => { setSortBy(null); setSortDir('asc'); }} className="text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-900 transition-colors">
                        Quitar orden
                    </button>
                )}
            </div>

            {/* BARRA DE ACCIONES MASIVAS */}
            {selectedIds.size > 0 && (
                <div className="flex items-center flex-wrap gap-2 flex-shrink-0 bg-emerald-50 border border-[#199b4d]/30 rounded-xl px-3 py-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#199b4d]">{selectedIds.size} seleccionado(s)</span>
                    <div className="h-4 w-px bg-slate-200 mx-1" />
                    {/* Registrar el pago marca los cobros pendientes del cliente.
                        Antes había dos botones —"Al día" y "No pagado"— que escribían
                        un texto que la lista ni miraba: se marcaba y no pasaba nada.
                        "No pagado" ya no existe: un cliente debe o no debe según sus
                        cobros, no según lo que alguien apunte a mano. */}
                    <button onClick={bulkPagar} className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-700 hover:text-emerald-800 bg-emerald-100 hover:bg-emerald-200 px-2.5 py-1 rounded-lg transition-colors">
                        <CheckCircle2 size={12} /> Registrar pago
                    </button>
                    <button onClick={bulkDelete} className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-white bg-red-500 hover:bg-red-600 px-2.5 py-1 rounded-lg transition-colors">
                        <Trash2 size={12} /> Eliminar
                    </button>
                    <button onClick={clearSel} className="ml-auto flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-900 transition-colors">
                        <X size={12} /> Limpiar
                    </button>
                </div>
            )}

            {/* ================================================================
                LISTA DE CLIENTES · dos vistas de los MISMOS datos
                ----------------------------------------------------------------
                La tabla mide 680px como mínimo. En un teléfono de 390px eso
                obligaba a arrastrar de lado para leer cada cliente, y como el
                contenedor lleva `scrollbar-hide` ni siquiera se veía que se
                podía desplazar: la lista parecía rota, con dos columnas
                separadas por un vacío.
                Desde `lg` va la tabla; más abajo, una tarjeta por cliente.
                Las dos leen de `derivar()`, así que no pueden decir cosas
                distintas.
                ================================================================ */}

            {/* TABLA — desde 1024px */}
            <div className="hidden lg:flex flex-1 overflow-hidden rounded-2xl border border-[#efe8dd] bg-white shadow-sm flex-col">
              <div className="overflow-auto flex-1 scrollbar-hide">
                <table className="w-full min-w-[680px] text-left border-collapse">
                  <thead className="bg-slate-50 sticky top-0 z-10">
                    <tr className="border-b border-[#efe8dd] text-[10px] uppercase tracking-widest text-slate-500">
                      {selectMode && <th className="pl-3 pr-1 py-2.5 w-8" />}
                      <th className="px-4 py-2.5 font-black">
                        <button onClick={() => toggleSort('cliente')} className="flex items-center gap-1 hover:text-slate-900 transition-colors uppercase tracking-widest">
                          Cliente <SortIcon col="cliente" />
                        </button>
                      </th>
                      {/* Score y Responsable salieron de la tabla: ocupaban dos
                          columnas para un dato que casi nunca se mira acá. Los
                          dos siguen estando en la ficha del cliente. */}
                      <th className="px-4 py-2.5 font-black">
                        <button onClick={() => toggleSort('plan')} className="flex items-center gap-1 hover:text-slate-900 transition-colors uppercase tracking-widest">Plan <SortIcon col="plan" /></button>
                      </th>
                      <th className="px-4 py-2.5 font-black">Contacto y Alertas</th>
                      <th className="px-4 py-2.5 font-black">Estados</th>
                      {/* ÚLTIMA FACTURA · pedido el 04-09-2026: saber cuándo se
                          le facturó por última vez y con qué folio sin tener que
                          abrir la ficha de cada cliente. */}
                      <th className="px-4 py-2.5 font-black">Última factura</th>
                      <th className="px-4 py-2.5 font-black text-right">
                        <button onClick={() => toggleSort('neto')} className="flex items-center gap-1 hover:text-slate-900 transition-colors uppercase tracking-widest ml-auto">
                          Neto mensual <SortIcon col="neto" />
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedClients.map((client) => {
                      const {
                        razonSocial, rut, completitud, tipoCliente, plan, importante,
                        ultimoFolio, ultimaEmision, facturasDelMes, responsableNombre,
                        sugerido, difPrecio, descalzado,
                        whatsapp, correo, estadoFormulario, neto,
                        tieneImportante, pSt, fSt, cSt, accent, tituloFicha,
                      } = derivar(client);

                      return (
                        <tr
                          key={client.id}
                          onClick={() => onClientSelect(client)}
                          className={`border-b border-[#efe8dd] transition-colors cursor-pointer hover:bg-slate-50 ${selectedClientId === client.id ? 'bg-emerald-50' : selectedIds.has(client.id) ? 'bg-emerald-50/60' : ''}`}
                        >
                          {selectMode && (
                            <td className="pl-3 pr-1 py-2.5" onClick={(e) => toggleRow(client.id, e)}>
                              <input type="checkbox" checked={selectedIds.has(client.id)} onChange={(e) => toggleRow(client.id, e)} onClick={(e) => e.stopPropagation()} className="w-3.5 h-3.5 accent-[#199b4d] cursor-pointer" />
                            </td>
                          )}
                          <td className="pl-2 pr-4 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <span className={`w-1 self-stretch min-h-[34px] rounded-full ${accent}`} />
                              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-50 to-green-50 border border-[#efe8dd] flex items-center justify-center text-[#199b4d] shrink-0">
                                {tipoCliente === 'Empresa' ? <Building2 size={15}/> : <User size={15}/>}
                              </div>
                              <div className="flex flex-col min-w-0">
                                 <span className="font-bold text-slate-900 text-xs uppercase tracking-tight truncate max-w-[220px]" title={razonSocial}>{razonSocial}</span>
                                 <span className="text-[10px] text-slate-500 font-mono tracking-wider">{rut}</span>
                                 {/* RESPONSABLE · quién de la oficina atiende a este
                                     cliente. Volvió a la lista el 04-09-2026, pero
                                     bajo el nombre y no como columna propia: como
                                     columna ocupaba ancho fijo para un dato que
                                     muchas veces está vacío (97 de 99 empresas no lo
                                     tienen cargado). Acá no ocupa nada cuando falta. */}
                                 {responsableNombre && (
                                    <span className="text-[9px] text-slate-400 truncate max-w-[220px]"
                                          title={`Responsable del servicio: ${responsableNombre}`}>
                                       {responsableNombre}
                                    </span>
                                 )}
                                 <div className="flex items-center gap-1.5 mt-1" title={tituloFicha}>
                                    <div className="h-1 w-16 bg-slate-200 rounded-full overflow-hidden">
                                       <div
                                          className={`h-full rounded-full ${completitud >= 80 ? 'bg-emerald-500' : completitud >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                                          style={{ width: `${completitud}%` }}
                                       />
                                    </div>
                                    <span className="text-[8px] font-black text-slate-400 tabular-nums">{completitud}%</span>
                                 </div>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-2.5">
                             <span className={`inline-block px-2 py-0.5 rounded-md text-[9px] font-black uppercase border max-w-[130px] truncate ${getPlanColor(plan)}`} title={plan}>{plan}</span>
                          </td>

                          <td className="px-4 py-2.5">
                             <div className="flex flex-col items-start gap-1.5">
                                {tieneImportante && (
                                    <span className="flex items-center gap-1 text-[9px] font-black text-red-600 bg-red-50 px-2 py-0.5 rounded-md border border-red-200 uppercase max-w-[170px] truncate" title={importante}>
                                        <AlertTriangle size={10} className="shrink-0" /> {importante}
                                    </span>
                                )}
                                {/* Teléfono Y correo, no uno u otro.
                                    Antes el correo solo aparecía cuando NO había teléfono,
                                    y el correo es justamente el dato con el que salen los
                                    recordatorios de pago: había que abrir la ficha para verlo. */}
                                {whatsapp && whatsapp !== 'SIN_DATO' && whatsapp !== 'Sin Registro' && (
                                    <a href={`https://wa.me/${whatsapp.replace(/\D/g,'')}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[10px] font-bold text-[#199b4d] hover:text-[#147a3d] transition-colors" onClick={(e) => e.stopPropagation()}>
                                        <MessageSquare size={12} className="shrink-0" /> {whatsapp}
                                    </a>
                                )}
                                {correo && correo !== 'SIN_DATO' ? (
                                    <span className="flex items-center gap-1 group/mail max-w-[190px]">
                                        <Mail size={11} className="shrink-0 text-slate-400" />
                                        <span className="text-[10px] text-slate-500 truncate" title={correo}>{correo}</span>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); copiar(correo, 'Correo copiado'); }}
                                            title="Copiar el correo"
                                            aria-label={`Copiar el correo de ${razonSocial}`}
                                            className="shrink-0 text-slate-300 hover:text-emerald-600 opacity-0 group-hover/mail:opacity-100 transition-opacity">
                                            <Copy size={11} />
                                        </button>
                                    </span>
                                ) : (!whatsapp || whatsapp === 'SIN_DATO') && (
                                    <span className="text-[10px] text-slate-400 italic">Sin contacto</span>
                                )}
                             </div>
                          </td>

                          {/* ESTADOS · dos filas, no tres apiladas.
                              Antes iban una debajo de otra y la deuda acumulada quedaba
                              justo encima del cobro del mes: se leían como el mismo dato
                              dicho dos veces, y cada cliente ocupaba el triple de alto.
                              Ahora la COBRANZA va arriba —deuda y cobro del mes juntos,
                              que es lo que se compara— y el F29 abajo, que es otro asunto. */}
                          <td className="px-4 py-2.5">
                             <div className="flex flex-col items-start gap-1">
                                <div className="flex items-center gap-1 flex-wrap">
                                    <span title={pSt.title} className={`flex items-center gap-1.5 text-[9px] font-black px-2 py-0.5 rounded-full border uppercase ${pSt.c}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${pSt.dot}`} /> {pSt.label}
                                    </span>
                                    <span className={`flex items-center gap-1.5 text-[9px] font-black px-2 py-0.5 rounded-full border uppercase ${cSt.c}`}
                                          title={`${cSt.title || ''}\n\nEsto es el cobro de ESTE mes. La etiqueta de al lado es la deuda acumulada: son cosas distintas.`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${cSt.dot}`} /> {cSt.label}
                                    </span>
                                </div>
                                <span className={`flex items-center gap-1.5 text-[9px] font-black px-2 py-0.5 rounded-full border uppercase ${fSt.c}`}
                                      title="Estado del formulario 29 del cliente. No tiene relación con el pago de honorarios.">
                                    <span className={`w-1.5 h-1.5 rounded-full ${fSt.dot}`} /> F29 {estadoFormulario}
                                </span>
                             </div>
                          </td>

                          {/* ÚLTIMA FACTURA · folio y cuándo se emitió.
                              Si lleva más de una este mes se dice al lado: el
                              folio solo muestra la más reciente, y desde que se
                              permiten varias facturas por mes eso podría dar a
                              entender que hubo una sola. */}
                          <td className="px-4 py-2.5">
                             {ultimoFolio ? (
                                <div className="flex flex-col gap-0.5">
                                    <span className="font-mono text-[11px] font-bold text-slate-700">
                                        N° {ultimoFolio}
                                        {facturasDelMes > 1 && (
                                            <span className="ml-1.5 text-[8px] font-black text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 py-0.5 uppercase"
                                                  title={`${facturasDelMes} facturas emitidas este mes`}>
                                                +{facturasDelMes - 1}
                                            </span>
                                        )}
                                    </span>
                                    <span className="text-[9px] text-slate-400">
                                        {ultimaEmision ? new Date(ultimaEmision).toLocaleDateString('es-CL') : ''}
                                    </span>
                                </div>
                             ) : (
                                <span className="text-[10px] text-slate-300 italic">Sin facturas</span>
                             )}
                          </td>

                          <td className="px-4 py-2.5 text-right">
                             <div className="flex flex-col items-end gap-0.5">
                                 <span className="text-slate-400 text-[8px] font-black uppercase tracking-widest">Neto mensual</span>
                                 <span className={`font-mono font-bold text-sm ${neto > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>${(isNaN(neto) ? 0 : neto).toLocaleString('es-CL')}</span>
                                 {/* SI NO CALZA CON SU TRAMO, SE DICE.
                                     No se cambia el precio solo: subirle el precio a
                                     un cliente es una conversación comercial, no un
                                     cálculo. Acá solo se avisa y se dice cuánto
                                     debería ser, para que alguien lo decida. */}
                                 {descalzado && (
                                    <span
                                       title={`Factura lo suficiente para el tramo de $${sugerido.toLocaleString('es-CL')}, y se le cobra $${neto.toLocaleString('es-CL')}.

${difPrecio > 0 ? 'Se le está cobrando de MENOS.' : 'Se le está cobrando de MÁS.'}

Abre la ficha para revisarlo: el precio no se cambia solo.`}
                                       className={`text-[9px] font-black tabular-nums px-1.5 py-0.5 rounded border ${
                                          difPrecio > 0
                                             ? 'text-amber-700 bg-amber-50 border-amber-200'
                                             : 'text-blue-700 bg-blue-50 border-blue-200'}`}>
                                       tramo ${sugerido.toLocaleString('es-CL')}
                                    </span>
                                 )}
                             </div>
                          </td>
                        </tr>
                      );
                    })}

                    {sortedClients.length === 0 && (
                      <tr>
                        <td colSpan={5 + (selectMode ? 1 : 0)} className="p-10 text-center">
                          <div className="flex flex-col items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-[#efe8dd] flex items-center justify-center text-slate-400">
                              <Users size={22} />
                            </div>
                            <p className="text-slate-500 text-sm">
                              {searchTerm || statusFilter !== 'Todos' || typeFilter !== 'Todos' || planFilter !== 'Todos'
                                ? 'Ningún cliente coincide con los filtros.'
                                : vista === 'usuarios' ? 'Aún no hay empresas creadas por tus clientes.'
                                : vista === 'baja' ? 'No tienes clientes dados de baja.'
                                : 'Aún no tienes clientes activos.'}
                            </p>
                            {onCrear && vista === 'activos' && !searchTerm && (
                              <button onClick={onCrear} className="bg-[#199b4d] hover:bg-[#147a3d] text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors">
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

            {/* TARJETAS — hasta 1024px (teléfono y tablet) */}
            <div className="lg:hidden flex-1 min-h-0 overflow-y-auto flex flex-col gap-2 pb-2">
              {sortedClients.map((client) => {
                const {
                  razonSocial, rut, completitud, tipoCliente, plan, importante,
                  whatsapp, correo, estadoFormulario, neto,
                  tieneImportante, pSt, fSt, cSt, accent, tituloFicha,
                } = derivar(client);
                const elegido = selectedClientId === client.id || selectedIds.has(client.id);

                return (
                  <div
                    key={client.id}
                    onClick={() => onClientSelect(client)}
                    className={`relative flex gap-3 rounded-2xl border bg-white p-3 pl-4 shadow-sm transition-colors ${
                      elegido ? 'border-emerald-300 bg-emerald-50/60' : 'border-[#efe8dd]'}`}
                  >
                    {/* Semáforo: el mismo criterio que la columna izquierda de la tabla */}
                    <span className={`absolute left-0 top-3 bottom-3 w-1 rounded-full ${accent}`} />

                    {selectMode && (
                      <input type="checkbox" checked={selectedIds.has(client.id)}
                        onChange={(e) => toggleRow(client.id, e)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 mt-1 accent-[#199b4d] shrink-0" />
                    )}

                    <div className="flex-1 min-w-0 flex flex-col gap-2">
                      {/* Nombre, RUT y monto */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-50 to-green-50 border border-[#efe8dd] flex items-center justify-center text-[#199b4d] shrink-0">
                            {tipoCliente === 'Empresa' ? <Building2 size={15} /> : <User size={15} />}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 text-xs uppercase tracking-tight truncate" title={razonSocial}>{razonSocial}</p>
                            <p className="text-[10px] text-slate-500 font-mono tracking-wider truncate">{rut}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-slate-400 text-[8px] font-black uppercase tracking-widest">Neto</p>
                          <p className={`font-mono font-bold text-sm ${neto > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                            ${(isNaN(neto) ? 0 : neto).toLocaleString('es-CL')}
                          </p>
                        </div>
                      </div>

                      {tieneImportante && (
                        <span className="flex items-center gap-1 text-[9px] font-black text-red-600 bg-red-50 px-2 py-1 rounded-md border border-red-200 uppercase">
                          <AlertTriangle size={10} className="shrink-0" />
                          <span className="truncate">{importante}</span>
                        </span>
                      )}

                      {/* Plan y estados, todos juntos: en una tarjeta no hay columnas */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`inline-block px-2 py-0.5 rounded-md text-[9px] font-black uppercase border ${getPlanColor(plan)}`}>{plan}</span>
                        <span className={`flex items-center gap-1.5 text-[9px] font-black px-2 py-0.5 rounded-full border uppercase ${pSt.c}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${pSt.dot}`} /> {pSt.label}
                        </span>
                        <span className={`flex items-center gap-1.5 text-[9px] font-black px-2 py-0.5 rounded-full border uppercase ${cSt.c}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cSt.dot}`} /> {cSt.label}
                        </span>
                        <span className={`flex items-center gap-1.5 text-[9px] font-black px-2 py-0.5 rounded-full border uppercase ${fSt.c}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${fSt.dot}`} /> F29 {estadoFormulario}
                        </span>
                      </div>

                      {/* Contacto: en teléfono estos dos son para TOCAR, no para leer */}
                      {(whatsapp && whatsapp !== 'SIN_DATO' && whatsapp !== 'Sin Registro') || (correo && correo !== 'SIN_DATO') ? (
                        <div className="flex items-center gap-3 flex-wrap">
                          {whatsapp && whatsapp !== 'SIN_DATO' && whatsapp !== 'Sin Registro' && (
                            <a href={`https://wa.me/${whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                               onClick={(e) => e.stopPropagation()}
                               className="flex items-center gap-1.5 text-[10px] font-bold text-[#199b4d]">
                              <MessageSquare size={12} className="shrink-0" /> {whatsapp}
                            </a>
                          )}
                          {correo && correo !== 'SIN_DATO' && (
                            <a href={`mailto:${correo}`} onClick={(e) => e.stopPropagation()}
                               className="flex items-center gap-1 min-w-0 text-[10px] text-slate-500">
                              <Mail size={11} className="shrink-0 text-slate-400" />
                              <span className="truncate">{correo}</span>
                            </a>
                          )}
                        </div>
                      ) : null}

                      {/* Completitud de la ficha */}
                      <div className="flex items-center gap-1.5" title={tituloFicha}>
                        <div className="h-1 flex-1 max-w-[120px] bg-slate-200 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${completitud >= 80 ? 'bg-emerald-500' : completitud >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                               style={{ width: `${completitud}%` }} />
                        </div>
                        <span className="text-[8px] font-black text-slate-400 tabular-nums">{completitud}% ficha</span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {sortedClients.length === 0 && (
                <div className="flex flex-col items-center gap-3 p-10 text-center rounded-2xl border border-[#efe8dd] bg-white">
                  <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-[#efe8dd] flex items-center justify-center text-slate-400">
                    <Users size={22} />
                  </div>
                  <p className="text-slate-500 text-sm">
                    {searchTerm || statusFilter !== 'Todos' || typeFilter !== 'Todos' || planFilter !== 'Todos'
                      ? 'Ningún cliente coincide con los filtros.'
                      : vista === 'usuarios' ? 'Aún no hay empresas creadas por tus clientes.'
                      : vista === 'baja' ? 'No tienes clientes dados de baja.'
                      : 'Aún no tienes clientes activos.'}
                  </p>
                  {onCrear && vista === 'activos' && !searchTerm && (
                    <button onClick={onCrear} className="bg-[#199b4d] hover:bg-[#147a3d] text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest">
                      + Crear el primer cliente
                    </button>
                  )}
                </div>
              )}
            </div>
        </div>
    );
};

export default CrmTableList;
