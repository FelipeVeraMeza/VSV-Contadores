// =====================================================================
// CATÁLOGO · planes, sus variantes de precio, y servicios
// ---------------------------------------------------------------------
// POR QUÉ EXISTE
// «Los planes de contabilidad cambian según el nivel de facturación de la
// empresa, eso es una variante. Otra puede ser la cantidad de trabajadores
// para RRHH. Hay que poder configurarlo en algún lugar para que ciertos
// usuarios lo puedan hacer y no solo a nivel de código.»
//
// La tabla de tramos ya existía y estaba cargada; lo que no había era dónde
// tocarla. Cambiar un precio significaba entrar a la base a mano.
//
// CÓMO SE LEE
// Cada plan es una fila que se despliega y muestra su escalera de tramos:
// desde cuánto factura la empresa, hasta cuánto, qué se le cobra y cuántos
// trabajadores de RRHH entran incluidos. Es la misma forma en que está escrita
// la lista de precios en papel, y a propósito: si en pantalla se ve distinto,
// hay que traducir mentalmente cada vez.
//
// LOS TRAMOS SE GUARDAN JUNTOS
// Un tramo aislado no significa nada; lo que importa es que la escalera no
// tenga huecos ni solapes. El servidor lo valida y devuelve el motivo exacto
// («dos tramos se pisan: uno llega a X y el siguiente arranca en Y»).
// =====================================================================
import React, { useState, useEffect, useCallback } from 'react';
import {
    Loader2, Plus, Trash2, ChevronRight, Package, Wrench,
    AlertTriangle, Check, X, Pencil,
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import {
    catalogoApi, crearPlanApi, actualizarPlanApi, eliminarPlanApi,
    guardarTramosApi, crearServicioApi, actualizarServicioApi,
} from '@/services/crmService';

const getUser = () => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } };
const getSessionId = () => getUser().sessionId;

const pesos = (n) => '$' + Number(n || 0).toLocaleString('es-CL');
const inp = 'bg-slate-50 border border-[#efe8dd] rounded-lg px-2 py-1 text-xs text-slate-700 outline-none focus:border-emerald-500';

// ---------------------------------------------------------------
// La escalera de tramos de un plan
// ---------------------------------------------------------------
const Tramos = ({ plan, onGuardado }) => {
    const [filas, setFilas] = useState(plan.tramos || []);
    const [guardando, setGuardando] = useState(false);
    const [sucio, setSucio] = useState(false);

    useEffect(() => { setFilas(plan.tramos || []); setSucio(false); }, [plan.tramos]);

    const set = (i, campo, valor) => {
        setFilas(prev => prev.map((f, j) => j === i ? { ...f, [campo]: valor } : f));
        setSucio(true);
    };
    const quitar = (i) => { setFilas(prev => prev.filter((_, j) => j !== i)); setSucio(true); };
    const agregar = () => {
        // El nuevo arranca donde termina el último: es como se escribe una
        // escalera, y evita el solape más común de todos.
        const ultimo = filas[filas.length - 1];
        setFilas(prev => [...prev, {
            min: ultimo ? ultimo.max : 0,
            max: ultimo ? Number(ultimo.max) + 10000000 : 3000000,
            precioNeto: 0, rrhhGratis: 0, activo: true,
        }]);
        setSucio(true);
    };

    const guardar = async () => {
        setGuardando(true);
        try {
            const r = await guardarTramosApi(getSessionId(), plan.id, filas);
            const d = await r.json();
            if (!d.success) throw new Error(d.message);
            toast({ title: 'Tramos guardados', description: `${plan.nombre}: ${d.tramos} tramo(s).` });
            setSucio(false);
            onGuardado();
        } catch (e) {
            toast({ variant: 'destructive', title: 'No se pudo guardar', description: e.message });
        } finally { setGuardando(false); }
    };

    return (
        <div className="bg-[#faf8f5] border-t border-[#efe8dd] px-4 py-3">
            {filas.length === 0 ? (
                <p className="text-[11px] text-slate-400 italic mb-2">
                    Sin tramos: este plan cobra siempre {pesos(plan.precioBase)}.
                </p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-[11px]">
                        <thead>
                            <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                <th className="text-left pb-1.5 pr-2">Factura desde</th>
                                <th className="text-left pb-1.5 pr-2">Hasta</th>
                                <th className="text-left pb-1.5 pr-2">Se le cobra</th>
                                <th className="text-left pb-1.5 pr-2" title="Trabajadores de RRHH incluidos sin costo">
                                    RRHH incl.
                                </th>
                                <th className="pb-1.5 w-6" />
                            </tr>
                        </thead>
                        <tbody>
                            {filas.map((f, i) => (
                                <tr key={i} className="border-t border-[#efe8dd]/60">
                                    <td className="py-1 pr-2">
                                        <input type="number" value={f.min} onChange={(e) => set(i, 'min', e.target.value)}
                                            className={`${inp} w-28 tabular-nums`} />
                                    </td>
                                    <td className="py-1 pr-2">
                                        <input type="number" value={f.max} onChange={(e) => set(i, 'max', e.target.value)}
                                            className={`${inp} w-28 tabular-nums`} />
                                    </td>
                                    <td className="py-1 pr-2">
                                        <input type="number" value={f.precioNeto} onChange={(e) => set(i, 'precioNeto', e.target.value)}
                                            className={`${inp} w-24 tabular-nums`} />
                                    </td>
                                    <td className="py-1 pr-2">
                                        <input type="number" value={f.rrhhGratis} onChange={(e) => set(i, 'rrhhGratis', e.target.value)}
                                            className={`${inp} w-16 tabular-nums`} />
                                    </td>
                                    <td className="py-1">
                                        <button onClick={() => quitar(i)} title="Quitar este tramo"
                                            className="text-slate-300 hover:text-red-500"><Trash2 size={12} /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <div className="flex items-center gap-2 mt-2">
                <button onClick={agregar}
                    className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-600 hover:text-emerald-700">
                    <Plus size={11} /> Tramo
                </button>
                {sucio && (
                    <button onClick={guardar} disabled={guardando}
                        className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest">
                        {guardando ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Guardar
                    </button>
                )}
                {sucio && <span className="text-[10px] text-amber-600">Sin guardar</span>}
            </div>
        </div>
    );
};

// ---------------------------------------------------------------
const FilaPlan = ({ plan, abierto, onAbrir, onCambio, puedeEditar }) => {
    const [editando, setEditando] = useState(false);
    const [nombre, setNombre] = useState(plan.nombre);
    const [precio, setPrecio] = useState(plan.precioBase);

    const guardar = async () => {
        try {
            const r = await actualizarPlanApi(getSessionId(), plan.id, { nombre, precioBase: precio });
            const d = await r.json();
            if (!d.success) throw new Error(d.message);
            setEditando(false); onCambio();
        } catch (e) { toast({ variant: 'destructive', title: 'No se pudo guardar', description: e.message }); }
    };

    const eliminar = async () => {
        if (!window.confirm(`¿Eliminar el plan «${plan.nombre}»?`)) return;
        try {
            const r = await eliminarPlanApi(getSessionId(), plan.id);
            const d = await r.json();
            if (!d.success) throw new Error(d.message);
            toast({ title: 'Plan eliminado' }); onCambio();
        } catch (e) { toast({ variant: 'destructive', title: 'No se pudo eliminar', description: e.message }); }
    };

    return (
        <div className="bg-white border border-[#efe8dd] rounded-xl overflow-hidden">
            <div className="flex items-center gap-2.5 px-4 py-2.5">
                <button onClick={onAbrir} className="text-slate-400 hover:text-slate-700 shrink-0">
                    <ChevronRight size={14} className={`transition-transform ${abierto ? 'rotate-90' : ''}`} />
                </button>

                {editando ? (
                    <>
                        <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={`${inp} flex-1`} />
                        <input type="number" value={precio} onChange={(e) => setPrecio(e.target.value)}
                            className={`${inp} w-24 tabular-nums`} />
                        <button onClick={guardar} className="text-emerald-600 hover:text-emerald-700"><Check size={14} /></button>
                        <button onClick={() => { setEditando(false); setNombre(plan.nombre); setPrecio(plan.precioBase); }}
                            className="text-slate-400 hover:text-slate-700"><X size={14} /></button>
                    </>
                ) : (
                    <>
                        <button onClick={onAbrir} className="flex-1 text-left min-w-0">
                            <span className="text-xs font-bold text-slate-900">{plan.nombre}</span>
                            <span className="ml-2 text-[10px] text-slate-400">
                                {plan.tramos.length > 0
                                    ? `${plan.tramos.length} tramo${plan.tramos.length > 1 ? 's' : ''} · ${pesos(plan.tramos[0].precioNeto)} a ${pesos(plan.tramos[plan.tramos.length - 1].precioNeto)}`
                                    : `precio único ${pesos(plan.precioBase)}`}
                            </span>
                        </button>
                        {/* Cuántas empresas lo usan: sin este número, borrar es a ciegas. */}
                        <span className="text-[10px] text-slate-400 tabular-nums shrink-0"
                              title={`${plan.empresas} empresa(s) con este plan`}>
                            {plan.empresas}
                        </span>
                        {puedeEditar && (
                            <>
                                <button onClick={() => setEditando(true)} title="Editar"
                                    className="text-slate-300 hover:text-slate-700"><Pencil size={12} /></button>
                                <button onClick={eliminar} title="Eliminar"
                                    className="text-slate-300 hover:text-red-500"><Trash2 size={12} /></button>
                            </>
                        )}
                    </>
                )}
            </div>
            {abierto && <Tramos plan={plan} onGuardado={onCambio} />}
        </div>
    );
};

// ---------------------------------------------------------------
const CatalogoPanel = () => {
    const [datos, setDatos] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState(null);
    const [abierto, setAbierto] = useState(null);
    const [nuevoPlan, setNuevoPlan] = useState('');
    const [nuevoServicio, setNuevoServicio] = useState('');
    const [catNueva, setCatNueva] = useState('Soporte');
    const puedeEditar = getUser().rol === 'Administrador';

    const cargar = useCallback(async () => {
        setError(null);
        try {
            const r = await catalogoApi(getSessionId());
            const d = await r.json();
            if (!d.success) throw new Error(d.message || 'No se pudo cargar el catálogo.');
            setDatos(d);
        } catch (e) { setError(e.message); }
        finally { setCargando(false); }
    }, []);
    useEffect(() => { cargar(); }, [cargar]);

    const agregarPlan = async () => {
        const nombre = nuevoPlan.trim();
        if (!nombre) return;
        try {
            const r = await crearPlanApi(getSessionId(), { nombre, precioBase: 0 });
            const d = await r.json();
            if (!d.success) throw new Error(d.message);
            setNuevoPlan(''); cargar();
            toast({ title: 'Plan creado', description: 'Ahora agrégale sus tramos de precio.' });
        } catch (e) { toast({ variant: 'destructive', title: 'No se pudo crear', description: e.message }); }
    };

    const agregarServicio = async () => {
        const nombre = nuevoServicio.trim();
        if (!nombre) return;
        try {
            const r = await crearServicioApi(getSessionId(), { nombre, categoria: catNueva });
            const d = await r.json();
            if (!d.success) throw new Error(d.message);
            setNuevoServicio(''); cargar();
            toast({ title: 'Servicio creado' });
        } catch (e) { toast({ variant: 'destructive', title: 'No se pudo crear', description: e.message }); }
    };

    const alternarServicio = async (s) => {
        try {
            const r = await actualizarServicioApi(getSessionId(), s.id, { activo: !s.activo });
            const d = await r.json();
            if (!d.success) throw new Error(d.message);
            cargar();
        } catch (e) { toast({ variant: 'destructive', title: 'No se pudo cambiar', description: e.message }); }
    };

    if (cargando) return (
        <div className="flex items-center justify-center py-20 text-slate-400"><Loader2 className="animate-spin" /></div>
    );
    if (error) return (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-2">
            <AlertTriangle className="text-amber-500" size={28} />
            <p className="text-xs text-slate-500">{error}</p>
            <button onClick={cargar} className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Reintentar</button>
        </div>
    );

    return (
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-4 p-1">
            {!puedeEditar && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Puedes mirar el catálogo, pero solo un administrador lo modifica.
                </p>
            )}

            {/* PLANES */}
            <section>
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-1.5">
                        <Package size={13} className="text-emerald-600" /> Planes
                        <span className="text-slate-400">({datos.planes.length})</span>
                    </span>
                    {puedeEditar && (
                        <div className="flex items-center gap-1.5">
                            <input value={nuevoPlan} onChange={(e) => setNuevoPlan(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') agregarPlan(); }}
                                placeholder="Nombre del plan nuevo" className={`${inp} w-52`} />
                            <button onClick={agregarPlan}
                                className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest">
                                <Plus size={11} /> Plan
                            </button>
                        </div>
                    )}
                </div>

                <p className="text-[11px] text-slate-500 mb-2">
                    Cada plan puede cobrar distinto según cuánto factura la empresa. Despliega uno
                    para ver o cambiar sus tramos.
                </p>

                <div className="flex flex-col gap-1.5">
                    {datos.planes.map(p => (
                        <FilaPlan key={p.id} plan={p} abierto={abierto === p.id}
                            onAbrir={() => setAbierto(abierto === p.id ? null : p.id)}
                            onCambio={cargar} puedeEditar={puedeEditar} />
                    ))}
                </div>
            </section>

            {/* SERVICIOS */}
            <section>
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-1.5">
                        <Wrench size={13} className="text-blue-600" /> Servicios
                        <span className="text-slate-400">({datos.servicios.length})</span>
                    </span>
                    {puedeEditar && (
                        <div className="flex items-center gap-1.5">
                            <input value={nuevoServicio} onChange={(e) => setNuevoServicio(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') agregarServicio(); }}
                                placeholder="Nombre del servicio nuevo" className={`${inp} w-44`} />
                            {/* La categoría es obligatoria en la base; se elige acá
                                para no crear el servicio y tener que corregirlo. */}
                            <select value={catNueva} onChange={(e) => setCatNueva(e.target.value)}
                                title="Categoría del servicio" className={`${inp} cursor-pointer`}>
                                {(datos.categorias || ['Soporte']).map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <button onClick={agregarServicio}
                                className="flex items-center gap-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest">
                                <Plus size={11} /> Servicio
                            </button>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-1.5">
                    {datos.servicios.map(s => (
                        <div key={s.id}
                            className={`flex items-center gap-2 bg-white border rounded-xl px-3 py-2 ${
                                s.activo ? 'border-[#efe8dd]' : 'border-[#efe8dd] opacity-55'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.activo ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                            <span className="min-w-0 flex-1">
                                <span className="block text-[11px] font-bold text-slate-800 truncate">{s.nombre}</span>
                                {s.categoria && <span className="block text-[9px] text-slate-400">{s.categoria}</span>}
                            </span>
                            {/* Se desactiva, no se borra: un servicio contratado no
                                puede desaparecer del historial de nadie. */}
                            {puedeEditar && (
                                <button onClick={() => alternarServicio(s)}
                                    title={s.activo ? 'Dejar de ofrecerlo' : 'Volver a ofrecerlo'}
                                    className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-700 shrink-0">
                                    {s.activo ? 'Activo' : 'Inactivo'}
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
};

export default CatalogoPanel;
