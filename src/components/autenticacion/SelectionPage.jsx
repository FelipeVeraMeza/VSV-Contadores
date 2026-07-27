//
// Esta pagina es utilizada para mostrar un mensaje cuando el usuario 
// no ha seleccionado una empresa, 
//


import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { LayoutDashboard, ShieldCheck, Building2, ArrowRight, RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

const SelectionPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const handleRefresh = () => {
    queryClient.invalidateQueries();
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 space-y-8">
      <div className="relative">
        <div className="absolute -inset-4 bg-emerald-500/20 blur-xl rounded-full animate-pulse" />
        <Building2 className="h-16 w-16 text-emerald-500 relative" />
      </div>
      
      <div className="space-y-3">
        <h1 className="text-4xl font-black text-slate-900 italic uppercase tracking-tighter">
          No hay empresa seleccionada
        </h1>
        <p className="text-slate-500 max-w-md mx-auto text-sm leading-relaxed">
          {user?.rol === 'Administrador' 
            ? "Puedes acceder al panel de administración o seleccionar una empresa."
            : "Bienvenido al sistema. Por favor, selecciona una empresa en el menú superior izquierdo para comenzar."}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-center">
        {/* Mostrar botón de administración solo para usuarios con rol 'Administrador' */}
        {user?.rol === 'Administrador' && (
          <Button 
            onClick={() => navigate('/admin')}
            className="group bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase text-[10px] tracking-widest px-8 h-12 rounded-2xl flex items-center gap-2 transition-all"
          >
            <ShieldCheck className="h-4 w-4" />
            Ir a Administración
            <ArrowRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
          </Button>
        )}

        <Button 
          onClick={handleRefresh}
          variant="outline"
          className="border-[#efe8dd] bg-white text-slate-500 hover:text-slate-900 font-black uppercase text-[10px] tracking-widest px-8 h-12 rounded-2xl flex items-center gap-2 transition-all"
        >
          <RefreshCw className="h-4 w-4" />
          Refrescar Empresas
        </Button>
      </div>
    </div>
  );
};

export default SelectionPage;