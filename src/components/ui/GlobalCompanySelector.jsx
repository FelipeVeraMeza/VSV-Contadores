import React, { useState, useMemo } from 'react';
import { Building2, ChevronDown, CheckCircle2, Layers, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth.jsx';
import { useBunkerData } from '../crm/crmData';
import { useEmpresasLista } from '@/hooks/useEmpresasLista';

const LABEL_CONSOLIDADO = 'Todas las empresas';

const GlobalCompanySelector = () => {
    const { user, selectedCompany, setSelectedCompany } = useAuth();
    // Lista completa y confiable de empresas de la organización (incluye la principal).
    const { empresas, isLoading, error } = useEmpresasLista();
    // Datos ricos del CRM (RUT, credenciales SII…): solo existen para la cartera vigente.
    const { clients } = useBunkerData();
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');

    const porId = useMemo(() => new Map((clients || []).map(c => [c.id, c])), [clients]);

    // Cada opción lleva el objeto más completo disponible: si la empresa está en el
    // CRM se conserva tal cual (los módulos leen de ahí el RUT y la clave del SII);
    // si no está (la principal y las fuera de cartera), se arma uno mínimo válido.
    const opciones = useMemo(() => (empresas || []).map(e => ({
        id: e.id,
        nombre: e.razonSocial,
        esPrincipal: e.esPrincipal,
        empresa: {
            ...(porId.get(e.id) || {}),
            id: e.id,
            razon_social: e.razonSocial,
            razonSocial: e.razonSocial,
            esPrincipal: e.esPrincipal,
        },
    })), [empresas, porId]);

    const q = search.trim().toLowerCase();
    const filtered = q ? opciones.filter(o => o.nombre.toLowerCase().includes(q)) : opciones;

    const elegirEmpresa = (opcion) => {
        setSelectedCompany(opcion.empresa);
        localStorage.setItem('selectedCompany', JSON.stringify(opcion.empresa));
        // Deja de estar en modo consolidado.
        localStorage.removeItem('companyScope');
        setIsOpen(false);
        setSearch('');
    };

    const elegirConsolidado = () => {
        setSelectedCompany(null);
        localStorage.removeItem('selectedCompany');
        // Marca que el consolidado fue una elección deliberada, para que al recargar
        // no se vuelva a seleccionar sola la empresa principal.
        localStorage.setItem('companyScope', 'ALL');
        setIsOpen(false);
        setSearch('');
    };

    const etiquetaBoton = selectedCompany
        ? (selectedCompany.razon_social || selectedCompany.razonSocial)
        : LABEL_CONSOLIDADO;

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                // El ancho era fijo (w-64 = 256px). En un teléfono de 375px, sumado
                // al botón de menú, la campana y el resto del encabezado, empujaba
                // la barra fuera de la pantalla y dejaba TODA la aplicación con
                // scroll horizontal. Ahora se encoge hasta 140px y crece si hay sitio.
                className={`flex items-center gap-2 bg-white border border-[#e5ddd0] text-slate-700 text-xs font-black uppercase px-3 sm:px-4 py-2 rounded-xl hover:bg-slate-50 transition-all min-w-0 w-[140px] sm:w-56 lg:w-64 shadow-sm ${!selectedCompany ? 'border-dashed border-[#199b4d]' : ''}`}
            >
                {selectedCompany
                    ? <Building2 size={14} className="text-[#199b4d]" />
                    : <Layers size={14} className="text-slate-400" />}
                <span className="truncate flex-1 text-left">{etiquetaBoton}</span>
                <ChevronDown size={14} />
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
                    {/* `w-72` fijo se salía por el borde en pantallas angostas.
                        Con `max-w-[calc(100vw-2rem)]` nunca pasa del ancho visible. */}
                    <div className="absolute top-full right-0 mt-2 w-72 max-w-[calc(100vw-2rem)] bg-white border border-[#e5ddd0] rounded-xl shadow-xl shadow-black/[0.08] p-2 z-50">
                        <div className="p-2">
                            <input
                                autoFocus
                                placeholder="Buscar empresa..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full bg-white border border-[#e5ddd0] rounded-lg p-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#199b4d]"
                            />
                        </div>

                        <div className="max-h-60 overflow-y-auto custom-scrollbar">
                            {/* Vista consolidada: TODAS las empresas de la organización.
                                Es una vista, no una empresa — por eso va aparte y rotulada como tal. */}
                            <button
                                onClick={elegirConsolidado}
                                className="w-full text-left px-4 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-lg border-b border-[#efe8dd] font-bold uppercase tracking-widest flex items-center justify-between gap-2"
                            >
                                <span className="flex items-center gap-2"><Layers size={12} />{LABEL_CONSOLIDADO}</span>
                                {!selectedCompany && <CheckCircle2 size={12} className="text-[#199b4d]" />}
                            </button>

                            {error && (
                                <div className="px-4 py-4 text-[11px] text-amber-700 bg-amber-50 rounded-lg m-1 flex gap-2">
                                    <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                                    <span>No se pudo cargar la lista de empresas. Reinicia el backend e inténtalo de nuevo.</span>
                                </div>
                            )}

                            {isLoading && !error && (
                                <div className="px-4 py-4 text-xs text-slate-400">Cargando empresas…</div>
                            )}

                            {!isLoading && !error && filtered.length === 0 && (
                                <div className="px-4 py-4 text-xs text-slate-400">Sin resultados</div>
                            )}

                            {filtered.map(o => (
                                <button
                                    key={o.id}
                                    onClick={() => elegirEmpresa(o)}
                                    className={`w-full text-left px-4 py-2 text-xs rounded-lg flex items-center justify-between gap-2 hover:bg-slate-100 ${o.esPrincipal ? 'text-[#199b4d] font-bold border-b border-[#efe8dd]' : 'text-slate-700'}`}
                                >
                                    <span className="truncate">{o.nombre}</span>
                                    <span className="flex items-center gap-1.5 flex-shrink-0">
                                        {o.esPrincipal && <span className="text-[9px] uppercase tracking-widest text-[#199b4d]">Principal</span>}
                                        {selectedCompany?.id === o.id && <CheckCircle2 size={12} className="text-[#199b4d]" />}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default GlobalCompanySelector;
