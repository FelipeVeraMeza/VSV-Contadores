import React, { useState } from 'react';
import { useAuth } from '@/hooks/useAuth.jsx';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { Eye, EyeOff, Save, AlertCircle } from 'lucide-react';

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Mi Perfil</h1>
        <p className="text-gray-400">Actualiza tu información personal y credenciales de acceso</p>
      </div>

      {/* Formulario */}
      <form onSubmit={handleSubmit} className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-6">

        {/* Sección de Información Personal */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            👤 Información Personal
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Nombre */}
            <div>
              <label className="block text-sm font-bold text-gray-300 mb-2">Nombre Completo</label>
              <input
                type="text"
                name="nombre"
                value={formData.nombre}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-black/30 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="Tu nombre"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-bold text-gray-300 mb-2">Email</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-black/30 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="tu@email.com"
              />
            </div>

            {/* RUT */}
            <div>
              <label className="block text-sm font-bold text-gray-300 mb-2">RUT</label>
              <input
                type="text"
                name="rut"
                value={formData.rut}
                onChange={handleChange}
                className="w-full px-4 py-2 bg-black/30 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                placeholder="XX.XXX.XXX-X"
              />
            </div>
          </div>
        </div>

        {/* Separador */}
        <div className="border-t border-white/10"></div>

        {/* Sección de Cambio de Contraseña */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            🔐 Cambiar Contraseña
          </h2>
          <p className="text-sm text-gray-400">Deja estos campos vacíos si no deseas cambiar tu contraseña</p>

          <div className="space-y-3">
            {/* Contraseña Actual */}
            <div>
              <label className="block text-sm font-bold text-gray-300 mb-2">Contraseña Actual</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  name="claveActual"
                  value={formData.claveActual}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-black/30 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors pr-10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Contraseña Nueva */}
            <div>
              <label className="block text-sm font-bold text-gray-300 mb-2">Nueva Contraseña (mín. 8 caracteres)</label>
              <div className="relative">
                <input
                  type={showNewPassword ? "text" : "password"}
                  name="claveNueva"
                  value={formData.claveNueva}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-black/30 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors pr-10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                >
                  {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Confirmar Contraseña */}
            {formData.claveNueva && (
              <div>
                <label className="block text-sm font-bold text-gray-300 mb-2">Confirmar Nueva Contraseña</label>
                <input
                  type="password"
                  name="claveConfirm"
                  value={formData.claveConfirm}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-black/30 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                  placeholder="••••••••"
                />
              </div>
            )}
          </div>
        </div>

        {/* Aviso de Seguridad */}
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 flex gap-3">
          <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-100">
            <p className="font-bold">⚠️ Seguridad</p>
            <p>Tus datos se encriptan automáticamente en la base de datos. Nunca compartas tu contraseña con nadie.</p>
          </div>
        </div>

        {/* Botones */}
        <div className="flex gap-3">
          <Button
            type="submit"
            disabled={loading}
            className="flex-1 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-bold py-2 rounded-lg transition-all flex items-center justify-center gap-2"
          >
            <Save size={18} />
            {loading ? 'Guardando...' : 'Guardar Cambios'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default ProfileEditor;
