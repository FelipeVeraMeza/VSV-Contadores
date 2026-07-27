import React, { useState } from 'react';
import { Building2, ChevronDown, CheckCircle2, Search } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth.jsx';
import { useBunkerData } from '../crm/crmData'; 

const GlobalCompanySelector = () => {
    const { user, selectedCompany, setSelectedCompany } = useAuth();
    const { clients } = useBunkerData();
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');

    // Para el administrador, la "empresa principal" es VOLLAIRE & OLIVOS.
    // Para el resto (clientes) se mantiene el rótulo genérico.
    const esAdmin = user?.rol === 'Administrador';
    const etiquetaPrincipal = esAdmin ? 'VOLLAIRE & OLIVOS SIMPLE PYME LTDA' : 'EMPRESA PRINCIPAL';

    const filtered = clients.filter(c => {
        const nombre = (c.razon_social || c.razonSocial || '');
        const matchSearch = nombre.toLowerCase().includes(search.toLowerCase());
        // Para el admin, la empresa principal ya está como opción fija arriba:
        // evitamos que la misma empresa real aparezca duplicada en la lista.
        const esPrincipalDuplicada = esAdmin && nombre.trim().toUpperCase() === etiquetaPrincipal.toUpperCase();
        return matchSearch && !esPrincipalDuplicada;
    });

    return (
        <div className="relative">
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center gap-2 bg-white border border-[#e5ddd0] text-slate-700 text-xs font-black uppercase px-4 py-2 rounded-xl hover:bg-slate-50 transition-all w-64 shadow-sm ${!selectedCompany ? 'border-dashed border-[#199b4d]' : ''}`}
            >
                <Building2 size={14} className={selectedCompany ? "text-[#199b4d]" : "text-slate-400"} />
                <span className="truncate flex-1 text-left">
                    {selectedCompany ? (selectedCompany.razon_social || selectedCompany.razonSocial) : etiquetaPrincipal}
                </span>
                <ChevronDown size={14} />
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
                    <div className="absolute top-full right-0 mt-2 w-72 bg-white border border-[#e5ddd0] rounded-xl shadow-xl shadow-black/[0.08] p-2 z-50">
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
                            {/* OPCIÓN FIJA PARA EMPRESA PRINCIPAL */}
                            <button
                                onClick={() => {
                                    setSelectedCompany(null);
                                    localStorage.removeItem('selectedCompany');
                                    setIsOpen(false);
                                }}
                                className="w-full text-left px-4 py-2 text-xs text-[#199b4d] hover:bg-slate-100 rounded-lg border-b border-[#efe8dd] font-bold uppercase tracking-widest"
                            >
                                {etiquetaPrincipal}
                            </button>

                            {/* LISTA DE CLIENTES */}
                            {filtered.map(c => (
                                <button
                                    key={c.id}
                                    onClick={() => {
                                        setSelectedCompany(c);
                                        localStorage.setItem('selectedCompany', JSON.stringify(c));
                                        setIsOpen(false);
                                    }}
                                    className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-100 rounded-lg flex items-center justify-between"
                                >
                                    {c.razon_social || c.razonSocial}
                                    {selectedCompany?.id === c.id && <CheckCircle2 size={12} className="text-[#199b4d]" />}
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