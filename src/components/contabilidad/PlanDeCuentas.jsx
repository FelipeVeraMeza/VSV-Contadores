import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Search, Plus, Edit, Trash2, Loader2, ChevronRight, ChevronDown, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchWithAuth } from '@/services/apiClient';
import { toast } from '@/components/ui/use-toast';
import NuevaCuentaModal from '@/components/contabilidad/modals/NuevaCuentaModal';

/* ─── colores por familia ─────────────────────────────────── */
const FAM = {
  '1': { text: 'text-blue-400',    muted: 'text-blue-500/40',    hdr: 'bg-blue-950/60',   bar: 'bg-blue-500',    ring: 'border-blue-800/50' },
  '2': { text: 'text-red-400',     muted: 'text-red-500/40',     hdr: 'bg-red-950/60',    bar: 'bg-red-500',     ring: 'border-red-800/50' },
  '4': { text: 'text-orange-400',  muted: 'text-orange-500/40',  hdr: 'bg-orange-950/60', bar: 'bg-orange-500',  ring: 'border-orange-800/50' },
  '5': { text: 'text-emerald-400', muted: 'text-emerald-500/40', hdr: 'bg-emerald-950/60',bar: 'bg-emerald-500', ring: 'border-emerald-800/50' },
};
const getFam  = (codigo) => FAM[codigo?.[0]] ?? { text:'text-gray-400', muted:'text-gray-600', hdr:'bg-white/5', bar:'bg-gray-600', ring:'border-white/10' };

/* ─── nivel desde tipo_cuenta de la BD ───────────────────── */
const TIPO_TO_NIVEL = { GRUPO:0, SUBGRUPO:1, MAYOR:2, SUBCUENTA:3 };
const getNivel = (c) => TIPO_TO_NIVEL[(c.tipoCuenta ?? c.tipo_cuenta ?? '').toUpperCase()] ?? 0;

/* ─── construir árbol y orden DFS ────────────────────────── */
const buildDFS = (items) => {
  // mapa codigo → item
  const byCode = {};
  items.forEach(i => { byCode[i.codigo] = i; });

  // mapa padre → hijos directos
  const children = {};
  items.forEach(item => {
    const parent = item.grupo ?? null;   // campo `grupo` de la BD = código padre
    const key = parent ?? '__root__';
    if (!children[key]) children[key] = [];
    children[key].push(item);
  });

  // ordenar hijos alfabético-numérico
  Object.values(children).forEach(arr =>
    arr.sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }))
  );

  // recorrido DFS → orden correcto (padre inmediatamente antes de sus hijos)
  const ordered = [];
  const visit = (key) => {
    (children[key] || []).forEach(item => {
      ordered.push(item);
      visit(item.codigo);
    });
  };
  visit('__root__');
  return { ordered, children };
};

const FILTROS = [
  { id:'todos', label:'Todos' },
  { id:'1',     label:'Activos' },
  { id:'2',     label:'Pasivos' },
  { id:'4',     label:'Pérdidas' },
  { id:'5',     label:'Ganancias' },
];

/* ══════════════════════════════════════════════════════════ */
const PlanDeCuentas = ({ empresaId }) => {
  const { user }    = useAuth();
  const queryClient = useQueryClient();

  const [isModalOpen, setIsModalOpen]     = useState(false);
  const [selectedCuenta, setSelectedCuenta] = useState(null);
  const [searchTerm, setSearchTerm]       = useState('');
  const [deletingId, setDeletingId]       = useState(null);
  const [filtro, setFiltro]               = useState('todos');
  const [collapsed, setCollapsed]         = useState(new Set());
  const [ready, setReady]                 = useState(false);

  /* ── query ── */
  const { data, isLoading } = useQuery({
    queryKey: ['plan-cuentas-global'],
    queryFn: async () => {
      const res = await fetchWithAuth('/accounting/chart-of-accounts', user.sessionId);
      if (!res.ok) throw new Error('Error al obtener plan de cuentas');
      return res.json();
    },
    enabled: !!user?.sessionId,
    staleTime: 0,
  });

  const rawPlan = useMemo(() => data?.plan || [], [data]);

  /* ── estado inicial: subgrupos colapsados ── */
  useEffect(() => {
    if (!ready && rawPlan.length > 0) {
      setCollapsed(new Set(
        rawPlan.filter(c => getNivel(c) === 1).map(c => c.codigo)
      ));
      setReady(true);
    }
  }, [rawPlan, ready]);

  /* ── stats ── */
  const stats = useMemo(() => ({
    total:    rawPlan.length,
    activos:  rawPlan.filter(c => c.codigo?.startsWith('1')).length,
    pasivos:  rawPlan.filter(c => c.codigo?.startsWith('2')).length,
    perdidas: rawPlan.filter(c => c.codigo?.startsWith('4')).length,
    ganancias:rawPlan.filter(c => c.codigo?.startsWith('5')).length,
  }), [rawPlan]);

  /* ── árbol DFS filtrado ── */
  const { ordered, children } = useMemo(() => {
    let items = rawPlan;
    if (filtro !== 'todos') items = items.filter(c => c.codigo?.startsWith(filtro));
    return buildDFS(items);
  }, [rawPlan, filtro]);

  /* ── visibilidad: un nodo es visible si su padre directo NO está colapsado
        y si el padre también es visible (recursivo) ── */
  const visibleSet = useMemo(() => {
    const set = new Set();
    const visit = (parentKey, parentVisible) => {
      (children[parentKey] || []).forEach(item => {
        const visible = parentVisible && !collapsed.has(parentKey === '__root__' ? null : parentKey);
        // raíz siempre visible
        const isRoot = item.grupo == null;
        const show   = isRoot ? true : !collapsed.has(item.grupo);
        if (show) {
          // verificar que todos los ancestros están abiertos
          let cur = item.grupo;
          let ok  = true;
          while (cur) {
            if (collapsed.has(cur)) { ok = false; break; }
            const parent = ordered.find(o => o.codigo === cur);
            cur = parent?.grupo ?? null;
          }
          if (ok) set.add(item.codigo);
        }
        visit(item.codigo, show);
      });
    };
    visit('__root__', true);
    return set;
  }, [ordered, children, collapsed]);

  const hasChildren = useCallback((codigo) => !!(children[codigo]?.length), [children]);
  const toggle = (codigo) => setCollapsed(prev => {
    const next = new Set(prev);
    next.has(codigo) ? next.delete(codigo) : next.add(codigo);
    return next;
  });

  /* búsqueda: cuando hay término activo, mostrar todo coincidente sin colapsar */
  const displayItems = useMemo(() => {
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return ordered.filter(c =>
        c.descripcion?.toLowerCase().includes(q) || c.codigo?.includes(q)
      );
    }
    return ordered.filter(c => visibleSet.has(c.codigo));
  }, [ordered, visibleSet, searchTerm]);

  /* ── handlers ── */
  const handleOpenModal = (cuenta = null) => { setSelectedCuenta(cuenta); setIsModalOpen(true); };
  const handleGuardado  = () => queryClient.invalidateQueries(['plan-cuentas-global']);
  const handleEliminar  = async (cuenta) => {
    if (!confirm(`¿Eliminar ${cuenta.codigo} — ${cuenta.descripcion}?`)) return;
    setDeletingId(cuenta.id);
    try {
      const res = await fetchWithAuth(`/accounting/plan-cuentas/${cuenta.id}`, user.sessionId, { method: 'DELETE' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message);
      toast({ title: '✅ Cuenta eliminada', description: `${cuenta.codigo} — ${cuenta.descripcion}` });
      handleGuardado();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally { setDeletingId(null); }
  };

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <Loader2 className="h-10 w-10 text-blue-500 animate-spin opacity-40" />
      <p className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Cargando Plan de Cuentas...</p>
    </div>
  );

  /* ══════ render ══════ */
  return (
    <div className="space-y-5">

      {/* STATS */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { l:'Total',    v:stats.total,     c:'bg-white/50' },
          { l:'Activos',  v:stats.activos,   c:'bg-blue-500' },
          { l:'Pasivos',  v:stats.pasivos,   c:'bg-red-500' },
          { l:'Pérdidas', v:stats.perdidas,  c:'bg-orange-500' },
          { l:'Ganancias',v:stats.ganancias, c:'bg-emerald-500' },
        ].map(s => (
          <div key={s.l} className="bg-black/20 rounded-xl border border-white/5 px-4 py-3 flex items-center gap-3">
            <div className={`h-2 w-2 rounded-full flex-shrink-0 ${s.c}`} />
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-gray-500">{s.l}</p>
              <p className="text-xl font-black text-white leading-none mt-0.5">{s.v}</p>
            </div>
          </div>
        ))}
      </div>

      {/* TOOLBAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {FILTROS.map(f => (
            <button key={f.id} onClick={() => setFiltro(f.id)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                filtro === f.id ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-500 hover:text-white hover:bg-white/10 border border-white/5'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
            <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar código o nombre..."
              className="bg-black/40 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 w-52 transition-colors" />
          </div>
          <span className="text-[10px] font-black uppercase text-gray-600 tracking-widest whitespace-nowrap">
            {rawPlan.length} cuentas
          </span>
          <Button onClick={() => handleOpenModal()}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black uppercase text-[10px] tracking-widest flex-shrink-0">
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Nueva
          </Button>
        </div>
      </div>

      {/* TABLA */}
      <div className="bg-[#0f172a]/80 rounded-2xl border border-white/5 overflow-hidden shadow-2xl">
        {displayItems.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-3">
            <BookOpen className="h-8 w-8 text-gray-700" />
            <p className="text-xs font-black uppercase tracking-widest text-gray-600">
              {searchTerm ? `Sin resultados para "${searchTerm}"` : 'Sin cuentas.'}
            </p>
          </div>
        ) : (
          <div className="max-h-[62vh] overflow-y-auto custom-scrollbar">
            {displayItems.map((cuenta) => {
              const nivel     = getNivel(cuenta);
              const fam       = getFam(cuenta.codigo);
              const tieneHijos= hasChildren(cuenta.codigo);
              const isCol     = collapsed.has(cuenta.codigo);
              const esEdit    = (cuenta.esEditable ?? cuenta.es_editable) !== false;
              const childLen  = children[cuenta.codigo]?.length ?? 0;

              /* ── GRUPO (nivel 0) ── */
              if (nivel === 0) return (
                <div key={cuenta.id}
                  onClick={() => tieneHijos && toggle(cuenta.codigo)}
                  className={`flex items-center justify-between px-5 py-3.5 border-b ${fam.ring} ${fam.hdr} cursor-pointer select-none group transition-colors`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${fam.bar} bg-opacity-20`}>
                      {tieneHijos
                        ? isCol ? <ChevronRight className={`h-3 w-3 ${fam.text}`} />
                                : <ChevronDown  className={`h-3 w-3 ${fam.text}`} />
                        : <div className={`h-1.5 w-1.5 rounded-full ${fam.bar}`} />}
                    </div>
                    <span className={`font-mono text-[11px] font-black ${fam.muted}`}>{cuenta.codigo}</span>
                    <span className={`font-black text-sm uppercase tracking-wide ${fam.text}`}>{cuenta.descripcion}</span>
                    {childLen > 0 && (
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full bg-white/5 ${fam.muted}`}>{childLen}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded border ${fam.muted} border-current/20 bg-white/5`}>Grupo</span>
                    {esEdit && (
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                        <button onClick={() => handleOpenModal(cuenta)} className={`p-1.5 rounded ${fam.text} hover:bg-white/10`}><Edit className="h-3 w-3"/></button>
                        <button onClick={() => handleEliminar(cuenta)} disabled={deletingId===cuenta.id} className="p-1.5 rounded text-red-400 hover:bg-red-500/20 disabled:opacity-40">
                          {deletingId===cuenta.id ? <Loader2 className="h-3 w-3 animate-spin"/> : <Trash2 className="h-3 w-3"/>}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );

              /* ── SUBGRUPO (nivel 1) ── */
              if (nivel === 1) return (
                <div key={cuenta.id}
                  onClick={() => tieneHijos && toggle(cuenta.codigo)}
                  className="flex items-center justify-between pl-9 pr-5 py-2.5 border-b border-white/[0.05] hover:bg-white/[0.03] cursor-pointer select-none group transition-colors">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-0.5 h-4 rounded-full flex-shrink-0 ${fam.bar} opacity-40`} />
                    <div className="w-4 flex items-center justify-center flex-shrink-0">
                      {tieneHijos
                        ? isCol ? <ChevronRight className="h-3 w-3 text-gray-500"/>
                                : <ChevronDown  className="h-3 w-3 text-gray-500"/>
                        : null}
                    </div>
                    <span className={`font-mono text-[10px] font-bold flex-shrink-0 ${fam.muted}`}>{cuenta.codigo}</span>
                    <span className="text-xs font-bold uppercase tracking-wide text-gray-200 truncate">{cuenta.descripcion}</span>
                    {childLen > 0 && (
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-white/5 text-gray-600">{childLen}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded bg-white/5 text-gray-600 border border-white/5">Subgrupo</span>
                    {esEdit && (
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                        <button onClick={() => handleOpenModal(cuenta)} className="p-1.5 rounded text-yellow-400 hover:bg-yellow-500/20"><Edit className="h-3 w-3"/></button>
                        <button onClick={() => handleEliminar(cuenta)} disabled={deletingId===cuenta.id} className="p-1.5 rounded text-red-400 hover:bg-red-500/20 disabled:opacity-40">
                          {deletingId===cuenta.id ? <Loader2 className="h-3 w-3 animate-spin"/> : <Trash2 className="h-3 w-3"/>}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );

              /* ── MAYOR (nivel 2) ── */
              if (nivel === 2) return (
                <div key={cuenta.id}
                  onClick={() => tieneHijos && toggle(cuenta.codigo)}
                  className="flex items-center justify-between pl-16 pr-5 py-2 border-b border-white/[0.03] hover:bg-white/[0.025] cursor-pointer select-none group transition-colors">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-4 flex items-center justify-center flex-shrink-0">
                      {tieneHijos
                        ? isCol ? <ChevronRight className="h-3 w-3 text-gray-600"/>
                                : <ChevronDown  className="h-3 w-3 text-gray-600"/>
                        : <div className="h-1 w-1 rounded-full bg-gray-700"/>}
                    </div>
                    <span className="font-mono text-[10px] text-gray-600 font-bold flex-shrink-0">{cuenta.codigo}</span>
                    <span className="text-xs text-gray-300 font-semibold truncate">{cuenta.descripcion}</span>
                  </div>
                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <span className="text-[8px] font-black uppercase text-gray-700">Mayor</span>
                    {esEdit && (
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                        <button onClick={() => handleOpenModal(cuenta)} className="p-1.5 rounded text-yellow-400 hover:bg-yellow-500/20"><Edit className="h-3 w-3"/></button>
                        <button onClick={() => handleEliminar(cuenta)} disabled={deletingId===cuenta.id} className="p-1.5 rounded text-red-400 hover:bg-red-500/20 disabled:opacity-40">
                          {deletingId===cuenta.id ? <Loader2 className="h-3 w-3 animate-spin"/> : <Trash2 className="h-3 w-3"/>}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );

              /* ── SUBCUENTA (nivel 3) ── */
              return (
                <div key={cuenta.id}
                  className="flex items-center justify-between pl-24 pr-5 py-1.5 border-b border-white/[0.02] hover:bg-white/[0.02] select-none group transition-colors">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="h-px w-3 bg-gray-800 flex-shrink-0" />
                    <span className="font-mono text-[9px] text-gray-700 font-bold flex-shrink-0">{cuenta.codigo}</span>
                    <span className="text-[11px] text-gray-400 truncate">{cuenta.descripcion}</span>
                  </div>
                  {esEdit && (
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                      <button onClick={() => handleOpenModal(cuenta)} className="p-1.5 rounded text-yellow-400 hover:bg-yellow-500/20"><Edit className="h-3 w-3"/></button>
                      <button onClick={() => handleEliminar(cuenta)} disabled={deletingId===cuenta.id} className="p-1.5 rounded text-red-400 hover:bg-red-500/20 disabled:opacity-40">
                        {deletingId===cuenta.id ? <Loader2 className="h-3 w-3 animate-spin"/> : <Trash2 className="h-3 w-3"/>}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <NuevaCuentaModal
        isOpen={isModalOpen} setIsOpen={setIsModalOpen}
        onGuardado={handleGuardado} cuenta={selectedCuenta} empresaId={empresaId}
      />
    </div>
  );
};

export default PlanDeCuentas;
