import React, { useState } from 'react';
import { Building2, ChevronDown, CheckCircle2, Search } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth.jsx';
import { useBunkerData } from '../crm/crmData'; 

const GlobalCompanySelector = () => {
    const { selectedCompany, setSelectedCompany } = useAuth();
    const { clients } = useBunkerData();
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');

    const filtered = clients.filter(c => 
        (c.razon_social || c.razonSocial || '').toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="relative">
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center gap-2 bg-[#0f172a]/90 border border-white/10 text-white text-xs font-black uppercase px-4 py-2 rounded-xl hover:bg-[#1e293b] transition-all w-64 shadow-lg ${!selectedCompany ? 'border-dashed border-blue-500' : ''}`}
            >
                <Building2 size={14} className={selectedCompany ? "text-emerald-400" : "text-gray-500"} />
                <span className="truncate flex-1 text-left">
                    {selectedCompany ? (selectedCompany.razon_social || selectedCompany.razonSocial) : 'EMPRESA PRINCIPAL'}
                </span>
                <ChevronDown size={14} />
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
                    <div className="absolute top-full right-0 mt-2 w-72 bg-[#0f172a] border border-white/10 rounded-xl shadow-2xl p-2 z-50">
                        <div className="p-2">
                            <input 
                                autoFocus
                                placeholder="Buscar empresa..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-xs text-white focus:outline-none"
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
                                className="w-full text-left px-4 py-2 text-xs text-blue-400 hover:bg-white/5 rounded-lg border-b border-white/5 font-bold uppercase tracking-widest"
                            >
                                EMPRESA PRINCIPAL
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
                                    className="w-full text-left px-4 py-2 text-xs text-gray-300 hover:bg-white/5 rounded-lg flex items-center justify-between"
                                >
                                    {c.razon_social || c.razonSocial}
                                    {selectedCompany?.id === c.id && <CheckCircle2 size={12} className="text-emerald-400" />}
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