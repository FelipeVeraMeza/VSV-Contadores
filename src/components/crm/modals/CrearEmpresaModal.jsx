// =====================================================================
// CREAR CLIENTE · todo de una vez
// ---------------------------------------------------------------------
// Antes este formulario pedía lo mínimo y había que volver a entrar a la ficha
// para completar el resto: los planes, los representantes, quién lo atiende.
// Del ticket «CREAR CLIENTE: TODO DE UNA VEZ»: que salga todo en una pasada.
//
// Lo que cambió respecto de la versión anterior:
//   · VARIOS representantes legales (hay sociedades con dos o tres)
//   · VARIOS planes (el negocio vende más de uno a la vez)
//   · Responsable del servicio: quién de la OFICINA atiende al cliente
//     — no confundir con el representante legal, que es del CLIENTE
//   · Servicios contratados con su precio
//   · El total mensual se calcula solo y se puede pisar a mano
//
// Está partido en pasos. Todo en una pantalla eran cuarenta campos de corrido
// y nadie llega al final; en tres pasos se ve lo que falta y se puede guardar
// desde el primero, porque solo el RUT es obligatorio.
// =====================================================================
import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    X, Building2, Save, Loader2, CheckCircle2, AlertTriangle,
    Plus, Trash2, UserCheck, Users, Package, ChevronLeft, ChevronRight,
    Key, Eye, EyeOff, FolderOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { crearEmpresaApi } from '@/services/crmService';
import { getCatalogosApi } from '@/services/personaService';
import { formatRut } from '@/lib/rut';
import LogoUploader from '@/components/ui/LogoUploader';

const getSessionId = () => {
    try { return JSON.parse(localStorage.getItem('user') || '{}').sessionId; }
    catch { return null; }
};

// Dígito verificador (módulo 11) — mismo criterio que el backend
const validarRutDV = (rut) => {
    const limpio = String(rut).toUpperCase().replace(/[^0-9K]/g, '');
    if (limpio.length < 2) return false;
    const body = limpio.slice(0, -1);
    const dv = limpio.slice(-1);
    let suma = 0, mul = 2;
    for (let i = body.length - 1; i >= 0; i--) {
        suma += parseInt(body[i], 10) * mul;
        mul = mul < 7 ? mul + 1 : 2;
    }
    const resto = 11 - (suma % 11);
    const esperado = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);
    return dv === esperado;
};

const clp = (n) => `$${Number(n || 0).toLocaleString('es-CL')}`;

const Campo = ({ label, children, ayuda }) => (
    <label className="flex flex-col gap-1">
        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
        {children}
        {ayuda && <span className="text-[9px] text-slate-400">{ayuda}</span>}
    </label>
);

const inputCls = "bg-slate-50 border border-[#efe8dd] rounded-lg p-2.5 text-xs text-slate-900 outline-none focus:border-emerald-500 transition-colors placeholder:text-slate-400 w-full";

const PASOS = [
    { id: 0, label: 'La empresa', icono: Building2 },
    { id: 1, label: 'Quiénes',    icono: Users },
    { id: 2, label: 'Qué paga',   icono: Package },
    { id: 3, label: 'Accesos',    icono: Key },
];
const ULTIMO = PASOS.length - 1;

const CrearEmpresaModal = ({ onClose, onCreated, planes = [], usuarios: usuariosProp, servicios: serviciosProp }) => {
    const [paso, setPaso] = useState(0);

    // El modal se trae sus propios catálogos si no se los pasan. Así no hay que
    // tocar cada pantalla que lo abre para que funcionen los campos nuevos.
    const [cat, setCat] = useState({ ejecutivos: [], servicios: [] });
    useEffect(() => {
        if (usuariosProp && serviciosProp) return;
        (async () => {
            try {
                const r = await getCatalogosApi(getSessionId());
                const d = await r.json();
                if (d.success) setCat({ ejecutivos: d.ejecutivos || [], servicios: d.servicios || [] });
            } catch { /* sin catálogos, esos dos campos quedan vacíos y el resto sirve igual */ }
        })();
    }, [usuariosProp, serviciosProp]);
    const usuarios = usuariosProp ?? cat.ejecutivos;
    const servicios = serviciosProp ?? cat.servicios;
    const [form, setForm] = useState({
        razonSocial: '', rut: '', giro: '', regimen: '',
        telefono: '', correo: '', whatsapp: '',
        direccion: '', comuna: '', ciudad: '',
        importante: '', responsableId: '',
        // Vacío = se calcula sumando los planes. Con valor = manda éste.
        precioMensual: '',
        // Accesos. Los nombres son los que usa el sistema hoy; cuál es de la
        // empresa y cuál del representante está por definirse (ticket aparte).
        claveSII: '', claveWeb: '', correoSII: '',
        driveUrl: '', tipoCliente: 'Empresa',
        logo: '',
    });
    const [verClaves, setVerClaves] = useState(false);
    // Arranca con una fila vacía para que se vea dónde escribir.
    const [reps, setReps] = useState([{ nombre: '', rut: '', email: '', telefono: '' }]);
    const [planesSel, setPlanesSel] = useState([]);
    const [serviciosSel, setServiciosSel] = useState([]);
    const [saving, setSaving] = useState(false);

    const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

    const rutValido = useMemo(() => form.rut.trim() === '' ? null : validarRutDV(form.rut), [form.rut]);
    const correoValido = useMemo(() => form.correo.trim() === '' ? null : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.correo.trim()), [form.correo]);

    // Un representante con RUT escrito a medias no bloquea: solo se avisa. Lo
    // que sí bloquea es un RUT completo pero mal.
    const repsConError = reps.filter(r => r.rut.trim() && !validarRutDV(r.rut));

    // ---- Planes ----
    const agregarPlan = (planId) => {
        if (!planId || planesSel.some(p => p.planId === planId)) return;
        const plan = planes.find(p => p.id === planId);
        setPlanesSel(prev => [...prev, {
            planId,
            nombre: plan?.nombre || '',
            // El precio de lista se propone; casi siempre se negocia otro.
            precioPactado: plan?.precio_base ?? plan?.precioBase ?? '',
        }]);
    };
    const quitarPlan = (planId) => setPlanesSel(prev => prev.filter(p => p.planId !== planId));

    // ---- Servicios ----
    const agregarServicio = (servicioId) => {
        if (!servicioId || serviciosSel.some(s => s.servicioId === servicioId)) return;
        const s = servicios.find(x => x.id === servicioId);
        setServiciosSel(prev => [...prev, { servicioId, nombre: s?.nombre || '', precio: '', periodicidad: 'mensual' }]);
    };
    const quitarServicio = (servicioId) => setServiciosSel(prev => prev.filter(s => s.servicioId !== servicioId));

    // Total sugerido: planes + servicios mensuales. Los servicios de una vez
    // (Inicio de Actividades, por ejemplo) no entran en el cobro del mes.
    const totalPlanes = planesSel.reduce((s, p) => s + (Number(p.precioPactado) || 0), 0);
    const totalServicios = serviciosSel
        .filter(s => s.periodicidad === 'mensual')
        .reduce((s, x) => s + (Number(x.precio) || 0), 0);
    const totalSugerido = totalPlanes + totalServicios;
    const montoFinal = form.precioMensual !== '' ? Number(form.precioMensual) || 0 : totalSugerido;

    const puedeGuardar = rutValido === true && correoValido !== false && repsConError.length === 0 && !saving;

    const handleSubmit = async () => {
        if (rutValido !== true) {
            toast({ title: "RUT inválido", description: "Ingresa un RUT válido (revisa el dígito verificador).", variant: "destructive" });
            setPaso(0);
            return;
        }
        if (repsConError.length) {
            toast({ title: "RUT de representante inválido", description: `Revisa el de ${repsConError[0].nombre || 'la fila sin nombre'}.`, variant: "destructive" });
            setPaso(1);
            return;
        }
        setSaving(true);
        try {
            const payloadEnvio = {
                ...form,
                precioMensual: form.precioMensual === '' ? undefined : Number(form.precioMensual),
                responsableId: form.responsableId || null,
                representantes: reps.filter(r => r.nombre.trim()),
                planes: planesSel.map(p => ({
                    planId: p.planId,
                    precioPactado: p.precioPactado === '' ? null : Number(p.precioPactado),
                })),
                servicios: serviciosSel.map(s => ({
                    servicioId: s.servicioId,
                    precio: s.precio === '' ? null : Number(s.precio),
                    periodicidad: s.periodicidad,
                })),
            };
            const response = await crearEmpresaApi(getSessionId(), payloadEnvio);
            const payload = await response.json();
            if (!payload.success) {
                if (payload.code === 'DUPLICADO') {
                    toast({ title: "Cliente duplicado", description: payload.message, variant: "destructive" });
                } else {
                    throw new Error(payload.message || 'No se pudo crear el cliente.');
                }
                return;
            }
            const extras = [
                planesSel.length > 1 ? `${planesSel.length} planes` : null,
                reps.filter(r => r.nombre.trim()).length > 1 ? `${reps.filter(r => r.nombre.trim()).length} representantes` : null,
                serviciosSel.length ? `${serviciosSel.length} servicios` : null,
            ].filter(Boolean);
            toast({
                title: "Cliente creado",
                description: `${form.razonSocial.trim() || 'El cliente'} se agregó${extras.length ? ` con ${extras.join(', ')}` : ''}.`,
            });
            if (onCreated) onCreated(payload.empresaId);
            onClose();
        } catch (error) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        } finally {
            setSaving(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={onClose}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="w-full max-w-3xl bg-white border border-[#efe8dd] rounded-2xl shadow-2xl flex flex-col max-h-[92vh]"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-5 border-b border-[#efe8dd] flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-600">
                            <Building2 size={20} />
                        </div>
                        <div>
                            <h2 className="text-sm font-black text-slate-900 uppercase tracking-tight">Crear Cliente</h2>
                            <p className="text-[10px] text-slate-400">Solo el RUT es obligatorio. El resto se puede dejar para después.</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl bg-slate-50 text-slate-500 hover:text-red-500 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* Pasos */}
                <div className="flex border-b border-[#efe8dd] shrink-0">
                    {PASOS.map(p => {
                        const Icono = p.icono;
                        const activo = paso === p.id;
                        return (
                            <button key={p.id} onClick={() => setPaso(p.id)}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[10px] font-black uppercase tracking-widest border-b-2 transition-colors ${
                                    activo ? 'border-emerald-500 text-emerald-700 bg-emerald-500/5' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                                <Icono size={13} /> {p.label}
                            </button>
                        );
                    })}
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-thin">

                    {/* ---------------- PASO 1 · LA EMPRESA ---------------- */}
                    {paso === 0 && (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <Campo label="RUT *">
                                <div className="relative">
                                    <input
                                        className={`${inputCls} ${rutValido === false ? 'border-red-500/60' : rutValido === true ? 'border-emerald-500/50' : ''}`}
                                        value={form.rut}
                                        onChange={(e) => set('rut', e.target.value)}
                                        onBlur={() => rutValido && set('rut', formatRut(form.rut))}
                                        placeholder="76.123.456-7"
                                        autoFocus
                                    />
                                    {rutValido === true && <CheckCircle2 size={15} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-emerald-600" />}
                                    {rutValido === false && <AlertTriangle size={15} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-red-500" />}
                                </div>
                                {rutValido === false && <span className="text-[9px] text-red-500 mt-0.5">Dígito verificador incorrecto.</span>}
                            </Campo>
                            <Campo label="Razón Social">
                                <input className={inputCls} value={form.razonSocial} onChange={(e) => set('razonSocial', e.target.value)} placeholder="Se completará con el RUT si lo dejas vacío" />
                            </Campo>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <Campo label="Giro">
                                <input className={inputCls} value={form.giro} onChange={(e) => set('giro', e.target.value)} placeholder="Actividad económica" />
                            </Campo>
                            <Campo label="Régimen Tributario">
                                <input className={inputCls} value={form.regimen} onChange={(e) => set('regimen', e.target.value)} placeholder="Ej: 14 D N°3 (Propyme)" />
                            </Campo>
                        </div>

                        <div className="border-t border-[#efe8dd] pt-3">
                            <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Logo (opcional)</h3>
                            <LogoUploader
                                value={form.logo}
                                onChange={(dataUri) => set('logo', dataUri)}
                                onError={(msg) => toast({ variant: 'destructive', title: 'Logo', description: msg })}
                            />
                        </div>

                        <div className="border-t border-[#efe8dd] pt-3">
                            <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Contacto</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <Campo label="Correo">
                                    <input className={`${inputCls} ${correoValido === false ? 'border-red-500/60' : ''}`} value={form.correo} onChange={(e) => set('correo', e.target.value)} placeholder="correo@empresa.cl" />
                                </Campo>
                                <Campo label="Teléfono">
                                    <input className={inputCls} value={form.telefono} onChange={(e) => set('telefono', e.target.value)} placeholder="+56 2 2345 6789" />
                                </Campo>
                                <Campo label="WhatsApp">
                                    <input className={inputCls} value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} placeholder="+56 9 1234 5678" />
                                </Campo>
                            </div>
                        </div>

                        <div className="border-t border-[#efe8dd] pt-3">
                            <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Dirección (Casa Matriz)</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <Campo label="Dirección">
                                    <input className={inputCls} value={form.direccion} onChange={(e) => set('direccion', e.target.value)} placeholder="Calle y número" />
                                </Campo>
                                <Campo label="Comuna">
                                    <input className={inputCls} value={form.comuna} onChange={(e) => set('comuna', e.target.value)} placeholder="Comuna" />
                                </Campo>
                                <Campo label="Ciudad">
                                    <input className={inputCls} value={form.ciudad} onChange={(e) => set('ciudad', e.target.value)} placeholder="Ciudad" />
                                </Campo>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <Campo label="Tipo de cliente">
                                <select className={`${inputCls} cursor-pointer`} value={form.tipoCliente} onChange={(e) => set('tipoCliente', e.target.value)}>
                                    <option value="Empresa">Empresa</option>
                                    <option value="Persona">Persona natural</option>
                                </select>
                            </Campo>
                            <Campo label="Nota importante (opcional)">
                                <input className={inputCls} value={form.importante} onChange={(e) => set('importante', e.target.value)} placeholder="Alerta que verás destacada en la ficha" />
                            </Campo>
                        </div>
                    </>
                    )}

                    {/* ---------------- PASO 2 · QUIÉNES ---------------- */}
                    {paso === 1 && (
                    <>
                        {/* Responsable del servicio: es de la OFICINA. Va primero y
                            separado para que no se confunda con el representante. */}
                        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3">
                            <Campo label="Responsable del servicio"
                                ayuda="Quién de la oficina atiende a este cliente. No es el representante legal.">
                                <select className={`${inputCls} cursor-pointer`} value={form.responsableId} onChange={(e) => set('responsableId', e.target.value)}>
                                    <option value="">— Sin asignar —</option>
                                    {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                                </select>
                            </Campo>
                        </div>

                        <div className="border-t border-[#efe8dd] pt-3">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                                    <UserCheck size={12} /> Representantes legales ({reps.filter(r => r.nombre.trim()).length})
                                </h3>
                                <button onClick={() => setReps(p => [...p, { nombre: '', rut: '', email: '', telefono: '' }])}
                                    className="text-[9px] font-black uppercase tracking-widest text-emerald-600 hover:text-emerald-700 flex items-center gap-1">
                                    <Plus size={11} /> Agregar otro
                                </button>
                            </div>
                            <p className="text-[10px] text-slate-400 mb-2">
                                El primero es el <b>principal</b>: es el que se muestra en la ficha y el que
                                usa el sistema para entrar al SII.
                            </p>

                            <div className="space-y-2">
                                {reps.map((r, i) => {
                                    const valido = r.rut.trim() === '' ? null : validarRutDV(r.rut);
                                    const cambiar = (campo, valor) =>
                                        setReps(prev => prev.map((x, idx) => idx === i ? { ...x, [campo]: valor } : x));
                                    return (
                                        <div key={i} className={`border rounded-xl p-3 ${i === 0 ? 'border-emerald-500/30 bg-emerald-500/[0.03]' : 'border-[#efe8dd]'}`}>
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                                                    {i === 0 ? '★ Principal' : `Representante ${i + 1}`}
                                                </span>
                                                {reps.length > 1 && (
                                                    <button onClick={() => setReps(prev => prev.filter((_, idx) => idx !== i))}
                                                        className="text-slate-300 hover:text-red-500"><Trash2 size={12} /></button>
                                                )}
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                <input className={inputCls} value={r.nombre}
                                                    onChange={(e) => cambiar('nombre', e.target.value)} placeholder="Nombre y apellido" />
                                                <div className="relative">
                                                    <input
                                                        className={`${inputCls} ${valido === false ? 'border-red-500/60' : valido === true ? 'border-emerald-500/50' : ''}`}
                                                        value={r.rut}
                                                        onChange={(e) => cambiar('rut', e.target.value)}
                                                        onBlur={() => valido && cambiar('rut', formatRut(r.rut))}
                                                        placeholder="12.345.678-9" />
                                                    {valido === true && <CheckCircle2 size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-emerald-600" />}
                                                    {valido === false && <AlertTriangle size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-red-500" />}
                                                </div>
                                                <input className={inputCls} value={r.email}
                                                    onChange={(e) => cambiar('email', e.target.value)} placeholder="Correo (opcional)" />
                                                <input className={inputCls} value={r.telefono}
                                                    onChange={(e) => cambiar('telefono', e.target.value)} placeholder="Teléfono (opcional)" />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </>
                    )}

                    {/* ---------------- PASO 3 · QUÉ PAGA ---------------- */}
                    {paso === 2 && (
                    <>
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                                    Planes contratados ({planesSel.length})
                                </h3>
                            </div>
                            <select className={`${inputCls} cursor-pointer mb-2`} value=""
                                onChange={(e) => { agregarPlan(e.target.value); e.target.value = ''; }}>
                                <option value="">+ Agregar un plan…</option>
                                {planes.filter(p => !planesSel.some(x => x.planId === p.id))
                                    .map(p => <option key={p.id} value={p.id}>{p.nombre} — {clp(p.precio_base ?? p.precioBase)}</option>)}
                            </select>

                            {planesSel.length === 0 ? (
                                <p className="text-[10px] text-slate-400 italic border border-dashed border-[#efe8dd] rounded-lg py-3 text-center">
                                    Sin planes. Si lo dejas así, queda en FREE.
                                </p>
                            ) : (
                                <div className="space-y-1.5">
                                    {planesSel.map((p, i) => (
                                        <div key={p.planId} className="flex items-center gap-2 border border-[#efe8dd] rounded-lg px-3 py-2">
                                            <span className="text-[9px] font-black text-slate-300 w-4">{i === 0 ? '★' : i + 1}</span>
                                            <span className="text-xs font-bold text-slate-700 flex-1 truncate">{p.nombre}</span>
                                            <input type="number" min="0" className={`${inputCls} w-28 text-right`} value={p.precioPactado}
                                                onChange={(e) => setPlanesSel(prev => prev.map(x => x.planId === p.planId ? { ...x, precioPactado: e.target.value } : x))}
                                                placeholder="Precio" />
                                            <button onClick={() => quitarPlan(p.planId)} className="text-slate-300 hover:text-red-500"><Trash2 size={13} /></button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="border-t border-[#efe8dd] pt-3">
                            <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">
                                Servicios contratados ({serviciosSel.length})
                            </h3>
                            <select className={`${inputCls} cursor-pointer mb-2`} value=""
                                onChange={(e) => { agregarServicio(e.target.value); e.target.value = ''; }}>
                                <option value="">+ Agregar un servicio…</option>
                                {servicios.filter(s => !serviciosSel.some(x => x.servicioId === s.id))
                                    .map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                            </select>

                            {serviciosSel.length === 0 ? (
                                <p className="text-[10px] text-slate-400 italic border border-dashed border-[#efe8dd] rounded-lg py-3 text-center">
                                    Sin servicios adicionales.
                                </p>
                            ) : (
                                <div className="space-y-1.5">
                                    {serviciosSel.map(s => (
                                        <div key={s.servicioId} className="flex items-center gap-2 border border-[#efe8dd] rounded-lg px-3 py-2">
                                            <span className="text-xs font-bold text-slate-700 flex-1 truncate">{s.nombre}</span>
                                            <select className={`${inputCls} w-24 cursor-pointer`} value={s.periodicidad}
                                                onChange={(e) => setServiciosSel(prev => prev.map(x => x.servicioId === s.servicioId ? { ...x, periodicidad: e.target.value } : x))}>
                                                <option value="mensual">mensual</option>
                                                <option value="anual">anual</option>
                                                <option value="unica">una vez</option>
                                            </select>
                                            <input type="number" min="0" className={`${inputCls} w-24 text-right`} value={s.precio}
                                                onChange={(e) => setServiciosSel(prev => prev.map(x => x.servicioId === s.servicioId ? { ...x, precio: e.target.value } : x))}
                                                placeholder="Precio" />
                                            <button onClick={() => quitarServicio(s.servicioId)} className="text-slate-300 hover:text-red-500"><Trash2 size={13} /></button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* El total. Se calcula solo, pero el precio real lo decide
                            quien vende: por eso se puede pisar a mano. */}
                        <div className="border-t border-[#efe8dd] pt-3">
                            <div className="bg-slate-50 border border-[#efe8dd] rounded-xl p-3 space-y-1.5">
                                <div className="flex justify-between text-[11px] text-slate-500">
                                    <span>Planes</span><span className="tabular-nums">{clp(totalPlanes)}</span>
                                </div>
                                <div className="flex justify-between text-[11px] text-slate-500">
                                    <span>Servicios mensuales</span><span className="tabular-nums">{clp(totalServicios)}</span>
                                </div>
                                <div className="flex justify-between text-xs font-black text-slate-900 border-t border-[#efe8dd] pt-1.5">
                                    <span>Sugerido</span><span className="tabular-nums">{clp(totalSugerido)} neto</span>
                                </div>
                            </div>

                            <div className="mt-3">
                                <Campo label="Cobro mensual (neto)"
                                    ayuda={form.precioMensual === ''
                                        ? `Vacío = se cobra el sugerido: ${clp(totalSugerido)}`
                                        : `Se cobrará ${clp(montoFinal)} en vez del sugerido ${clp(totalSugerido)}`}>
                                    <input type="number" min="0" className={inputCls} value={form.precioMensual}
                                        onChange={(e) => set('precioMensual', e.target.value)}
                                        placeholder={String(totalSugerido)} />
                                </Campo>
                            </div>
                        </div>
                    </>
                    )}

                    {/* ---------------- PASO 4 · ACCESOS ---------------- */}
                    {paso === 3 && (
                    <>
                        <div className="flex items-start gap-2 bg-amber-500/5 border border-amber-500/25 rounded-xl p-3">
                            <Key size={14} className="text-amber-600 shrink-0 mt-0.5" />
                            <p className="text-[11px] text-slate-600 leading-relaxed">
                                Las claves se guardan <b>cifradas</b> y no vuelven a mostrarse completas.
                                Puedes dejarlas vacías y cargarlas después desde la ficha.
                            </p>
                        </div>

                        <div className="flex items-center justify-between">
                            <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Credenciales del SII</h3>
                            <button type="button" onClick={() => setVerClaves(v => !v)}
                                className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-700 flex items-center gap-1">
                                {verClaves ? <EyeOff size={11} /> : <Eye size={11} />} {verClaves ? 'Ocultar' : 'Ver lo que escribo'}
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <Campo label="Clave SII"
                                ayuda="La que hoy usa el sistema para entrar al portal del SII.">
                                <input type={verClaves ? 'text' : 'password'} className={`${inputCls} font-mono`}
                                    value={form.claveSII} onChange={(e) => set('claveSII', e.target.value)}
                                    placeholder="Clave del SII" autoComplete="new-password" />
                            </Campo>
                            <Campo label="Clave Portal Web"
                                ayuda="La otra clave del portal, para los demás trámites.">
                                <input type={verClaves ? 'text' : 'password'} className={`${inputCls} font-mono`}
                                    value={form.claveWeb} onChange={(e) => set('claveWeb', e.target.value)}
                                    placeholder="Clave del portal web" autoComplete="new-password" />
                            </Campo>
                        </div>

                        <Campo label="Correo registrado en el SII"
                            ayuda="Si lo dejas vacío se usa el correo de contacto de la empresa.">
                            <input className={inputCls} value={form.correoSII}
                                onChange={(e) => set('correoSII', e.target.value)}
                                placeholder={form.correo || 'correo@empresa.cl'} />
                        </Campo>

                        {/* Nota honesta: hoy los nombres de las dos claves no
                            distinguen de quién es cada una. Está en un ticket. */}
                        <p className="text-[10px] text-slate-400 leading-relaxed border-l-2 border-[#efe8dd] pl-2.5">
                            Los nombres «Clave SII» y «Clave Portal Web» son los que usa el sistema hoy.
                            Cuál corresponde a la empresa y cuál al representante legal está pendiente
                            de definir — ver el ticket <b>CLAVE SII CLIENTE</b> en Tareas.
                        </p>

                        <div className="border-t border-[#efe8dd] pt-3">
                            <Campo label="Carpeta de Drive (opcional)">
                                <div className="relative">
                                    <FolderOpen size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input className={`${inputCls} pl-8`} value={form.driveUrl}
                                        onChange={(e) => set('driveUrl', e.target.value)}
                                        placeholder="https://drive.google.com/..." />
                                </div>
                            </Campo>
                        </div>
                    </>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-[#efe8dd] flex items-center gap-3 shrink-0 bg-white">
                    {paso > 0 ? (
                        <Button variant="ghost" onClick={() => setPaso(p => p - 1)}
                            className="uppercase font-black text-[10px] tracking-widest text-slate-500 h-10 rounded-xl bg-slate-50 hover:bg-slate-100 px-4">
                            <ChevronLeft size={14} /> Atrás
                        </Button>
                    ) : (
                        <Button variant="ghost" onClick={onClose}
                            className="uppercase font-black text-[10px] tracking-widest text-slate-500 h-10 rounded-xl bg-slate-50 hover:bg-slate-100 px-4">
                            Cancelar
                        </Button>
                    )}

                    <div className="flex-1 text-center">
                        {montoFinal > 0 && (
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest tabular-nums">
                                {clp(montoFinal)} / mes
                            </span>
                        )}
                    </div>

                    {paso < ULTIMO && (
                        <Button variant="ghost" onClick={() => setPaso(p => p + 1)}
                            className="uppercase font-black text-[10px] tracking-widest text-slate-600 h-10 rounded-xl bg-slate-50 hover:bg-slate-100 px-4">
                            Siguiente <ChevronRight size={14} />
                        </Button>
                    )}

                    <Button
                        onClick={handleSubmit}
                        disabled={!puedeGuardar}
                        className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white uppercase font-black text-[10px] tracking-widest h-10 rounded-xl flex items-center justify-center gap-2 px-5"
                    >
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Crear Cliente
                    </Button>
                </div>
            </motion.div>
        </motion.div>
    );
};

export default CrearEmpresaModal;
