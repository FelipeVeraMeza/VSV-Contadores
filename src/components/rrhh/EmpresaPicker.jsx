import React, { useState } from 'react';
import { Building2, ChevronDown, Search, Check } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useBunkerData } from '@/components/crm/crmData';

const LABEL_PRINCIPAL = 'VOLLAIRE & OLIVOS SIMPLE PYME LTDA';

// Selector de empresa compacto (inline). Fija la empresa global del sistema.
export default function EmpresaPicker({ className = '' }) {
    const { user, selectedCompany, setSelectedCompany } = useAuth();
    const { clients, loading } = useBunkerData();
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const nombre = (c) => c.razon_social || c.razonSocial || '';
    const query = q.trim().toLowerCase();
    const esAdmin = user?.rol === 'Administrador';
    const principal = esAdmin ? (clients || []).find(c => nombre(c).trim().toUpperCase() === LABEL_PRINCIPAL) : null;
    const lista = (clients || []).filter(c => c !== principal && nombre(c).toLowerCase().includes(query)).slice(0, 100);
    const mostrarPrincipal = principal && nombre(principal).toLowerCase().includes(query);
    const elegir = (c) => {
        setSelectedCompany(c);
        try { localStorage.setItem('selectedCompany', JSON.stringify(c)); } catch { /* ignore */ }
        setOpen(false); setQ('');
    };

    return (
        <div className={`relative ${className}`}>
            <button onClick={() => setOpen(o => !o)} className={`flex items-center gap-2 rounded-xl px-3.5 h-10 text-sm transition-colors min-w-[240px] ${selectedCompany ? 'bg-slate-50 border border-[#efe8dd] text-slate-700' : 'bg-purple-500/10 border border-purple-500/30 text-purple-700'} hover:bg-slate-100`}>
                <Building2 className="h-4 w-4 text-purple-600 flex-shrink-0" />
                <span className="flex-1 text-left truncate">{selectedCompany ? nombre(selectedCompany) : 'Elegir empresa…'}</span>
                <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (<>
                <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                <div className="absolute left-0 top-12 z-50 w-[22rem] max-w-[90vw] rounded-xl border border-[#efe8dd] bg-white shadow-2xl p-2">
                    <div className="relative mb-2">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar empresa…"
                            className="w-full bg-slate-50 border border-[#efe8dd] rounded-lg pl-9 pr-3 py-2 text-sm text-slate-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/40" />
                    </div>
                    <div className="max-h-72 overflow-y-auto space-y-0.5">
                        {mostrarPrincipal && (
                            <button onClick={() => elegir(principal)} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left hover:bg-purple-500/10 border-b border-[#efe8dd] mb-1">
                                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center flex-shrink-0"><Building2 className="h-3.5 w-3.5 text-white" /></div>
                                <span className="flex-1 text-sm text-slate-900 font-medium truncate">{nombre(principal)}</span>
                                <span className="text-[9px] uppercase tracking-widest text-purple-700">Principal</span>
                            </button>
                        )}
                        {loading ? <div className="py-6 text-center text-slate-400 text-sm">Cargando…</div>
                            : lista.length ? lista.map(c => (
                                <button key={c.id} onClick={() => elegir(c)} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left hover:bg-slate-100">
                                    <div className="w-7 h-7 rounded-lg bg-slate-50 border border-[#efe8dd] flex items-center justify-center flex-shrink-0"><Building2 className="h-3.5 w-3.5 text-slate-500" /></div>
                                    <span className="flex-1 text-sm text-slate-700 truncate">{nombre(c)}</span>
                                    {selectedCompany?.id === c.id && <Check className="h-4 w-4 text-emerald-600" />}
                                </button>
                            )) : <div className="py-6 text-center text-slate-400 text-sm">Sin resultados</div>}
                    </div>
                </div>
            </>)}
        </div>
    );
}
