import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { X, Building2, Save, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { crearEmpresaApi } from '@/services/crmService';
import { formatRut } from '@/lib/rut';

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

const Campo = ({ label, children }) => (
    <label className="flex flex-col gap-1">
        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
        {children}
    </label>
);

const inputCls = "bg-slate-50 border border-[#efe8dd] rounded-lg p-2.5 text-xs text-slate-900 outline-none focus:border-emerald-500 transition-colors placeholder:text-slate-400 w-full";

const CrearEmpresaModal = ({ onClose, onCreated, planes = [] }) => {
    const [form, setForm] = useState({
        razonSocial: '', rut: '', giro: '', regimen: '',
        telefono: '', correo: '', whatsapp: '',
        repNombre: '', repRut: '',
        direccion: '', comuna: '', ciudad: '',
        planId: '', importante: ''
    });
    const [saving, setSaving] = useState(false);

    const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

    const rutValido = useMemo(() => form.rut.trim() === '' ? null : validarRutDV(form.rut), [form.rut]);
    const repRutValido = useMemo(() => form.repRut.trim() === '' ? null : validarRutDV(form.repRut), [form.repRut]);
    const correoValido = useMemo(() => form.correo.trim() === '' ? null : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.correo.trim()), [form.correo]);

    const puedeGuardar = rutValido === true &&
        repRutValido !== false && correoValido !== false && !saving;

    const handleSubmit = async () => {
        if (rutValido !== true) {
            toast({ title: "RUT inválido", description: "Ingresa un RUT válido (revisa el dígito verificador).", variant: "destructive" });
            return;
        }
        setSaving(true);
        try {
            const response = await crearEmpresaApi(getSessionId(), form);
            const payload = await response.json();
            if (!payload.success) {
                if (payload.code === 'DUPLICADO') {
                    toast({ title: "Cliente duplicado", description: payload.message, variant: "destructive" });
                } else {
                    throw new Error(payload.message || 'No se pudo crear el cliente.');
                }
                return;
            }
            toast({ title: "Cliente creado", description: `${form.razonSocial.trim() || 'El cliente'} se agregó correctamente.` });
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
                className="w-full max-w-2xl bg-white border border-[#efe8dd] rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-5 border-b border-[#efe8dd] flex items-center justify-between bg-gradient-to-r from-blue-900/30 to-transparent shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-600">
                            <Building2 size={20} />
                        </div>
                        <div>
                            <h2 className="text-sm font-black text-slate-900 uppercase tracking-tight">Crear Cliente</h2>
                            <p className="text-[10px] text-slate-400">Registra una nueva empresa en el CRM</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl bg-slate-50 text-slate-500 hover:text-red-500 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-thin scrollbar-thumb-white/10">
                    {/* Identificación */}
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
                        <Campo label="Razón Social (opcional)">
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

                    {/* Plan */}
                    <Campo label="Plan">
                        <select className={`${inputCls} cursor-pointer`} value={form.planId} onChange={(e) => set('planId', e.target.value)}>
                            <option value="">FREE (por defecto)</option>
                            {planes.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                        </select>
                    </Campo>

                    {/* Contacto */}
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

                    {/* Representante */}
                    <div className="border-t border-[#efe8dd] pt-3">
                        <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Representante Legal</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <Campo label="Nombre Representante">
                                <input className={inputCls} value={form.repNombre} onChange={(e) => set('repNombre', e.target.value)} placeholder="Nombre y apellido" />
                            </Campo>
                            <Campo label="RUT Representante">
                                <div className="relative">
                                    <input
                                        className={`${inputCls} ${repRutValido === false ? 'border-red-500/60' : repRutValido === true ? 'border-emerald-500/50' : ''}`}
                                        value={form.repRut}
                                        onChange={(e) => set('repRut', e.target.value)}
                                        onBlur={() => repRutValido && set('repRut', formatRut(form.repRut))}
                                        placeholder="12.345.678-9"
                                    />
                                    {repRutValido === true && <CheckCircle2 size={15} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-emerald-600" />}
                                    {repRutValido === false && <AlertTriangle size={15} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-red-500" />}
                                </div>
                            </Campo>
                        </div>
                    </div>

                    {/* Dirección */}
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

                    {/* Nota urgente */}
                    <Campo label="Nota importante (opcional)">
                        <input className={inputCls} value={form.importante} onChange={(e) => set('importante', e.target.value)} placeholder="Alerta que verás destacada en la ficha" />
                    </Campo>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-[#efe8dd] flex gap-3 shrink-0 bg-white">
                    <Button variant="ghost" onClick={onClose} className="flex-1 uppercase font-black text-[10px] tracking-widest text-slate-500 h-10 rounded-xl bg-slate-50 hover:bg-slate-100">
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={!puedeGuardar}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white uppercase font-black text-[10px] tracking-widest h-10 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
                    >
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Crear Cliente
                    </Button>
                </div>
            </motion.div>
        </motion.div>
    );
};

export default CrearEmpresaModal;
