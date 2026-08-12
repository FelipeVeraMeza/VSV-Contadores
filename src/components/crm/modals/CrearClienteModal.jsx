import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, UserPlus, AlertTriangle, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { cleanRut, formatRut } from '@/lib/rut';
import { crearPersonaApi, buscarDuplicadosApi, getCatalogosApi, crearServicioApi, crearAccionApi } from '@/services/personaService';

// Validación de RUT (dígito verificador, módulo 11) — lado cliente
const validarRut = (rut) => {
    const limpio = cleanRut(rut);
    if (!/^\d+-[\dkK]$/.test(limpio)) return false;
    const [body, dv] = limpio.split('-');
    let suma = 0, mul = 2;
    for (let i = body.length - 1; i >= 0; i--) {
        suma += parseInt(body[i], 10) * mul;
        mul = mul < 7 ? mul + 1 : 2;
    }
    const resto = 11 - (suma % 11);
    const esperado = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);
    return dv.toUpperCase() === esperado;
};

const getSessionId = () => {
    try { return JSON.parse(localStorage.getItem('user') || '{}').sessionId; }
    catch { return null; }
};
const getUserId = () => {
    try { return JSON.parse(localStorage.getItem('user') || '{}').id || ''; }
    catch { return ''; }
};

const Field = ({ label, children }) => (
    <div className="flex flex-col gap-1">
        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
        {children}
    </div>
);

const inputClass = "bg-slate-50 border border-[#efe8dd] rounded-lg px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500 transition-colors placeholder:text-slate-400";

const CrearClienteModal = ({ onClose, onCreated, empresaId = null }) => {
    const [form, setForm] = useState({
        nombre: '', segundoNombre: '', apellidos: '', fechaNacimiento: '',
        rut: '', telefono: '', telefono2: '', correo: '', direccion: '', comuna: '', region: '',
        // El ejecutivo arranca en quien crea el prospecto (lo pidió Mati). Igual se
        // puede cambiar en el desplegable.
        rubro: '', observaciones: '', origen: 'manual', ejecutivoId: getUserId(), etiquetasStr: '',
        necesidad: ''
    });
    const [catalogos, setCatalogos] = useState({ etiquetas: [], ejecutivos: [], servicios: [] });
    const [serviciosSel, setServiciosSel] = useState([]);
    // Crear un servicio al vuelo (#4)
    const [nuevoServicio, setNuevoServicio] = useState('');
    const [creandoServicio, setCreandoServicio] = useState(false);
    // Próxima acción (#5/#6): qué hacer y cuándo. Al crear el prospecto se agenda.
    const [accion, setAccion] = useState({ tipo: 'llamar', fechaHora: '', titulo: '' });

    // Agrega un servicio nuevo al catálogo (sin duplicar) y lo deja seleccionado.
    const crearServicioInline = async () => {
        const nombre = nuevoServicio.trim();
        if (!nombre || creandoServicio) return;
        setCreandoServicio(true);
        try {
            const r = await crearServicioApi(getSessionId(), nombre);
            const d = await r.json();
            if (!d.success) throw new Error(d.message || 'No se pudo crear el servicio');
            setCatalogos(prev => prev.servicios.some(s => s.id === d.servicio.id)
                ? prev
                : { ...prev, servicios: [...prev.servicios, d.servicio] });
            setServiciosSel(prev => prev.includes(d.servicio.id) ? prev : [...prev, d.servicio.id]);
            setNuevoServicio('');
            if (d.yaExistia) toast({ title: 'Ese servicio ya existía', description: `Se seleccionó "${d.servicio.nombre}".` });
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        } finally { setCreandoServicio(false); }
    };

    useEffect(() => {
        (async () => {
            try {
                const res = await getCatalogosApi(getSessionId());
                const data = await res.json();
                if (data.success) setCatalogos({ etiquetas: data.etiquetas || [], ejecutivos: data.ejecutivos || [], servicios: data.servicios || [] });
            } catch { /* */ }
        })();
    }, []);

    const toggleServicio = (id) => setServiciosSel(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    const [rutError, setRutError] = useState('');
    const [duplicados, setDuplicados] = useState([]);
    const [forzar, setForzar] = useState(false);
    const [saving, setSaving] = useState(false);
    const dupTimer = useRef(null);

    const set = (k) => (e) => setForm(prev => ({ ...prev, [k]: e.target.value }));

    // Validación RUT al perder foco
    const handleRutBlur = () => {
        if (!form.rut.trim()) { setRutError(''); return; }
        if (!validarRut(form.rut)) { setRutError('RUT inválido (dígito verificador).'); return; }
        setRutError('');
        setForm(prev => ({ ...prev, rut: formatRut(prev.rut) }));
    };

    // Búsqueda de duplicados en vivo (debounce)
    useEffect(() => {
        if (dupTimer.current) clearTimeout(dupTimer.current);
        const { rut, correo, telefono, nombre, apellidos } = form;
        if (!rut && !correo && !telefono && !(nombre && apellidos)) { setDuplicados([]); return; }
        dupTimer.current = setTimeout(async () => {
            try {
                const res = await buscarDuplicadosApi(getSessionId(), { rut, correo, telefono, nombre, apellidos });
                const payload = await res.json();
                if (payload.success) { setDuplicados(payload.duplicados || []); setForzar(false); }
            } catch { /* silencioso */ }
        }, 600);
        return () => dupTimer.current && clearTimeout(dupTimer.current);
    }, [form.rut, form.correo, form.telefono, form.nombre, form.apellidos]);

    const tieneAlgo = form.nombre.trim() || form.rut.trim() || form.telefono.trim() || form.correo.trim();

    const handleSubmit = async () => {
        if (!tieneAlgo) { toast({ variant: 'destructive', title: 'Falta información', description: 'Ingresa al menos nombre, teléfono, correo o RUT.' }); return; }
        if (form.rut.trim() && !validarRut(form.rut)) { setRutError('RUT inválido (dígito verificador).'); return; }
        if (duplicados.length > 0 && !forzar) {
            toast({ variant: 'destructive', title: 'Posible duplicado', description: 'Marca "Crear de todos modos" si quieres continuar.' });
            return;
        }

        setSaving(true);
        try {
            const payload = {
                nombre: form.nombre, segundoNombre: form.segundoNombre, apellidos: form.apellidos,
                fechaNacimiento: form.fechaNacimiento || null, rut: form.rut,
                telefonos: [form.telefono, form.telefono2].map(t => String(t || '').trim()).filter(Boolean),
                correos: form.correo ? [form.correo] : [],
                direccion: form.direccion, comuna: form.comuna, region: form.region,
                rubro: form.rubro, observaciones: form.observaciones, origen: form.origen,
                necesidad: form.necesidad,
                ejecutivoId: form.ejecutivoId || null,
                etiquetas: form.etiquetasStr.split(',').map(s => s.trim()).filter(Boolean),
                serviciosInteres: serviciosSel,
                empresaId, forzar
            };
            const res = await crearPersonaApi(getSessionId(), payload);
            const data = await res.json();
            if (res.status === 409 && data.duplicados) {
                setDuplicados(data.duplicados);
                toast({ variant: 'destructive', title: 'Posible duplicado', description: 'Revisa las coincidencias.' });
                return;
            }
            if (!data.success) throw new Error(data.message || 'Error');
            // Agenda inicial: si se indicó una próxima acción, se crea (y con eso
            // queda seteado el "próximo contacto" del prospecto). Es opcional: si
            // falla, el prospecto igual quedó creado.
            if (data.persona?.id && (accion.fechaHora || accion.titulo.trim())) {
                try {
                    await crearAccionApi(getSessionId(), data.persona.id, {
                        tipo: accion.tipo,
                        titulo: accion.titulo.trim() || null,
                        fechaHora: accion.fechaHora || null,
                    });
                } catch { /* acción opcional */ }
            }
            toast({ title: 'Cliente creado', description: 'Se registró como prospecto.' });
            if (onCreated) onCreated(data.persona);
            onClose();
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error', description: error.message });
        } finally {
            setSaving(false);
        }
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white border border-[#efe8dd] rounded-2xl shadow-2xl scrollbar-thin scrollbar-thumb-white/10"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-[#efe8dd] sticky top-0 bg-white z-10">
                        <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                            <UserPlus size={16} className="text-blue-600" /> Crear Cliente
                        </h2>
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-900"><X size={18} /></button>
                    </div>

                    <div className="p-4 space-y-4">
                        <p className="text-[10px] text-slate-400">Puedes crear un cliente con un solo dato (nombre, teléfono, correo o RUT). Ingresará como <span className="text-amber-600 font-bold">prospecto</span>.</p>

                        {/* Info personal */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <Field label="Nombre"><input className={inputClass} value={form.nombre} onChange={set('nombre')} placeholder="Nombre" /></Field>
                            <Field label="Segundo nombre"><input className={inputClass} value={form.segundoNombre} onChange={set('segundoNombre')} placeholder="(opcional)" /></Field>
                            <Field label="Apellidos"><input className={inputClass} value={form.apellidos} onChange={set('apellidos')} placeholder="Apellidos" /></Field>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <Field label="RUT">
                                <input className={`${inputClass} ${rutError ? 'border-red-500' : ''}`} value={form.rut} onChange={set('rut')} onBlur={handleRutBlur} placeholder="12.345.678-9" />
                                {rutError && <span className="text-[10px] text-red-500">{rutError}</span>}
                            </Field>
                            <Field label="Fecha de nacimiento"><input type="date" className={inputClass} value={form.fechaNacimiento} onChange={set('fechaNacimiento')} /></Field>
                        </div>

                        {/* Contacto */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <Field label="Teléfono"><input className={inputClass} value={form.telefono} onChange={set('telefono')} placeholder="+56 9 1234 5678" /></Field>
                            <Field label="Teléfono 2 (opcional)"><input className={inputClass} value={form.telefono2} onChange={set('telefono2')} placeholder="Segundo número de contacto" /></Field>
                            <Field label="Correo electrónico"><input className={inputClass} value={form.correo} onChange={set('correo')} placeholder="correo@ejemplo.cl" /></Field>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <Field label="Dirección"><input className={inputClass} value={form.direccion} onChange={set('direccion')} placeholder="Calle 123" /></Field>
                            <Field label="Comuna"><input className={inputClass} value={form.comuna} onChange={set('comuna')} placeholder="Comuna" /></Field>
                            <Field label="Región"><input className={inputClass} value={form.region} onChange={set('region')} placeholder="Región" /></Field>
                        </div>

                        {/* Comercial */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <Field label="Rubro"><input className={inputClass} value={form.rubro} onChange={set('rubro')} placeholder="Rubro / actividad" /></Field>
                            <Field label="Origen">
                                <select className={`${inputClass} cursor-pointer`} value={form.origen} onChange={set('origen')}>
                                    <option value="manual">Manual</option>
                                    <option value="whatsapp">WhatsApp</option>
                                    <option value="correo">Correo</option>
                                    <option value="web">Formulario web</option>
                                    <option value="integracion">Integración</option>
                                </select>
                            </Field>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <Field label="Ejecutivo asignado">
                                <select className={`${inputClass} cursor-pointer`} value={form.ejecutivoId} onChange={set('ejecutivoId')}>
                                    <option value="">— Sin asignar —</option>
                                    {catalogos.ejecutivos.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                                </select>
                            </Field>
                            <Field label="Etiquetas (separadas por coma)">
                                <input className={inputClass} value={form.etiquetasStr} onChange={set('etiquetasStr')} placeholder="VIP, urgente, referido..." />
                            </Field>
                        </div>

                        <Field label="Servicios de interés">
                            <div className="flex flex-wrap gap-1.5 mb-2">
                                {catalogos.servicios.map(s => (
                                    <button type="button" key={s.id} onClick={() => toggleServicio(s.id)}
                                        className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-colors ${serviciosSel.includes(s.id) ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-50 border-[#efe8dd] text-slate-500 hover:text-slate-900'}`}>
                                        {s.nombre}
                                    </button>
                                ))}
                                {catalogos.servicios.length === 0 && <span className="text-[10px] text-slate-400 italic">Sin servicios en el catálogo. Crea el primero abajo.</span>}
                            </div>
                            {/* Crear un servicio al vuelo, sin duplicar (#4) */}
                            <div className="flex gap-2">
                                <input className={inputClass} value={nuevoServicio} onChange={(e) => setNuevoServicio(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); crearServicioInline(); } }}
                                    placeholder="Crear un servicio nuevo…" />
                                <button type="button" onClick={crearServicioInline} disabled={creandoServicio || !nuevoServicio.trim()}
                                    className="shrink-0 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-600 rounded-lg px-3 text-[11px] font-black uppercase tracking-widest">
                                    {creandoServicio ? '…' : '+ Crear'}
                                </button>
                            </div>
                        </Field>

                        {/* Próxima acción con el prospecto: qué y cuándo (#5/#6) */}
                        <Field label="Próxima acción (opcional)">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                <select className={`${inputClass} cursor-pointer`} value={accion.tipo} onChange={(e) => setAccion(a => ({ ...a, tipo: e.target.value }))}>
                                    <option value="llamar">Llamar</option>
                                    <option value="reunion">Reunión</option>
                                    <option value="seguimiento">Seguimiento</option>
                                    <option value="prospectar">Prospectar</option>
                                    <option value="otro">Otro</option>
                                </select>
                                <input type="datetime-local" className={inputClass} value={accion.fechaHora} onChange={(e) => setAccion(a => ({ ...a, fechaHora: e.target.value }))} />
                                <input className={inputClass} value={accion.titulo} onChange={(e) => setAccion(a => ({ ...a, titulo: e.target.value }))} placeholder="Ej: Llamar a Marleny 13:30" />
                            </div>
                        </Field>

                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                            <Field label="¿Qué necesita?">
                                <textarea className="w-full bg-white border border-emerald-200 rounded-lg px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500 resize-none placeholder:text-slate-400" rows={2} value={form.necesidad} onChange={set('necesidad')} placeholder="Ej: llevar la contabilidad, crear empresa, declaración de renta..." />
                            </Field>
                        </div>

                        <Field label="Observaciones">
                            <textarea className={`${inputClass} resize-none`} rows={2} value={form.observaciones} onChange={set('observaciones')} placeholder="Notas internas..." />
                        </Field>

                        {/* Aviso de duplicados */}
                        {duplicados.length > 0 && (
                            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
                                <div className="flex items-center gap-2 text-amber-600 text-[11px] font-black uppercase tracking-widest mb-2">
                                    <AlertTriangle size={14} /> Posible{duplicados.length > 1 ? 's' : ''} duplicado{duplicados.length > 1 ? 's' : ''}
                                </div>
                                <div className="space-y-1 mb-2">
                                    {duplicados.map(d => (
                                        <div key={d.id} className="text-xs text-slate-700">
                                            • {[d.nombre, d.apellidos].filter(Boolean).join(' ') || 'Sin nombre'}
                                            <span className="text-slate-400"> — {d.estado} · coincide por {d.criterios.join(', ')}</span>
                                        </div>
                                    ))}
                                </div>
                                <label className="flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer">
                                    <input type="checkbox" checked={forzar} onChange={(e) => setForzar(e.target.checked)} />
                                    Crear de todos modos
                                </label>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex gap-3 p-4 border-t border-[#efe8dd] sticky bottom-0 bg-white">
                        <Button variant="ghost" onClick={onClose} className="flex-1 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest h-10">Cancelar</Button>
                        <Button onClick={handleSubmit} disabled={saving || !tieneAlgo} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest h-10 flex items-center justify-center gap-2">
                            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Crear Cliente
                        </Button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default CrearClienteModal;
