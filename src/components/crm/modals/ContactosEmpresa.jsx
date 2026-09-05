// =====================================================================
// LAS PERSONAS DE UNA EMPRESA
// ---------------------------------------------------------------------
// POR QUÉ EXISTE
// «Hay que añadir a una empresa nombres de personas externas o internas, para
// no tener problemas de quién me pagó por esa factura.»
//
// NO ES EL REPRESENTANTE LEGAL
// El representante es quien firma ante el SII, y de él sale el RUT con el que
// el robot entra al portal. Vive en su propia sección y no se toca desde acá.
// Estas son las personas con las que uno TRATA: quien transfiere el pago, el
// contador externo, la secretaria que contesta.
//
// INTERNAS Y EXTERNAS
// La distinción la pidió Felipe explícitamente. Externa = no trabaja en la
// empresa cliente pero igual participa; el caso típico es el contador de
// afuera que hace las transferencias.
//
// A QUIEN YA PAGÓ ALGO NO SE LE BORRA
// Se desactiva. Si se borrara, el cobro se quedaría sin poder decir quién pagó,
// y eso es dato contable. El servidor lo resuelve solo y avisa qué hizo.
// =====================================================================
import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, Plus, Trash2, Users, X, Check, AlertTriangle } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import {
    contactosApi, crearContactoApi, actualizarContactoApi, eliminarContactoApi,
} from '@/services/crmService';

const getSessionId = () => {
    try { return JSON.parse(localStorage.getItem('user') || '{}').sessionId; } catch { return null; }
};

const inp = 'bg-slate-50 border border-[#efe8dd] rounded-lg px-2 py-1 text-xs text-slate-700 outline-none focus:border-emerald-500';

// El color dice el rol de un vistazo. «Pagador» es el que importa para
// responder «¿quién me pagó?», así que es el único con color fuerte.
const ROL_COLOR = {
    pagador:        'text-emerald-700 bg-emerald-50 border-emerald-200',
    contador:       'text-blue-700 bg-blue-50 border-blue-200',
    representante:  'text-violet-700 bg-violet-50 border-violet-200',
    contacto:       'text-slate-600 bg-slate-100 border-slate-200',
    otro:           'text-slate-600 bg-slate-100 border-slate-200',
};

const VACIO = { nombre: '', rol: 'contacto', externo: false, rut: '', email: '', telefono: '' };

const ContactosEmpresa = ({ empresaId }) => {
    const [contactos, setContactos] = useState([]);
    const [roles, setRoles] = useState(['contacto', 'pagador', 'contador', 'representante', 'otro']);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState(null);
    const [nuevo, setNuevo] = useState(null);   // null = el formulario está cerrado
    const [guardando, setGuardando] = useState(false);

    const cargar = useCallback(async () => {
        if (!empresaId) return;
        setError(null);
        try {
            const r = await contactosApi(getSessionId(), empresaId);
            const d = await r.json();
            if (!d.success) throw new Error(d.message || 'No se pudieron cargar.');
            setContactos(d.contactos || []);
            if (d.roles?.length) setRoles(d.roles);
        } catch (e) { setError(e.message); }
        finally { setCargando(false); }
    }, [empresaId]);

    useEffect(() => { cargar(); }, [cargar]);

    const agregar = async () => {
        if (!nuevo?.nombre?.trim() || guardando) return;
        setGuardando(true);
        try {
            const r = await crearContactoApi(getSessionId(), empresaId, nuevo);
            const d = await r.json();
            if (!d.success) throw new Error(d.message);
            setNuevo(null);
            cargar();
            toast({ title: 'Persona agregada' });
        } catch (e) {
            toast({ variant: 'destructive', title: 'No se pudo agregar', description: e.message });
        } finally { setGuardando(false); }
    };

    const cambiarRol = async (c, rol) => {
        try {
            const r = await actualizarContactoApi(getSessionId(), c.id, { rol });
            const d = await r.json();
            if (!d.success) throw new Error(d.message);
            cargar();
        } catch (e) {
            toast({ variant: 'destructive', title: 'No se pudo cambiar', description: e.message });
        }
    };

    const quitar = async (c) => {
        if (!window.confirm(`¿Quitar a ${c.nombre} de esta empresa?`)) return;
        try {
            const r = await eliminarContactoApi(getSessionId(), c.id);
            const d = await r.json();
            if (!d.success) throw new Error(d.message);
            cargar();
            // El servidor decide si borra o desactiva según si esa persona ya
            // figura como pagador; se dice cuál de las dos hizo.
            toast({
                title: d.desactivado ? 'Persona desactivada' : 'Persona eliminada',
                description: d.message || undefined,
            });
        } catch (e) {
            toast({ variant: 'destructive', title: 'No se pudo quitar', description: e.message });
        }
    };

    if (cargando) return (
        <div className="flex items-center gap-2 text-[11px] text-slate-400 py-2">
            <Loader2 size={12} className="animate-spin" /> Cargando personas…
        </div>
    );
    if (error) return (
        <p className="text-[11px] text-amber-700 flex items-center gap-1.5 py-2">
            <AlertTriangle size={12} /> {error}
        </p>
    );

    return (
        <div className="flex flex-col gap-1.5">
            {contactos.length === 0 && !nuevo && (
                <p className="text-[11px] text-slate-400 italic">
                    Sin personas cargadas. Agrega a quien paga, al contador o a quien contactas.
                </p>
            )}

            {contactos.map(c => (
                <div key={c.id}
                     className={`flex items-center gap-2 bg-white border border-[#efe8dd] rounded-lg px-2.5 py-1.5 ${
                        c.activo ? '' : 'opacity-55'}`}>
                    <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[11px] font-bold text-slate-800 truncate">{c.nombre}</span>
                            {c.externo && (
                                <span className="text-[8px] font-black uppercase tracking-widest text-amber-700 bg-amber-50 border border-amber-200 px-1 py-0.5 rounded"
                                      title="No trabaja en la empresa cliente, pero participa">
                                    Externo
                                </span>
                            )}
                            {!c.activo && (
                                <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">
                                    Inactivo
                                </span>
                            )}
                        </span>
                        <span className="flex items-center gap-2 mt-0.5 flex-wrap text-[9px] text-slate-400">
                            {c.rut && <span className="font-mono">{c.rut}</span>}
                            {c.email && <span className="truncate max-w-[150px]">{c.email}</span>}
                            {c.telefono && <span>{c.telefono}</span>}
                        </span>
                    </span>

                    <select value={c.rol} onChange={(e) => cambiarRol(c, e.target.value)}
                        title="Para qué sirve esta persona"
                        className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border cursor-pointer shrink-0 ${ROL_COLOR[c.rol] || ROL_COLOR.otro}`}>
                        {roles.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>

                    <button onClick={() => quitar(c)} title="Quitar de esta empresa"
                        className="text-slate-300 hover:text-red-500 shrink-0"><Trash2 size={12} /></button>
                </div>
            ))}

            {nuevo ? (
                <div className="bg-slate-50 border border-[#efe8dd] rounded-lg p-2.5 flex flex-col gap-1.5">
                    <div className="grid grid-cols-2 gap-1.5">
                        <input autoFocus value={nuevo.nombre} placeholder="Nombre *"
                            onChange={(e) => setNuevo(p => ({ ...p, nombre: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === 'Enter') agregar(); }}
                            className={inp} />
                        <select value={nuevo.rol} onChange={(e) => setNuevo(p => ({ ...p, rol: e.target.value }))}
                            className={`${inp} cursor-pointer`}>
                            {roles.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <input value={nuevo.rut} placeholder="RUT"
                            onChange={(e) => setNuevo(p => ({ ...p, rut: e.target.value }))} className={inp} />
                        <input value={nuevo.telefono} placeholder="Teléfono"
                            onChange={(e) => setNuevo(p => ({ ...p, telefono: e.target.value }))} className={inp} />
                        <input value={nuevo.email} placeholder="Correo" className={`${inp} col-span-2`}
                            onChange={(e) => setNuevo(p => ({ ...p, email: e.target.value }))} />
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1.5 text-[10px] text-slate-600 cursor-pointer">
                            <input type="checkbox" checked={nuevo.externo}
                                onChange={(e) => setNuevo(p => ({ ...p, externo: e.target.checked }))}
                                className="w-3 h-3 accent-emerald-600" />
                            Es externa a la empresa
                        </label>
                        <span className="flex-1" />
                        <button onClick={agregar} disabled={guardando || !nuevo.nombre.trim()}
                            className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest">
                            {guardando ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Guardar
                        </button>
                        <button onClick={() => setNuevo(null)}
                            className="text-slate-400 hover:text-slate-700"><X size={14} /></button>
                    </div>
                </div>
            ) : (
                <button onClick={() => setNuevo({ ...VACIO })}
                    className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-600 hover:text-emerald-700 px-1 py-1 self-start">
                    <Plus size={11} /> Agregar persona
                </button>
            )}
        </div>
    );
};

export default ContactosEmpresa;
