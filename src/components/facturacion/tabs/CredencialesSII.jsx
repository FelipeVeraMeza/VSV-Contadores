import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Fingerprint, Lock, KeyRound, MapPin, Eye, EyeOff, Save, ShieldCheck, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth.jsx';
import { toast } from '@/components/ui/use-toast';
import { getCredencialGlobalApi, saveCredencialGlobalApi } from '@/services/siiService';

// Panel de la credencial global del usuario (5 campos para facturar).
// Cada usuario (admin o cliente) tiene la suya, independiente de la empresa seleccionada.
const CredencialesSII = ({ embedded = false }) => {
  const { user } = useAuth();

  const [form, setForm] = useState({ dteRut: '', dteDv: '', dtePass: '', pfxPass: '', ciudad: 'Santiago' });
  const [tieneCredenciales, setTieneCredenciales] = useState(false);
  // La cuenta cuyo RUT es el `DTE_RUT` del sistema es la que factura hoy para
  // toda la oficina. No se le ofrece el formulario para no romper eso sin querer.
  const [esCuentaDelSistema, setEsCuentaDelSistema] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showPfx, setShowPfx] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const cargar = useCallback(async () => {
    if (!user?.sessionId) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await getCredencialGlobalApi(user.sessionId);
      const data = await res.json();
      if (data?.success) {
        setForm({
          dteRut: data.dteRut || '', dteDv: data.dteDv || '', dtePass: data.dtePass || '',
          pfxPass: data.pfxPass || '', ciudad: data.ciudad || 'Santiago'
        });
        setTieneCredenciales(!!data.tieneCredenciales);
        setEsCuentaDelSistema(!!data.esCuentaDelSistema);
      }
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar las credenciales.' });
    } finally {
      setLoading(false);
    }
  }, [user?.sessionId]);

  useEffect(() => { cargar(); }, [cargar]);

  const handleChange = (e) => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.dteRut.trim() || !form.dteDv.trim() || !form.dtePass.trim()) {
      toast({ variant: 'destructive', title: 'Faltan datos', description: 'RUT, dígito verificador y clave tributaria son obligatorios.' });
      return;
    }
    setSaving(true);
    try {
      const res = await saveCredencialGlobalApi(user.sessionId, form);
      const data = await res.json();
      if (data?.success) {
        toast({ title: '✅ Credenciales guardadas', description: 'Se guardaron encriptadas correctamente.' });
        setTieneCredenciales(true);
      } else {
        toast({ variant: 'destructive', title: 'Error', description: data?.message || 'No se pudo guardar.' });
      }
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar las credenciales.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
      className={embedded ? 'w-full' : 'max-w-2xl mx-auto'}
    >
      <div className="bg-gradient-to-br from-white to-[#f4eee3] rounded-3xl border border-[#efe8dd] shadow-2xl overflow-hidden">
        {/* Cabecera */}
        <div className="p-6 border-b border-[#efe8dd] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="p-2.5 bg-blue-500/15 rounded-xl shrink-0"><ShieldCheck className="h-5 w-5 text-blue-600" /></span>
            <div className="min-w-0">
              <h2 className="text-slate-900 font-black uppercase tracking-tight text-sm truncate">Credenciales SII (Facturación)</h2>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest truncate">Datos con los que emites tus documentos</p>
            </div>
          </div>
          {tieneCredenciales ? (
            <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-emerald-700 text-[9px] font-black uppercase tracking-widest rounded-full border border-emerald-500/30 shrink-0">
              <CheckCircle2 size={12} /> Configuradas
            </span>
          ) : (
            <span className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 text-amber-700 text-[9px] font-black uppercase tracking-widest rounded-full border border-amber-500/30 shrink-0">
              <AlertCircle size={12} /> Sin configurar
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 text-blue-500 animate-spin" />
          </div>
        ) : esCuentaDelSistema ? (
          <div className="p-6">
            <div className="bg-amber-500/[0.07] border border-amber-500/25 rounded-2xl p-5 flex gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-[12px] text-slate-600 leading-relaxed space-y-2">
                <p className="font-black uppercase tracking-widest text-amber-700 text-[10px]">
                  Cuenta de facturación del sistema
                </p>
                <p>
                  Esta es la cuenta con la que hoy se emiten <span className="font-bold text-slate-700">todos</span> los
                  documentos de la oficina. Sus credenciales están en la configuración del servidor y no se cambian
                  desde acá, para no dejar la facturación fuera de servicio sin querer.
                </p>
                <p className="text-slate-400">
                  Los demás usuarios sí configuran las suyas en esta misma pantalla.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSave} className="p-6 space-y-5">
            {/* RUT + DV */}
            <div>
              <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">RUT</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Fingerprint className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                  <input
                    name="dteRut" value={form.dteRut} onChange={handleChange} placeholder="11030124"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-[#efe8dd] rounded-xl text-sm text-slate-900 placeholder-gray-600 focus:outline-none focus:border-emerald-500/60 transition-all"
                  />
                </div>
                <span className="flex items-center text-slate-400 font-black">-</span>
                <input
                  name="dteDv" value={form.dteDv} onChange={handleChange} placeholder="3" maxLength={1}
                  className="w-14 text-center py-2.5 bg-slate-50 border border-[#efe8dd] rounded-xl text-sm text-slate-900 placeholder-gray-600 focus:outline-none focus:border-emerald-500/60 transition-all"
                />
              </div>
            </div>

            {/* Clave Tributaria */}
            <div>
              <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Clave Tributaria (SII)</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                <input
                  name="dtePass" type={showPass ? 'text' : 'password'} value={form.dtePass} onChange={handleChange} placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-[#efe8dd] rounded-xl text-sm text-slate-900 placeholder-gray-600 focus:outline-none focus:border-emerald-500/60 transition-all"
                />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-900 transition-colors">
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Clave del certificado .pfx */}
            <div>
              <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Clave del Certificado (.pfx)</label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                <input
                  name="pfxPass" type={showPfx ? 'text' : 'password'} value={form.pfxPass} onChange={handleChange} placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-[#efe8dd] rounded-xl text-sm text-slate-900 placeholder-gray-600 focus:outline-none focus:border-emerald-500/60 transition-all"
                />
                <button type="button" onClick={() => setShowPfx(!showPfx)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-900 transition-colors">
                  {showPfx ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Ciudad */}
            <div>
              <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Ciudad</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                <input
                  name="ciudad" value={form.ciudad} onChange={handleChange} placeholder="Santiago"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-[#efe8dd] rounded-xl text-sm text-slate-900 placeholder-gray-600 focus:outline-none focus:border-emerald-500/60 transition-all"
                />
              </div>
            </div>

            {/* Aviso de encriptación */}
            <div className="bg-blue-500/[0.07] border border-blue-500/20 rounded-2xl p-4 flex gap-3">
              <ShieldCheck className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Estas credenciales se usan para <span className="text-blue-700 font-bold">emitir tus documentos</span> y se guardan
                <span className="text-blue-700 font-bold"> encriptadas</span>. Son tuyas y no dependen de la empresa seleccionada.
              </p>
            </div>

            <button
              type="submit" disabled={saving}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-black uppercase tracking-widest text-xs py-3.5 rounded-xl transition-all shadow-lg shadow-emerald-900/30 disabled:opacity-60"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {saving ? 'Guardando...' : 'Guardar Credenciales'}
            </button>
          </form>
        )}
      </div>
    </motion.div>
  );
};

export default CredencialesSII;
