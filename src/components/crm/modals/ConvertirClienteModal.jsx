import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { X, Building2, ArrowRightCircle, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { crearEmpresaParaPersonaApi } from '@/services/personaService';
import { formatRut } from '@/lib/rut';

const getSessionId = () => {
    try { return JSON.parse(localStorage.getItem('user') || '{}').sessionId; }
    catch { return null; }
};

// Dígito verificador (módulo 11) — mismo criterio que el backend
const validarRutDV = (rut) => {
    const limpio = String(rut || '').toUpperCase().replace(/[^0-9K]/g, '');
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

const inputCls = "bg-black/40 border border-white/10 rounded-lg p-2.5 text-xs text-white outline-none focus:border-emerald-500 transition-colors placeholder:text-gray-600 w-full";

const Campo = ({ label, children, hint }) => (
    <label className="flex flex-col gap-1">
        <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">{label}</span>
        {children}
        {hint && <span className="text-[9px] text-gray-600">{hint}</span>}
    </label>
);

const ConvertirClienteModal = ({ persona, onClose, onConverted }) => {
    const [razonSocial, setRazonSocial] = useState(persona?.nombreCompleto || '');
    const [rut, setRut] = useState(persona?.rut || '');
    const [giro, setGiro] = useState('');
    const [regimen, setRegimen] = useState('');
    const [saving, setSaving] = useState(false);

    const rutValido = useMemo(() => rut.trim() === '' ? null : validarRutDV(rut), [rut]);
    const puedeGuardar = razonSocial.trim() !== '' && rutValido === true && !saving;

    const handleConvertir = async () => {
        if (!razonSocial.trim()) {
            toast({ title: 'Falta la razón social', variant: 'destructive' });
            return;
        }
        if (rutValido !== true) {
            toast({ title: 'RUT inválido', description: 'Revisa el dígito verificador.', variant: 'destructive' });
            return;
        }
        setSaving(true);
        try {
            const res = await crearEmpresaParaPersonaApi(getSessionId(), persona.id, {
                razonSocial, rut, giro, regimen
            });
            const payload = await res.json();
            if (!payload.success) throw new Error(payload.message || 'No se pudo convertir.');

            toast({
                title: payload.empresa?.reusada ? 'Asociado a empresa existente' : 'Cliente creado',
                description: `${payload.empresa?.razonSocial} ya está en la pestaña Clientes.`
            });
            if (onConverted) onConverted(payload.empresa?.empresaId);
            onClose();
        } catch (err) {
            toast({ title: 'Error', description: err.message, variant: 'destructive' });
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
                className="w-full max-w-lg bg-[#0f172a] border border-white/10 rounded-2xl shadow-2xl flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-5 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-emerald-900/30 to-transparent">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                            <ArrowRightCircle size={20} />
                        </div>
                        <div>
                            <h2 className="text-sm font-black text-white uppercase tracking-tight">Convertir a Cliente</h2>
                            <p className="text-[10px] text-gray-500">Se creará su empresa y pasará a Clientes</p>
                        </div>
                    </div>
                    <button onClick={onClose} aria-label="Cerrar" className="p-2 rounded-xl bg-white/5 text-gray-400 hover:text-red-400 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 space-y-4">
                    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3 flex items-center gap-3">
                        <Building2 size={16} className="text-gray-500 shrink-0" />
                        <p className="text-[11px] text-gray-400 leading-relaxed">
                            Convertirás a <span className="text-white font-bold">{persona?.nombreCompleto || 'este prospecto'}</span> en cliente.
                            Si el RUT ya existe, se <span className="text-emerald-400">reutiliza</span> esa empresa en vez de duplicarla.
                        </p>
                    </div>

                    <Campo label="Razón Social *">
                        <input className={inputCls} value={razonSocial} onChange={(e) => setRazonSocial(e.target.value)} placeholder="Nombre de la empresa" autoFocus />
                    </Campo>

                    <Campo label="RUT de la empresa *" hint={persona?.rut ? 'Prellenado con el RUT del prospecto — puedes cambiarlo.' : null}>
                        <div className="relative">
                            <input
                                className={`${inputCls} ${rutValido === false ? 'border-red-500/60' : rutValido === true ? 'border-emerald-500/50' : ''}`}
                                value={rut}
                                onChange={(e) => setRut(e.target.value)}
                                onBlur={() => rutValido && setRut(formatRut(rut))}
                                placeholder="76.123.456-7"
                            />
                            {rutValido === true && <CheckCircle2 size={15} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-emerald-400" />}
                            {rutValido === false && <AlertTriangle size={15} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-red-400" />}
                        </div>
                        {rutValido === false && <span className="text-[9px] text-red-400">Dígito verificador incorrecto.</span>}
                    </Campo>

                    <div className="grid grid-cols-2 gap-3">
                        <Campo label="Giro (opcional)">
                            <input className={inputCls} value={giro} onChange={(e) => setGiro(e.target.value)} placeholder="Actividad económica" />
                        </Campo>
                        <Campo label="Régimen (opcional)">
                            <input className={inputCls} value={regimen} onChange={(e) => setRegimen(e.target.value)} placeholder="Ej: 14 D N°3" />
                        </Campo>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-white/10 flex gap-3">
                    <Button variant="ghost" onClick={onClose} className="flex-1 uppercase font-black text-[10px] tracking-widest text-gray-400 h-10 rounded-xl bg-white/5 hover:bg-white/10">
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleConvertir}
                        disabled={!puedeGuardar}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white uppercase font-black text-[10px] tracking-widest h-10 rounded-xl flex items-center justify-center gap-2"
                    >
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <ArrowRightCircle size={14} />} Convertir e ir a Clientes
                    </Button>
                </div>
            </motion.div>
        </motion.div>
    );
};

export default ConvertirClienteModal;
