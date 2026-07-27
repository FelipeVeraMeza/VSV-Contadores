import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Building2, Hash, Briefcase, MapPin, 
  Phone, Mail, Lock, UserCheck, Loader2, Info, CreditCard
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { cleanRut, validateRut } from '@/lib/rut';

// Modificar para adaptar numeros de telefono con prefijos internacionales y eliminar caracteres no numéricos antes de guardar en la base de datos
const formatPhoneForDB = (prefix, digits) => {
  if (!digits) return '';
  const cleanDigits = digits.replace(/\D/g, '');
  return `${prefix} ${cleanDigits}`;
};


// Utilizado para crear una empresa
const EmpresaFormModal = ({ isOpen, setIsOpen, onSave, initialData = null }) => {
  const [loading, setLoading] = useState(false);

  const initialFormState = {
    razonSocial: '',
    rut: '',
    giro: '',
    regimenTributario: '',
    prefijo: '+56', // Prefijo por defecto para pruebas, cambiar si es necesario numeros internacionales
    telefonoCorporativo: '',
    emailCorporativo: '',    
    direccion: '',            
    comuna: '',               
    ciudad: '',
    siiRut: '',             
    siiEmail: '',            
    siiPassword: '',
    rutRep: '', 
    nombreRep: '',
    activo: true
  };

  const [formData, setFormData] = useState(initialFormState);

  useEffect(() => {
    if (!isOpen) {
      setFormData(initialFormState);
      return;
    }

    if (initialData) {
      const phoneRaw = initialData.telefonoCorporativo || '';
      const parts = phoneRaw.split(' ');
      const hasPrefix = phoneRaw.startsWith('+');

      setFormData({
        ...initialData,
        razonSocial: initialData.razonSocial || '',
        rut: cleanRut(initialData.rut || ''),
        giro: initialData.giro || '',
        prefijo: hasPrefix ? parts[0] : '+56',
        telefonoCorporativo: hasPrefix ? parts.slice(1).join('').replace(/\D/g, '') : phoneRaw.replace(/\D/g, ''),
        siiPassword: '', 
        activo: initialData.activo ?? true
      });
    }
  }, [initialData, isOpen]);

  // Utilizado para actualizar una empresa
  const handleChange = (e) => {
    const { id, value } = e.target;
    if (id === 'rut' || id === 'rutRep' || id === 'siiRut') {
      const cleaned = cleanRut(value);
      if (cleaned.length <= 10) setFormData(prev => ({ ...prev, [id]: cleaned }));
    } else if (id === 'telefonoCorporativo') {
      const onlyNums = value.replace(/\D/g, '');
      if (onlyNums.length <= 12) setFormData(prev => ({ ...prev, [id]: onlyNums }));
    } else {
      setFormData(prev => ({ ...prev, [id]: value }));
    }
  };

  // Utilizado para crear/actualizar una empresa
  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();

    const s = Object.fromEntries(
      Object.entries(formData).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])
    );

    // --- 1. VALIDACIONES DE IDENTIDAD ---
    if (s.razonSocial.length < 3 || s.razonSocial.length > 200) {
      toast({ variant: "destructive", title: "RAZÓN SOCIAL INVÁLIDA", description: "Mínimo 3 caracteres reales." });
      return;
    }

    if (s.giro.length < 5 || s.giro.length > 255) {
      toast({ variant: "destructive", title: "GIRO COMERCIAL INVÁLIDO", description: "El giro debe ser más descriptivo (mínimo 5 letras)." });
      return;
    }

    if (s.regimenTributario.length < 3) {
      toast({ variant: "destructive", title: "RÉGIMEN INVÁLIDO", description: "Especifique el régimen tributario completo." });
      return;
    }

    // --- 2. VALIDACIONES DE UBICACIÓN ---
    if (s.direccion.length < 5 || s.comuna.length < 3 || s.ciudad.length < 3) {
      toast({ variant: "destructive", title: "DATOS DE UBICACIÓN", description: "Dirección, Comuna y Ciudad son obligatorios y deben ser válidos." });
      return;
    }

    // --- 3. VALIDACIONES DE EMAIL ---
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (s.emailCorporativo && s.emailCorporativo !== "" && !emailRegex.test(s.emailCorporativo)) {
      toast({ variant: "destructive", title: "EMAIL CORPORATIVO", description: "El formato de correo no es válido." });
      return;
    }

    if (!emailRegex.test(s.siiEmail)) {
      toast({ variant: "destructive", title: "EMAIL SII REQUERIDO", description: "Debe ingresar un email de contacto para el SII válido." });
      return;
    }

    // --- 4. VALIDACIONES DE RUT ---
    if (!validateRut(s.rut) || s.rut.replace(/\./g, '').length < 9) {
      toast({ variant: "destructive", title: "RUT EMPRESA INVÁLIDO", description: "Verifique el RUT de la entidad." });
      return;
    }

    if (!validateRut(s.siiRut) || s.siiRut.replace(/\./g, '').length < 9) {
      toast({ variant: "destructive", title: "RUT SII INVÁLIDO", description: "El RUT de acceso al SII no es válido." });
      return;
    }

    if (s.rutRep && !validateRut(s.rutRep)) {
      toast({ variant: "destructive", title: "RUT REPRESENTANTE", description: "El RUT del representante legal no es válido." });
      return;
    }

    // --- 5. VALIDACIÓN DE CLAVE SII ---
    if (!initialData || (s.siiPassword && s.siiPassword !== "")) {
      if (s.siiPassword.length < 4) {
        toast({ variant: "destructive", title: "CLAVE SII INSEGURA", description: "La clave debe tener al menos 4 caracteres." });
        return;
      }
    }

    if (s.telefonoCorporativo && s.telefonoCorporativo.length < 9) {
      toast({ 
        variant: "destructive", 
        title: "TELÉFONO INVÁLIDO", 
        description: "El número debe tener al menos 9 dígitos." 
      });
      return;
    }

    const camposRequeridos = ['razonSocial', 'rut', 'giro', 'direccion', 'comuna', 'ciudad', 'siiRut', 'siiEmail'];
    if (!initialData) camposRequeridos.push('siiPassword');

    const faltantes = camposRequeridos.filter(field => !s[field]);
    if (faltantes.length > 0) {
      toast({ variant: "destructive", title: "Datos Incompletos", description: "Completa los campos con asterisco (*)." });
      return;
    }

    try {
      const finalPhone = formatPhoneForDB(s.prefijo, s.telefonoCorporativo);
      const dataToSave = { 
          ...s, 
          telefonoCorporativo: finalPhone,
          razonSocial: s.razonSocial,
          regimenTributario: s.regimenTributario,
          emailCorporativo: s.emailCorporativo,
          nombreRep: s.nombreRep,
          rutRep: s.rutRep,
          siiRut: s.siiRut,
          siiEmail: s.siiEmail,
          siiPassword: s.siiPassword
        };

      delete dataToSave.prefijo;

      await onSave(dataToSave);
      setIsOpen(false);
      toast({ title: "Éxito", description: "Entidad sincronizada correctamente." });
    } catch (error) {
      toast({ 
        variant: "destructive", 
        title: "ERROR DE SEGURIDAD", 
        description: error.message || "No se pudo registrar la entidad." 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative bg-white border border-[#efe8dd] rounded-[2.5rem] w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-600 via-green-500 to-emerald-600" />

            <div className="p-6 border-b border-[#efe8dd] bg-slate-50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded-xl">
                  <Building2 className="h-5 w-5 text-blue-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 uppercase italic tracking-tighter">
                  {initialData ? 'Editar Entidad' : 'Nueva Entidad'}
                </h2>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-slate-900 rounded-full">
                <X className="h-5 w-5" />
              </Button>
            </div>

            <form onSubmit={handleSubmit} className="p-8 space-y-8 overflow-y-auto custom-scrollbar flex-1">
              
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-[#efe8dd]">
                <div className="text-xs font-bold text-slate-900 uppercase tracking-tighter">Estado Operativo en el Búnker</div>
                <Switch 
                  checked={formData.activo} 
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, activo: checked }))} 
                />
              </div>

              {/* SECCIÓN 1: Identidad Corporativa */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                   <Briefcase className="h-3 w-3 text-blue-600" />
                   <span className="text-[10px] uppercase font-black text-blue-600 tracking-[0.2em]">Identidad Corporativa</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="md:col-span-2 space-y-2">
                    <Label className="text-[10px] uppercase font-black text-slate-400 tracking-widest ml-1">Razón Social *</Label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <Input id="razonSocial" value={formData.razonSocial} onChange={handleChange} className="pl-10 bg-slate-50 border-[#efe8dd] rounded-xl h-12 text-slate-700" placeholder="Nombre Oficial de la Empresa" />
                    </div>
                  </div>

                  <div className="md:col-span-2 space-y-2">
                    <Label className="text-[10px] uppercase font-black text-slate-400 tracking-widest ml-1">Giro Comercial *</Label>
                    <div className="relative">
                      <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <Input id="giro" value={formData.giro} onChange={handleChange} className="pl-10 bg-slate-50 border-[#efe8dd] rounded-xl h-12 text-slate-700" placeholder="Ej: Venta de artículos electrónicos" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px] uppercase font-black text-slate-400 tracking-widest ml-1">RUT Empresa *</Label>
                    <div className="relative">
                      <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <Input id="rut" value={formData.rut} onChange={handleChange} className="pl-10 bg-slate-50 border-[#efe8dd] rounded-xl h-12 text-slate-700 font-mono uppercase" placeholder="12345678-9" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] uppercase font-black text-slate-400 tracking-widest ml-1">Régimen Tributario *</Label>
                    <div className="relative">
                      <Info className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <Input id="regimenTributario" value={formData.regimenTributario} onChange={handleChange} className="pl-10 bg-slate-50 border-[#efe8dd] rounded-xl h-12 text-slate-700" placeholder="Ej: ProPyme General" />
                    </div>
                  </div>
                </div>
              </div>

              {/* SECCIÓN 2: Ubicación y Contacto */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                   <MapPin className="h-3 w-3 text-emerald-600" />
                   <span className="text-[10px] uppercase font-black text-emerald-600 tracking-[0.2em]">Ubicación y Contacto</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="md:col-span-2 space-y-2">
                    <Label className="text-[10px] uppercase font-black text-slate-400 tracking-widest ml-1">Dirección Matriz *</Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <Input id="direccion" value={formData.direccion} onChange={handleChange} className="pl-10 bg-slate-50 border-[#efe8dd] rounded-xl h-12 text-slate-700" placeholder="Avenida Siempre Viva 123" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Input id="comuna" value={formData.comuna} onChange={handleChange} className="bg-slate-50 border-[#efe8dd] rounded-xl h-12 text-slate-700" placeholder="Comuna" />
                  </div>
                  <div className="space-y-2">
                    <Input id="ciudad" value={formData.ciudad} onChange={handleChange} className="bg-slate-50 border-[#efe8dd] rounded-xl h-12 text-slate-700" placeholder="Ciudad" />
                  </div>
                  
                  <div className="md:col-span-2 space-y-2">
                    <Label className="text-[10px] uppercase font-black text-slate-400 tracking-widest ml-1">Teléfono Corporativo (Hasta 12 dígitos)</Label>
                    <div className="flex gap-2">
                      <select 
                        value={formData.prefijo}
                        onChange={(e) => setFormData(p => ({...p, prefijo: e.target.value}))}
                        className="bg-slate-50 border border-[#efe8dd] rounded-xl px-4 text-slate-700 text-xs font-mono outline-none focus:ring-1 focus:ring-emerald-500 appearance-none cursor-pointer"
                      >
                        <option value="+56" className="bg-white">🇨🇱 +56</option>
                        <option value="+54" className="bg-white">🇦🇷 +54</option>
                        <option value="+51" className="bg-white">🇵🇪 +51</option>
                        <option value="+52" className="bg-white">🇲🇽 +52</option>
                        <option value="+1" className="bg-white">🇺🇸 +1</option>
                        <option value="+34" className="bg-white">🇪🇸 +34</option>
                      </select>
                      <div className="relative flex-1 group">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-blue-600" />
                        <Input 
                          id="telefonoCorporativo" 
                          value={formData.telefonoCorporativo} 
                          onChange={handleChange} 
                          className="pl-10 bg-slate-50 border-[#efe8dd] rounded-xl h-12 text-slate-700 font-mono" 
                          placeholder="9 1234 5678" 
                        />
                      </div>
                    </div>
                  </div>

                  <div className="md:col-span-2 space-y-2">
                    <Label className="text-[10px] uppercase font-black text-slate-400 tracking-widest ml-1">Email Corporativo</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <Input id="emailCorporativo" type="email" value={formData.emailCorporativo} onChange={handleChange} className="pl-10 bg-slate-50 border-[#efe8dd] rounded-xl h-12 text-slate-700" placeholder="administracion@empresa.cl" />
                    </div>
                  </div>
                </div>
              </div>

              {/* SECCIÓN 3: Representación Legal */}
              <div className="space-y-4 pt-6 border-t border-[#efe8dd]">
                <div className="flex items-center gap-2 mb-4">
                  <UserCheck className="h-4 w-4 text-purple-600" />
                  <span className="text-[10px] uppercase font-black text-purple-600 tracking-[0.2em]">Representación Legal</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-[10px] uppercase font-black text-slate-400 tracking-widest ml-1">Nombre Representante</Label>
                    <div className="relative">
                      <UserCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <Input id="nombreRep" value={formData.nombreRep} onChange={handleChange} className="pl-10 bg-slate-50 border-[#efe8dd] rounded-xl h-12 text-slate-700" placeholder="Juan Pérez" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] uppercase font-black text-slate-400 tracking-widest ml-1">RUT Representante</Label>
                    <div className="relative">
                      <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                      <Input id="rutRep" value={formData.rutRep} onChange={handleChange} className="pl-10 bg-slate-50 border-[#efe8dd] rounded-xl h-12 text-slate-700 font-mono uppercase" placeholder="12345678-K" />
                    </div>
                  </div>
                </div>
              </div>
              
              {/* SECCIÓN 4: Credenciales SII */}
              <div className="space-y-4 p-6 bg-amber-500/5 border border-amber-500/20 rounded-2xl">
                <div className="flex items-center gap-2 mb-4">
                   <Lock className="h-4 w-4 text-amber-500" />
                   <span className="text-[10px] uppercase font-black text-amber-500 tracking-[0.2em]">Credenciales SII</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] uppercase font-black text-slate-400 tracking-widest ml-1">RUT SII *</Label>
                    <Input id="siiRut" value={formData.siiRut} onChange={handleChange} className="bg-slate-50 border-[#efe8dd] rounded-xl h-12 text-slate-700 font-medium" placeholder="12345678-9" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] uppercase font-black text-slate-400 tracking-widest ml-1">Email SII *</Label>
                    <Input id="siiEmail" type="email" value={formData.siiEmail} onChange={handleChange} className="bg-slate-50 border-[#efe8dd] rounded-xl h-12 text-slate-700 font-medium" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] uppercase font-black text-slate-400 tracking-widest ml-1">Clave SII *</Label>
                    <Input id="siiPassword" type="password" value={formData.siiPassword} onChange={handleChange} className="bg-slate-50 border-[#efe8dd] rounded-xl h-12 text-slate-700 font-mono" placeholder={initialData ? "Sin cambios" : "Ingresa la clave"} />
                  </div>
                </div>
              </div>
            </form>

            <div className="p-6 border-t border-[#efe8dd] bg-slate-50 flex justify-end gap-3 shrink-0">
              <Button type="button" variant="ghost" onClick={() => setIsOpen(false)} disabled={loading} className="uppercase text-[10px] font-black tracking-widest">
                Cancelar
              </Button>
              <Button 
                onClick={handleSubmit}
                disabled={loading} 
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-10 h-12 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg active:scale-95 transition-all"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (initialData ? 'Sincronizar Cambios' : 'Registrar Empresa')}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default EmpresaFormModal;