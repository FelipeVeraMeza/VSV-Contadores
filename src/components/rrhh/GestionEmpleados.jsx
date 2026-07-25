import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, Filter, Plus, Upload, MoreVertical, Eye, Pencil, Lock, Trash2, ChevronLeft, ChevronRight, Loader2, FileWarning, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTrabajadoresApi, deleteTrabajadorApi } from '@/services/rrhhService';
import EditarEmpleadoModal from '@/components/rrhh/modals/EditarEmpleadoModal';

const iniciales = (n = '') => n.trim().split(/\s+/).slice(0, 2).map(p => p[0] || '').join('').toUpperCase() || '—';
const colorAvatar = (s = '') => {
    const cols = ['from-blue-500 to-cyan-500', 'from-violet-500 to-purple-500', 'from-emerald-500 to-green-500', 'from-rose-500 to-pink-500', 'from-amber-500 to-orange-500', 'from-indigo-500 to-blue-500'];
    let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return cols[h % cols.length];
};
const fmtFecha = (v) => { if (!v) return '—'; const d = String(v).slice(0, 10).split('-'); return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : '—'; };

// Menú desplegable (kebab) autocontenible.
const Menu = ({ items, trigger }) => {
    const [open, setOpen] = useState(false);
    return (
        <div className="relative inline-block">
            <button onClick={() => setOpen(o => !o)} className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
                {trigger || <MoreVertical className="h-4 w-4" />}
            </button>
            {open && (<>
                <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                <div className="absolute right-0 top-9 z-50 w-44 rounded-xl border border-white/10 bg-[#161425] shadow-2xl py-1">
                    {items.map((it, i) => {
                        const Icon = it.icon;
                        return (
                            <button key={i} onClick={() => { setOpen(false); it.onClick(); }} className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2.5 hover:bg-white/5 transition-colors ${it.danger ? 'text-red-400' : 'text-gray-200'}`}>
                                {Icon && <Icon className="h-4 w-4" />}{it.label}
                            </button>
                        );
                    })}
                </div>
            </>)}
        </div>
    );
};

// Select de filtro compacto: el placeholder es el nombre del filtro.
const Filtro = ({ label, allLabel, value, onChange, options }) => (
    <div className="w-full sm:w-40">
        <ThemedSelect value={value} onChange={(v) => onChange(v === '__all__' ? '' : v)} placeholder={label}
            options={[{ value: '__all__', label: allLabel || 'Todos' }, ...options]} />
    </div>
);

const OPT_TIPO = [{ value: 'indefinido', label: 'Indefinido' }, { value: 'plazo_fijo', label: 'Plazo Fijo' }, { value: 'por_obra', label: 'Obra o Faena' }];
const OPT_ESTADO = [{ value: 'Activo', label: 'Activo' }, { value: 'Inactivo', label: 'Inactivo' }];

const GestionEmpleados = ({ empresaId, onNew }) => {
    const { user, logout } = useAuth();
    const queryClient = useQueryClient();
    const consolidado = !empresaId;
    const [editId, setEditId] = useState(null);
    const [busqueda, setBusqueda] = useState('');
    const [fEmpresa, setFEmpresa] = useState('');
    const [fDepto, setFDepto] = useState('');
    const [fEstado, setFEstado] = useState('');
    const [fTipo, setFTipo] = useState('');
    const [porPagina, setPorPagina] = useState(10);
    const [pagina, setPagina] = useState(1);

    const { data: empleadosData = [], isLoading } = useQuery({
        queryKey: ['trabajadores', empresaId],
        queryFn: async () => {
            const res = await getTrabajadoresApi(user?.sessionId, empresaId);
            if (res.status === 401) { logout(); throw new Error("Sesión expirada"); }
            if (!res.ok) throw new Error("Error al obtener trabajadores");
            return res.json();
        },
        enabled: Boolean(empresaId) || consolidado ? !!user?.sessionId : false,
        staleTime: 1000 * 60 * 2,
    });

    const eliminar = useMutation({
        mutationFn: async (id) => { const res = await deleteTrabajadorApi(user?.sessionId, id); if (!res.ok) throw new Error("No se pudo eliminar"); return res.json(); },
        onSuccess: () => { toast({ title: "Trabajador eliminado" }); queryClient.invalidateQueries({ queryKey: ['trabajadores', empresaId] }); },
        onError: () => toast({ title: "Error", description: "No se pudo eliminar el trabajador.", variant: "destructive" }),
    });

    const empresas = useMemo(() => [...new Set(empleadosData.map(e => e.empresa).filter(Boolean))].sort(), [empleadosData]);
    const departamentos = useMemo(() => [...new Set(empleadosData.map(e => e.departamento).filter(d => d && d !== '—'))].sort(), [empleadosData]);

    const filtrados = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        return empleadosData.filter(e =>
            (!q || (e.nombre || '').toLowerCase().includes(q) || (e.rut || '').toLowerCase().includes(q) || (e.cargo || '').toLowerCase().includes(q) || (e.email || '').toLowerCase().includes(q)) &&
            (!fEmpresa || e.empresa === fEmpresa) &&
            (!fDepto || e.departamento === fDepto) &&
            (!fEstado || e.estado === fEstado) &&
            (!fTipo || e.tipoContrato === fTipo)
        );
    }, [empleadosData, busqueda, fEmpresa, fDepto, fEstado, fTipo]);

    useEffect(() => { setPagina(1); }, [busqueda, fEmpresa, fDepto, fEstado, fTipo, porPagina]);

    const totalPages = Math.max(1, Math.ceil(filtrados.length / porPagina));
    const page = Math.min(pagina, totalPages);
    const desde = (page - 1) * porPagina;
    const pageRows = filtrados.slice(desde, desde + porPagina);

    const pageItems = () => {
        if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
        const items = [1];
        const s = Math.max(2, page - 1), e = Math.min(totalPages - 1, page + 1);
        if (s > 2) items.push('…');
        for (let i = s; i <= e; i++) items.push(i);
        if (e < totalPages - 1) items.push('…');
        items.push(totalPages);
        return items;
    };

    const nuevo = () => onNew ? onNew() : toast({ title: 'Selecciona una empresa', description: 'Elige una empresa (arriba) para agregar un trabajador.' });
    const limpiar = () => { setBusqueda(''); setFEmpresa(''); setFDepto(''); setFEstado(''); setFTipo(''); };

    if (isLoading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-purple-500" /></div>;

    return (
        <div className="space-y-4">
            {/* Búsqueda + acciones */}
            <div className="flex flex-col md:flex-row md:items-center gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por nombre, RUT o cargo…"
                        className="w-full bg-white/[0.04] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50" />
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <Button onClick={nuevo} className="bg-gradient-to-r from-purple-500 to-violet-600 hover:from-purple-600 hover:to-violet-700 text-white font-semibold h-10 shadow-lg shadow-purple-900/20"><Plus className="h-4 w-4 mr-2" />Nuevo trabajador</Button>
                    <Button variant="outline" onClick={() => toast({ title: 'Importar', description: 'Carga masiva desde Excel — próximamente.' })} className="border-white/10 bg-white/[0.03] text-gray-200 hover:bg-white/[0.06] hover:text-white h-10"><Upload className="h-4 w-4 mr-2" />Importar</Button>
                    <Menu items={[{ label: 'Exportar', icon: Download, onClick: () => toast({ title: 'Exportar', description: 'Próximamente.' }) }, { label: 'Limpiar filtros', icon: Filter, onClick: limpiar }]} />
                </div>
            </div>

            {/* Filtros + contador */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                    {consolidado && <Filtro label="Empresa" allLabel="Todas las empresas" value={fEmpresa} onChange={setFEmpresa} options={empresas.map(e => ({ value: e, label: e }))} />}
                    <Filtro label="Departamento" allLabel="Todos los deptos." value={fDepto} onChange={setFDepto} options={departamentos.map(d => ({ value: d, label: d }))} />
                    <Filtro label="Estado" value={fEstado} onChange={setFEstado} options={OPT_ESTADO} />
                    <Filtro label="Tipo de contrato" value={fTipo} onChange={setFTipo} options={OPT_TIPO} />
                    {(busqueda || fEmpresa || fDepto || fEstado || fTipo) && (
                        <button onClick={limpiar} className="text-xs text-purple-400 hover:text-purple-300 font-medium px-2 py-1">Limpiar</button>
                    )}
                </div>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/10 text-xs text-gray-400 flex-shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />{filtrados.length} resultado{filtrados.length === 1 ? '' : 's'}
                </div>
            </div>

            {/* Tabla */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-white/10 bg-white/[0.03] text-gray-500">
                                {['Trabajador', 'RUT', 'Cargo', 'Departamento', ...(consolidado ? ['Empresa'] : []), 'Tipo contrato', 'Estado', 'Fecha ingreso'].map(h => (
                                    <th key={h} className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap">{h}</th>
                                ))}
                                <th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-wider">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.06]">
                            {pageRows.length ? pageRows.map((e, i) => (
                                <motion.tr key={e.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, delay: i * 0.02 }} className="group hover:bg-white/[0.03] transition-colors">
                                    <td className="px-5 py-3">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${colorAvatar(e.nombre)} flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0`}>{iniciales(e.nombre)}</div>
                                            <div className="min-w-0">
                                                <div className="text-sm text-white font-medium truncate">{e.nombre}</div>
                                                {e.email && <div className="text-[11px] text-gray-500 truncate">{e.email}</div>}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-5 py-3"><span className="inline-flex items-center gap-1.5 text-sm text-gray-300 font-mono text-xs"><Lock className="h-3 w-3 text-gray-600" />{e.rut}</span></td>
                                    <td className="px-5 py-3 text-sm text-gray-300 whitespace-nowrap">{e.cargo}</td>
                                    <td className="px-5 py-3 text-sm text-gray-400 whitespace-nowrap">{e.departamento}</td>
                                    {consolidado && <td className="px-5 py-3 text-sm text-gray-400 truncate max-w-[160px]">{e.empresa || '—'}</td>}
                                    <td className="px-5 py-3">
                                        {e.tipoContrato ? <span className={`inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-md ${e.tipoContrato === 'indefinido' ? 'bg-emerald-500/10 text-emerald-400' : e.tipoContrato === 'plazo_fijo' ? 'bg-blue-500/10 text-blue-400' : 'bg-amber-500/10 text-amber-400'}`}>{e.tipoContratoLabel}</span> : <span className="text-gray-600">—</span>}
                                    </td>
                                    <td className="px-5 py-3">
                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-semibold rounded-full ${e.estado === 'Activo' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${e.estado === 'Activo' ? 'bg-emerald-400' : 'bg-red-400'}`} />{e.estado}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3 text-sm text-gray-400 whitespace-nowrap">{fmtFecha(e.fechaIngreso)}</td>
                                    <td className="px-5 py-3">
                                        <div className="flex items-center justify-end gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => setEditId(e.id)} title="Ver / editar" className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-blue-400 hover:bg-blue-500/10"><Eye className="h-4 w-4" /></button>
                                            <button onClick={() => setEditId(e.id)} title="Editar" className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-yellow-400 hover:bg-yellow-500/10"><Pencil className="h-4 w-4" /></button>
                                            <Menu items={[
                                                { label: 'Editar ficha', icon: Pencil, onClick: () => setEditId(e.id) },
                                                { label: 'Eliminar', icon: Trash2, danger: true, onClick: () => { if (window.confirm(`¿Eliminar a ${e.nombre}?`)) eliminar.mutate(e.id); } },
                                            ]} />
                                        </div>
                                    </td>
                                </motion.tr>
                            )) : (
                                <tr><td colSpan={consolidado ? 9 : 8} className="text-center py-16">
                                    <div className="flex flex-col items-center text-gray-500">
                                        <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center mb-4"><FileWarning className="h-6 w-6 opacity-40" /></div>
                                        <h3 className="text-base font-semibold text-white">{empleadosData.length ? 'Sin resultados con esos filtros' : 'No hay trabajadores registrados'}</h3>
                                        <p className="text-sm mt-1">{empleadosData.length ? 'Ajusta o limpia los filtros.' : 'Agrega un trabajador para comenzar.'}</p>
                                    </div>
                                </td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Paginación */}
            {filtrados.length > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-sm">
                    <div className="flex items-center gap-2 text-gray-400">
                        <span>Mostrar</span>
                        <div className="w-20"><ThemedSelect value={String(porPagina)} onChange={(v) => setPorPagina(Number(v))} options={[10, 20, 50, 100].map(n => ({ value: String(n), label: String(n) }))} /></div>
                        <span>por página</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={page === 1} className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-gray-400 hover:bg-white/10 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
                        {pageItems().map((it, i) => it === '…'
                            ? <span key={i} className="px-2 text-gray-600">…</span>
                            : <button key={i} onClick={() => setPagina(it)} className={`h-8 min-w-8 px-2 rounded-lg text-sm font-medium transition-colors ${it === page ? 'bg-gradient-to-r from-purple-500 to-violet-600 text-white' : 'text-gray-400 hover:bg-white/10'}`}>{it}</button>)}
                        <button onClick={() => setPagina(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-gray-400 hover:bg-white/10 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
                    </div>
                    <div className="text-gray-500 text-xs">Mostrando {desde + 1} a {Math.min(desde + porPagina, filtrados.length)} de {filtrados.length} resultados</div>
                </div>
            )}

            <EditarEmpleadoModal isOpen={!!editId} setIsOpen={(v) => { if (!v) setEditId(null); }} trabajadorId={editId} empresaId={empresaId} />
        </div>
    );
};

export default GestionEmpleados;
