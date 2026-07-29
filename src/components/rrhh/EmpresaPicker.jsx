import React, { useState } from 'react';
import { Building2, ChevronDown, Search, Check } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useBunkerData } from '@/components/crm/crmData';
import { useEmpresasLista } from '@/hooks/useEmpresasLista';

// Selector de empresa compacto (inline). Fija la empresa global del sistema.
export default function EmpresaPicker({ className = '' }) {
    const { selectedCompany, setSelectedCompany } = useAuth();
    // Misma fuente única que el selector del header: todas las empresas de la
    // organización, con la principal marcada y primera.
    const { empresas, principal, isLoading: loading } = useEmpresasLista();
    // El CRM aporta los datos ricos (RUT, credenciales SII) de la cartera vigente.
    const { clients } = useBunkerData();
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const nombre = (c) => c.razon_social || c.razonSocial || '';
    const query = q.trim().toLowerCase();

    const porId = new Map((clients || []).map(c => [c.id, c]));
    const completar = (e) => ({
        ...(porId.get(e.id) || {}),
        id: e.id,
        razon_social: e.razonSocial,
        razonSocial: e.razonSocial,
        esPrincipal: e.esPrincipal,
    });

    const lista = empresas.filter(e => !e.esPrincipal && e.razonSocial.toLowerCase().includes(query)).slice(0, 100);
    const mostrarPrincipal = principal && principal.razonSocial.toLowerCase().includes(query);
    const elegir = (c) => {
        setSelectedCompany(c);
        try { localStorage.setItem('selectedCompany', JSON.stringify(c)); } catch { /* ignore */ }
        localStorage.removeItem('companyScope');
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
                            <button onClick={() => elegir(completar(principal))} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left hover:bg-purple-500/10 border-b border-[#efe8dd] mb-1">
                                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center flex-shrink-0"><Building2 className="h-3.5 w-3.5 text-white" /></div>
                                <span className="flex-1 text-sm text-slate-900 font-medium truncate">{principal.razonSocial}</span>
                                <span className="text-[9px] uppercase tracking-widest text-purple-700">Principal</span>
                            </button>
                        )}
                        {loading ? <div className="py-6 text-center text-slate-400 text-sm">Cargando…</div>
                            : lista.length ? lista.map(e => (
                                <button key={e.id} onClick={() => elegir(completar(e))} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left hover:bg-slate-100">
                                    <div className="w-7 h-7 rounded-lg bg-slate-50 border border-[#efe8dd] flex items-center justify-center flex-shrink-0"><Building2 className="h-3.5 w-3.5 text-slate-500" /></div>
                                    <span className="flex-1 text-sm text-slate-700 truncate">{e.razonSocial}</span>
                                    {selectedCompany?.id === e.id && <Check className="h-4 w-4 text-emerald-600" />}
                                </button>
                            )) : <div className="py-6 text-center text-slate-400 text-sm">Sin resultados</div>}
                    </div>
                </div>
            </>)}
        </div>
    );
}
