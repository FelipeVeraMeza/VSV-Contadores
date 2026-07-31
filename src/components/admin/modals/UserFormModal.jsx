import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, User, Briefcase, Mail, Lock, 
  CreditCard, Loader2, Search, Info,
  Eye, EyeOff, Check, ShieldCheck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/components/ui/use-toast';
import { cleanRut, validateRut } from '@/lib/rut';

const UserFormModal = ({ isOpen, onClose, onSave, user, companies = [] }) => {
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Estado inicial por defecto
  const [formData, setFormData] = useState({
    nombre: '',
    rut: '',
    email: '',
    clave: '',
    rol: 'Cliente',
    activo: true,
    assignedCompanies: [],
  });

  // Utilizado para el buscador de empresas
  const filteredCompanies = useMemo(() => {
    if (!Array.isArray(companies)) return [];
    if (!searchTerm.trim()) return companies;
    const term = searchTerm.toLowerCase();
    return companies.filter(company => 
      (company.razonSocial || "").toLowerCase().includes(term) || 
      (company.rut || "").toLowerCase().includes(term)
    );
  }, [companies, searchTerm]);

  useEffect(() => {
  if (!isOpen) {
    setFormData({ 
      nombre: '', 
      rut: '', 
      email: '', 
      clave: '', 
      rol: 'Cliente', 
      activo: true, 
      assignedCompanies: [] 
    });
    setSearchTerm("");
    setShowPassword(false);
    return;
  }

  // Utilizado para cargar datos del usuario en el formulario
  if (user) {
    setFormData({
      nombre: user.nombre || '',
      rut: cleanRut(user.rut || ''),
      email: user.email || '',
      clave: '',
      rol: user.rol || 'Cliente',
      activo: user.activo ?? true,
      assignedCompanies: Array.isArray(user.assignedCompanies) 
        ? user.assignedCompanies.map(c => String(c.id || c.empresa_id || c))
        : []
    });
  } else {
    setFormData({ 
      nombre: '', 
      rut: '', 
      email: '', 
      clave: '', 
      rol: 'Cliente', 
      activo: true, 
      assignedCompanies: [] 
    });
  }
}, [user, isOpen]);

  // Manejadores de los cambios en la actualización del usuario
  const handleChange = (e) => {
    const { name, value } = e.target;
    if ((name === 'nombre' || name === 'email') && value.length > 255) return;
    if (name === 'clave' && value.length > 128) return;

    if (name === 'rut') {
      const cleaned = cleanRut(value);
      if (cleaned.length <= 10) {
        setFormData(prev => ({ ...prev, [name]: cleaned }));
      }
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleRolChange = (rol) => setFormData(prev => ({ ...prev, rol }));
  const handleActiveChange = (checked) => setFormData(prev => ({ ...prev, activo: checked }));

  const handleCompanyChange = (id) => {
    const empresa_id = String(id);
    setFormData((prev) => {
      const isSelected = prev.assignedCompanies.includes(empresa_id);
      const newAssigned = isSelected
        ? prev.assignedCompanies.filter((item) => item !== empresa_id)
        : [...prev.assignedCompanies, empresa_id];
      return { ...prev, assignedCompanies: newAssigned };
    });
  };

  const handleSubmit = async (e) => {
  if (e && e.preventDefault) e.preventDefault();

  // Limpiar y validar campos antes de enviar
  const nombreTrim = formData.nombre.trim();
  const emailTrim = formData.email.trim();
  const rutLimpio = cleanRut(formData.rut);

  if (nombreTrim.length < 3) {
    toast({ variant: "destructive", title: "NOMBRE INVÁLIDO", description: "El nombre debe tener al menos 3 caracteres." });
    return;
  }

  if (!validateRut(rutLimpio)) {
    toast({ variant: "destructive", title: "RUT INVÁLIDO", description: "El RUT no es válido matemáticamente." });
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(emailTrim)) {
    toast({ variant: "destructive", title: "EMAIL INVÁLIDO", description: "Ingresa un correo electrónico real." });
    return;
  }

  if (!user && (!formData.clave || formData.clave.length < 8)) {
    toast({ variant: "destructive", title: "Clave requerida", description: "Mínimo 8 caracteres." });
    return;
  }

  setLoading(true);
  try {
    const dataToSend = { 
      ...formData,
      rut: cleanRut(formData.rut),
      assignedCompanies: formData.assignedCompanies.map(id => String(id))
    };
    
    if (user && !dataToSend.clave) {
      dataToSend.clave = "";
    }

    const result = await onSave({ ...dataToSend, id: user?.id });
    if (result && (result.success === true || result.id)) {
      toast({ 
        title: "✅ Éxito", 
        description: user ? "Perfil actualizado correctamente." : "Usuario registrado en el búnker." 
      });
      onClose(); 
    } else {
      throw new Error(result?.message || "El búnker rechazó la petición.");
    }

  } catch (error) {
    console.error("❌ Fallo en handleSubmit:", error);
    toast({ 
      variant: "destructive", 
      title: "Error de Servidor", 
      description: error.message || "El búnker rechazó la petición." 
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
            <div className="p-6 border-b border-[#efe8dd] bg-slate-50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded-xl">
                  <User className="h-5 w-5 text-blue-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 uppercase italic tracking-tighter">
                  {user ? 'Editar Perfil' : 'Nuevo Usuario'}
                </h2>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose} className="text-slate-500 hover:text-slate-900 rounded-full">
                <X className="h-5 w-5" />
              </Button>
            </div>

            <form onSubmit={handleSubmit} className="p-8 space-y-6 overflow-y-auto custom-scrollbar flex-1">
              
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-[#efe8dd]">
                <div className="text-xs font-bold text-slate-900 uppercase tracking-tighter">Estado de Cuenta</div>
                <Switch checked={formData.activo} onCheckedChange={handleActiveChange} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-black text-slate-400 tracking-widest ml-1">Nombre Completo</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <Input 
                      name="nombre" 
                      value={formData.nombre} 
                      onChange={handleChange} 
                      required 
                      placeholder="Ej: Juan Pérez"
                      className="pl-10 bg-slate-50 border-[#efe8dd] rounded-xl h-12 text-slate-700" 
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-black text-slate-400 tracking-widest ml-1">RUT</Label>
                  <div className="relative">
                    <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <Input 
                      name="rut" 
                      value={formData.rut} 
                      onChange={handleChange} 
                      required 
                      placeholder="12345678-9"
                      className="pl-10 bg-slate-50 border-[#efe8dd] rounded-xl h-12 text-slate-700 font-mono uppercase" 
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-black text-slate-400 tracking-widest ml-1">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <Input 
                      name="email" 
                      type="email" 
                      value={formData.email} 
                      onChange={handleChange} 
                      required 
                      placeholder="ejemplo@vsv.cl"
                      className="pl-10 bg-slate-50 border-[#efe8dd] rounded-xl h-12 text-slate-700" 
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] uppercase font-black text-slate-400 tracking-widest ml-1">Contraseña</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <Input 
                      name="clave" 
                      type={showPassword ? 'text' : 'password'}
                      value={formData.clave} 
                      onChange={handleChange} 
                      required={!user} 
                      autoComplete="new-password"
                      placeholder={user ? "••••••••" : "Mínimo 8 caracteres"}
                      className="pl-10 pr-10 bg-slate-50 border-[#efe8dd] rounded-xl h-12 text-slate-700" 
                    />
                    <button 
                      type="button" 
                      onClick={() => setShowPassword(!showPassword)} 
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-900"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {user && (
                <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
                  <Info className="h-5 w-5 text-amber-500 shrink-0" />
                  <p className="text-[10px] text-amber-200/60 font-bold uppercase tracking-wider">
                    Dejar vacío para mantener la contraseña actual.
                  </p>
                </div>
              )}

              <div className="space-y-3">
                <Label className="text-[10px] uppercase font-black text-slate-400 tracking-widest ml-1">Rol en el Sistema</Label>
                {/* Administrador se puede elegir desde el 31-jul. Antes solo había
                    Consultor y Cliente, así que cada admin nuevo se creaba por
                    consola y ninguna organización podía armar su propio equipo.
                    Los resguardos están en el backend (ver motivoParaFrenar):
                    nadie cambia su propio rol ni deja la organización sin admin. */}
                <RadioGroup value={formData.rol} onValueChange={handleRolChange} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { id: 'Administrador', icon: ShieldCheck, color: 'text-amber-600' },
                    { id: 'Consultor', icon: Briefcase, color: 'text-blue-600' },
                    { id: 'Cliente', icon: User, color: 'text-emerald-600' }
                  ].map(({ id, icon: RoleIcon, color }) => (
                    <div key={id} className="relative">
                      <RadioGroupItem value={id} id={id} className="sr-only" />
                      <Label 
                        htmlFor={id}
                        className={`flex items-center gap-4 rounded-2xl border p-4 cursor-pointer transition-all duration-200 ${
                          formData.rol === id 
                            ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/50' 
                            : 'border-[#efe8dd] bg-slate-50 hover:border-[#efe8dd]'
                        }`}
                      >
                        <div className={`p-2 rounded-lg ${formData.rol === id ? 'bg-blue-500/20' : 'bg-slate-50'}`}>
                          <RoleIcon className={`h-5 w-5 ${formData.rol === id ? 'text-blue-600' : 'text-slate-400'}`} />
                        </div>
                        <span className={`text-sm font-bold uppercase tracking-tight ${formData.rol === id ? 'text-slate-700' : 'text-slate-500'}`}>
                          {id}
                        </span>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between border-t border-[#efe8dd] pt-6">
                  <Label className="text-[10px] uppercase font-black text-slate-400 tracking-widest ml-1">Empresas Asignadas</Label>
                  <div className="relative w-40">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
                    <input 
                      type="text" 
                      value={searchTerm} 
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="FILTRAR..." 
                      className="w-full bg-slate-50 border border-[#efe8dd] rounded-lg pl-7 py-1.5 text-[9px] text-slate-900 outline-none focus:border-emerald-500 uppercase font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                  {filteredCompanies.map(company => {
                    const isSelected = formData.assignedCompanies.includes(String(company.id));
                    
                    return (
                      <div 
                        key={company.id} 
                        className={`flex items-center space-x-3 p-3 rounded-xl border transition-all ${isSelected ? 'bg-blue-600/10 border-blue-500/30' : 'bg-slate-50 border-[#efe8dd]'}`}
                      >
                        <Checkbox
                          id={`co-${company.id || company.empresa_id}`}
                          checked={formData.assignedCompanies.includes(String(company.id || company.empresa_id))}
                          onCheckedChange={() => handleCompanyChange(company.id || company.empresa_id)}
                          className="data-[state=checked]:bg-blue-600 border-[#efe8dd]"
                        />
                        <div className="flex flex-col flex-1 min-w-0 pointer-events-none">
                          <span className={`text-[10px] font-bold uppercase truncate ${isSelected ? 'text-slate-700' : 'text-slate-600'}`}>
                            {company.razonSocial}
                          </span>
                          <span className="text-[8px] font-mono text-slate-400">{cleanRut(company.rut || '')}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </form>

            <div className="p-6 border-t border-[#efe8dd] bg-slate-50 flex justify-end gap-3 shrink-0">
              <Button type="button" variant="ghost" onClick={onClose} disabled={loading} className="uppercase text-[10px] font-black tracking-widest">
                Cancelar
              </Button>
              <Button 
                type="submit" 
                onClick={handleSubmit}
                disabled={loading} 
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-10 h-12 rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center gap-2 shadow-lg shadow-emerald-900/20"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (user ? 'Guardar Cambios' : 'Registrar Usuario')}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default UserFormModal;