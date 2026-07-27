import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth.jsx';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { Eye, EyeOff, Save, ShieldCheck, User, Mail, Fingerprint, Lock, KeyRound, BadgeCheck } from 'lucide-react';
import CredencialesSII from '@/components/facturacion/tabs/CredencialesSII';

// Fuerza de la contraseña nueva (0-4 → barra + etiqueta)
const getStrength = (pw) => {
  if (!pw) return { pct: 0, label: '', bar: '', text: '' };
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const map = [
    { pct: 25, label: 'Débil',  bar: 'bg-red-500',     text: 'text-red-500' },
    { pct: 50, label: 'Media',  bar: 'bg-amber-500',   text: 'text-amber-600' },
    { pct: 75, label: 'Buena',  bar: 'bg-blue-500',    text: 'text-blue-600' },
    { pct: 100, label: 'Fuerte', bar: 'bg-emerald-500', text: 'text-emerald-600' },
  ];
  return map[Math.max(0, score - 1)];
};

// Campo de texto reutilizable con icono
const Campo = ({ icon: Icon, label, ...props }) => (
  <div>
    <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">{label}</label>
    <div className="relative">
      <Icon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
      <input
        {...props}
        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-[#efe8dd] rounded-xl text-sm text-slate-900 placeholder-gray-600 focus:outline-none focus:border-emerald-500/60 focus:bg-slate-50 transition-all"
      />
    </div>
  </div>
);

const ProfileEditor = () => {
  const { user, saveUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  const [formData, setFormData] = useState({
    nombre: user?.nombre || '',
    email: user?.email || '',
    rut: user?.rut || '',
    claveActual: '',
    claveNueva: '',
    claveConfirm: ''
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validaciones
      if (!formData.nombre.trim()) {
        toast({ title: '⚠️ Error', description: 'El nombre no puede estar vacío', duration: 3000 });
        setLoading(false);
        return;
      }

      if (!formData.email.trim()) {
        toast({ title: '⚠️ Error', description: 'El email no puede estar vacío', duration: 3000 });
        setLoading(false);
        return;
      }

      // Usar el email del formulario (no del user object que podría ser null)
      const emailToSend = formData.email.trim().toLowerCase();

      // Si intenta cambiar contraseña
      if (formData.claveNueva) {
        if (!formData.claveActual) {
          toast({ title: '⚠️ Error', description: 'Debes ingresar tu contraseña actual', duration: 3000 });
          setLoading(false);
          return;
        }

        if (formData.claveNueva.length < 8) {
          toast({ title: '⚠️ Error', description: 'La nueva contraseña debe tener mínimo 8 caracteres', duration: 3000 });
          setLoading(false);
          return;
        }

        if (formData.claveNueva !== formData.claveConfirm) {
          toast({ title: '⚠️ Error', description: 'Las contraseñas no coinciden', duration: 3000 });
          setLoading(false);
          return;
        }
      }

      // Datos a enviar
      const dataToSend = {
        id: user?.id,
        nombre: formData.nombre.trim(),
        email: emailToSend,
        rut: formData.rut.trim(),
        clave: formData.claveNueva || undefined
      };

      if (!dataToSend.id) {
        toast({
          title: '❌ Error',
          description: 'No se pudo obtener tu ID de usuario. Por favor recarga la página.',
          duration: 3000
        });
        setLoading(false);
        return;
      }

      // Llamar a saveUser
      const result = await saveUser(dataToSend);

      if (result.success) {
        toast({
          title: '✅ Perfil actualizado',
          description: 'Tus datos han sido guardados correctamente',
          duration: 3000
        });
        // Limpiar campos de contraseña
        setFormData(prev => ({
          ...prev,
          claveActual: '',
          claveNueva: '',
          claveConfirm: ''
        }));
      } else {
        toast({
          title: '❌ Error',
          description: result.message || 'No se pudo actualizar el perfil',
          duration: 3000
        });
      }
    } catch (error) {
      toast({
        title: '❌ Error',
        description: error.message,
        duration: 3000
      });
    } finally {
      setLoading(false);
    }
  };

  const iniciales = (formData.nombre || 'U').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'U';
  const strength = getStrength(formData.claveNueva);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
      className="max-w-5xl mx-auto space-y-6"
    >
      {/* HERO: avatar + identidad */}
      <div className="relative overflow-hidden bg-gradient-to-br from-white to-[#f4eee3] rounded-3xl border border-[#efe8dd] shadow-2xl p-6 sm:p-8">
        <div className="absolute -top-10 -right-10 opacity-[0.04]"><ShieldCheck size={180} /></div>
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center text-white text-2xl font-black shadow-lg shadow-emerald-900/40 shrink-0">
            {iniciales}
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight truncate">{formData.nombre || 'Mi Perfil'}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/15 text-amber-700 text-[10px] font-black uppercase tracking-widest rounded-full border border-amber-500/30">
                <BadgeCheck size={12} /> {user?.rol || 'Usuario'}
              </span>
              {formData.email && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-50 text-slate-600 text-[10px] font-bold tracking-wider rounded-full border border-[#efe8dd]">
                  <Mail size={11} /> {formData.email}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* INFORMACIÓN PERSONAL */}
        <div className="bg-slate-50/60 border border-[#efe8dd] rounded-3xl p-6 space-y-5">
          <h2 className="text-slate-900 font-black uppercase tracking-widest text-xs flex items-center gap-2">
            <span className="p-1.5 bg-blue-500/15 rounded-lg"><User className="h-4 w-4 text-blue-600" /></span>
            Información Personal
          </h2>
          <div className="space-y-4">
            <Campo icon={User} label="Nombre Completo" type="text" name="nombre" value={formData.nombre} onChange={handleChange} placeholder="Tu nombre" />
            <Campo icon={Mail} label="Email" type="email" name="email" value={formData.email} onChange={handleChange} placeholder="tu@email.com" />
            <Campo icon={Fingerprint} label="RUT" type="text" name="rut" value={formData.rut} onChange={handleChange} placeholder="XX.XXX.XXX-X" />
          </div>
        </div>

        {/* SEGURIDAD */}
        <div className="bg-slate-50/60 border border-[#efe8dd] rounded-3xl p-6 space-y-5">
          <div>
            <h2 className="text-slate-900 font-black uppercase tracking-widest text-xs flex items-center gap-2">
              <span className="p-1.5 bg-purple-500/15 rounded-lg"><Lock className="h-4 w-4 text-purple-600" /></span>
              Cambiar Contraseña
            </h2>
            <p className="text-[11px] text-slate-400 mt-2 font-medium">Deja estos campos vacíos si no deseas cambiarla.</p>
          </div>

          <div className="space-y-4">
            {/* Contraseña Actual */}
            <div>
              <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Contraseña Actual</label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="claveActual"
                  value={formData.claveActual}
                  onChange={handleChange}
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-[#efe8dd] rounded-xl text-sm text-slate-900 placeholder-gray-600 focus:outline-none focus:border-emerald-500/60 transition-all"
                  placeholder="••••••••"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-900 transition-colors">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Nueva Contraseña */}
            <div>
              <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Nueva Contraseña (mín. 8)</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  name="claveNueva"
                  value={formData.claveNueva}
                  onChange={handleChange}
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-[#efe8dd] rounded-xl text-sm text-slate-900 placeholder-gray-600 focus:outline-none focus:border-emerald-500/60 transition-all"
                  placeholder="••••••••"
                />
                <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-900 transition-colors">
                  {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {/* Medidor de fuerza */}
              {formData.claveNueva && (
                <div className="flex items-center gap-2 mt-2">
                  <div className="h-1.5 flex-1 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-300 ${strength.bar}`} style={{ width: `${strength.pct}%` }} />
                  </div>
                  <span className={`text-[9px] font-black uppercase tracking-widest ${strength.text}`}>{strength.label}</span>
                </div>
              )}
            </div>

            {/* Confirmar */}
            {formData.claveNueva && (
              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Confirmar Nueva Contraseña</label>
                <div className="relative">
                  <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                  <input
                    type="password"
                    name="claveConfirm"
                    value={formData.claveConfirm}
                    onChange={handleChange}
                    className={`w-full pl-10 pr-4 py-2.5 bg-slate-50 border rounded-xl text-sm text-slate-900 placeholder-gray-600 focus:outline-none transition-all ${
                      formData.claveConfirm && formData.claveConfirm !== formData.claveNueva
                        ? 'border-red-500/60' : 'border-[#efe8dd] focus:border-emerald-500/60'
                    }`}
                    placeholder="••••••••"
                  />
                </div>
                {formData.claveConfirm && formData.claveConfirm !== formData.claveNueva && (
                  <p className="text-[10px] text-red-500 font-bold mt-1.5">Las contraseñas no coinciden</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* AVISO + GUARDAR (ancho completo) */}
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-2xl p-4 flex gap-3">
            <ShieldCheck className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-slate-600 leading-relaxed">
              <p className="font-black uppercase tracking-widest text-blue-700 text-[10px] mb-0.5">Seguridad</p>
              Tus datos se encriptan automáticamente en la base de datos. Nunca compartas tu contraseña con nadie.
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full sm:w-auto sm:min-w-[220px] sm:ml-auto flex bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-black uppercase tracking-widest text-xs py-6 rounded-xl transition-all items-center justify-center gap-2 shadow-lg shadow-emerald-900/30 disabled:opacity-60"
          >
            <Save size={16} />
            {loading ? 'Guardando...' : 'Guardar Cambios'}
          </Button>
        </div>
      </form>

      {/* CREDENCIALES SII: cada usuario tiene su propia credencial global de facturación */}
      <div className="pt-2">
        <CredencialesSII embedded />
      </div>
    </motion.div>
  );
};

export default ProfileEditor;
