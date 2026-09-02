import { useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { 
  Fingerprint,
  Lock,
  Eye, 
  EyeOff, 
  Loader2, 
  ShieldCheck,
  ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { Link, useNavigate } from 'react-router-dom';

const LoginPage = ({ onLogin }) => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    identificador: '',
    clave: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e) => {
    const { id, value } = e.target;

    // El campo es el RUT SIN dígito verificador. Se deja escribir solo números
    // (y la arroba/letras del correo, para la cuenta master, que es la única
    // que entra con email). Los puntos y el guion se descartan solos.
    if (id === 'identificador') {
      const esCorreo = value.includes('@');
      const limpio = esCorreo ? value.trim() : value.replace(/[^0-9kK]/g, '');
      setFormData({ ...formData, identificador: limpio });
      return;
    }

    setFormData({ ...formData, [id]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { identificador, clave } = formData;

    if (!identificador || !clave) {
      toast({
        title: "Faltan datos",
        description: "Escribe tu RUT y tu contraseña.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const result = await onLogin(identificador.trim(), clave);

      if (!result.success) {
        toast({
          title: "Fallo de Acceso",
          description: result.message || "Credenciales inválidas.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Acceso Concedido",
          description: "Bienvenido al ecosistema VSV Pro.",
          className: "bg-emerald-500 border-none text-white",
        });
        // Aquí es donde nos aseguramos que vaya directo al dashboard
        navigate('/dashboard');
      }
    } catch (err) {
      toast({
        title: "Error de Enlace",
        description: "No se pudo establecer conexión con el servidor.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Acceso - VSV Pro</title>
      </Helmet>
      
      <div className="min-h-screen w-full flex items-center justify-center bg-[#fbfaf7] p-4 font-sans relative overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-emerald-200/50 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-green-200/50 blur-[120px] rounded-full" />

        <div className="w-full max-w-md relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="bg-white border border-[#efe8dd] rounded-[2rem] shadow-xl shadow-black/[0.06] overflow-hidden"
          >
            <div className="p-8 md:p-10">
              <div className="flex flex-col items-center mb-10">
                <motion.div 
                  whileHover={{ scale: 1.05 }}
                  className="w-16 h-16 bg-[#199b4d] rounded-2xl flex items-center justify-center mb-5 shadow-lg shadow-emerald-600/30"
                >
                  <ShieldCheck className="h-9 w-9 text-white" />
                </motion.div>
                <h1 className="text-4xl font-black text-[#1a1c1e] text-center tracking-tighter uppercase italic leading-none">
                  VSV <span className="text-[#199b4d] text-3xl">PRO</span>
                </h1>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-[0.4em] mt-3">
                  Sistema de Gestión Central
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="identificador" className="text-xs font-bold text-slate-600 uppercase ml-1 tracking-wider">
                    RUT
                  </Label>
                  <div className="relative group">
                    <Fingerprint className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 group-focus-within:text-[#199b4d] transition-colors" />
                    <Input
                      id="identificador"
                      type="text"
                      inputMode="numeric"
                      autoComplete="username"
                      placeholder="18358147"
                      value={formData.identificador}
                      onChange={handleChange}
                      className="pl-12 !bg-white !border-[#e5ddd0] !text-slate-900 placeholder:!text-slate-400 focus:!border-[#199b4d] focus:!ring-2 focus:!ring-[#199b4d]/20 transition-all h-12 rounded-xl font-mono tracking-wide"
                      required
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 font-medium ml-1">
                    Sin puntos y <span className="font-bold text-slate-500">sin el dígito verificador</span>.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="clave" className="text-xs font-bold text-slate-600 uppercase tracking-wider ml-1">
                    Contraseña
                  </Label>
                  <div className="relative group">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 group-focus-within:text-[#199b4d] transition-colors" />
                    <Input
                      id="clave"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      value={formData.clave}
                      onChange={handleChange}
                      className="pl-12 pr-12 !bg-white !border-[#e5ddd0] !text-slate-900 placeholder:!text-slate-400 focus:!border-[#199b4d] focus:!ring-2 focus:!ring-[#199b4d]/20 transition-all h-12 rounded-xl"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <motion.div whileTap={{ scale: 0.98 }} className="pt-4">
                  <Button 
                    type="submit" 
                    disabled={isLoading} 
                    className="w-full h-12 bg-[#199b4d] hover:bg-[#147a3d] text-white rounded-xl font-bold uppercase text-sm tracking-widest shadow-lg shadow-emerald-600/25 transition-all"
                  >
                    {isLoading ? (
                      <div className="flex items-center gap-3">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span>Verificando...</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span>Entrar al Sistema</span>
                        <ArrowRight size={18} />
                      </div>
                    )}
                  </Button>
                </motion.div>
              </form>

              <div className="text-center mt-10 space-y-4">
                <p className="text-slate-500 text-xs font-medium">
                  ¿Aún no tienes cuenta?{' '}
                  <Link to="/register" className="text-[#199b4d] hover:text-[#147a3d] transition-colors font-bold underline underline-offset-4">
                    Regístrate aquí
                  </Link>
                </p>
                {/* El dominio vsv.cl NO EXISTE: quien escribiera a «soporte@vsv.cl»
                    mandaba su pedido al vacío y se quedaba esperando respuesta, sin
                    poder entrar. Se apunta al administrador de la oficina, que es
                    quien de verdad puede reponer una clave. */}
                <button
                  onClick={() => toast({ title: "Recuperación de clave", description: "Pídele al administrador del sistema que te reponga la clave desde Administración › Usuarios." })}
                  className="block w-full text-slate-400 hover:text-slate-600 text-[10px] font-bold uppercase tracking-widest transition-colors"
                >
                  ¿Olvidaste tus credenciales?
                </button>
              </div>
            </div>
          </motion.div>
          
          <div className="mt-8 flex items-center justify-center gap-4 text-[9px] text-slate-400 font-bold uppercase tracking-[0.3em]">
             <span>VSV PRO v2.0</span>
             <div className="w-1 h-1 bg-slate-300 rounded-full" />
             <span>Secure Access</span>
          </div>
        </div>
      </div>
    </>
  );
};

export default LoginPage;