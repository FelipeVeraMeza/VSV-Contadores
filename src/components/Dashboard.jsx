import { motion } from 'framer-motion';
import { 
  TrendingUp, TrendingDown, FileText, Users, 
  CheckCircle, BarChart3, PieChart, Calendar, 
  Shield, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth.jsx';
import { useQuery } from '@tanstack/react-query';
import { getDashboardApi } from '@/services/dashboardService';
import { useNavigate } from 'react-router-dom';

const Dashboard = () => { 
  const navigate = useNavigate();
  const { user, selectedCompany, logout } = useAuth();

  // Validar si el que entró es el Administrador global
  const isAdmin = user?.rol === 'Administrador';

  const { data: dashboardData, isLoading, isError } = useQuery({
    queryKey: ['dashboard-data', selectedCompany?.id],
    queryFn: async () => {
      // Si no hay empresa y no es admin, no consultamos
      if (!selectedCompany?.id) return null;

      const res = await getDashboardApi(user.sessionId, selectedCompany.id);
      
      if (res.status === 401) { 
        logout(); 
        throw new Error("Sesión expirada"); 
      }
      
      if (!res.ok) throw new Error("Error al obtener métricas del búnker");

      const data = await res.json();
      return data;
    },
    // Solo dispara la API si hay una empresa seleccionada
    enabled: !!selectedCompany?.id && selectedCompany.id.length > 20,
    staleTime: 1000 * 60 * 5, 
  });

  const showNotImplementedToast = () => {
    toast({
      title: "🚧 Funcionalidad en desarrollo",
      description: "¡Esta característica no está implementada aún!",
      duration: 4000,
    });
  };

  const formatCurrency = (value) => {
    const num = Number(value);
    if (isNaN(num)) return '$0';
    return new Intl.NumberFormat('es-CL', { 
      style: 'currency', 
      currency: 'CLP', 
      minimumFractionDigits: 0 
    }).format(num);
  };

  // MAGIA AQUÍ: Si NO hay empresa seleccionada Y NO es administrador, bloqueamos.
  // Pero si ES administrador, esta pantalla de bloqueo se ignora y pasa directo abajo.
  if (!selectedCompany?.id && !isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] text-center text-slate-900 bg-white rounded-2xl border border-[#efe8dd] shadow-sm p-8">
        <Loader2 className="h-12 w-12 text-[#199b4d] animate-spin mb-6" />

        <h1 className="text-2xl font-black uppercase italic tracking-tighter mb-4">
          Sincronizando con el Búnker
        </h1>
        <p className="text-sm text-slate-500 max-w-sm uppercase tracking-widest font-bold">
          Estableciendo contexto de entidad. Si no avanza, selecciona una empresa en el menú superior.
        </p>
      </div>
    );
  }

  // Cargando solo si estamos consultando los datos de una empresa
  if (isLoading && !!selectedCompany?.id) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] text-slate-900">
        <Loader2 className="h-12 w-12 text-[#199b4d] animate-spin mb-4" />
        <p className="text-slate-500 animate-pulse">Sincronizando con el búnker...</p>
      </div>
    );
  }

  const metrics = {
    ingresos: dashboardData?.ingresosMes ?? 0,
    gastos: dashboardData?.gastosMes ?? 0,
    dteMes: dashboardData?.dteEmitidos ?? 0,
    empleados: dashboardData?.empleadosActivos ?? 0
  };
  
  // Si no hay empresa (porque es el admin), ponemos "Vista Global"
  const razonSocial = selectedCompany?.razonSocial || (isAdmin ? 'Todas las Empresas (Vista Global)' : 'Sin Razón Social');

  const stats = [
    { title: 'Ingresos del Mes', value: formatCurrency(metrics.ingresos), icon: TrendingUp, color: 'from-green-500 to-emerald-600' },
    { title: 'Gastos del Mes', value: formatCurrency(metrics.gastos), icon: TrendingDown, color: 'from-red-500 to-pink-600' },
    { title: 'DTE Emitidos', value: metrics.dteMes, icon: FileText, color: 'from-blue-500 to-cyan-600' },
    { title: 'Empleados Activos', value: metrics.empleados, icon: Users, color: 'from-purple-500 to-violet-600' }
  ];

  const recentActivities = [
    {
      type: 'info',
      icon: CheckCircle,
      title: isError ? 'Error al sincronizar datos.' : 'Sistema listo para operar.',
      time: 'Ahora',
      color: isError ? 'text-red-500' : 'text-[#199b4d]'
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
        <div>
          <h1 className="text-3xl font-bold text-[#1a1c1e] mb-2">Dashboard Principal</h1>
          <p className="text-slate-600">
            Bienvenido, {user?.nombre}.
          </p>
          <p className="text-slate-600">
            Resumen de <span className="text-slate-900 font-bold">{razonSocial}</span>
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
          <Button 
            onClick={showNotImplementedToast}
            className="bg-[#199b4d] hover:bg-[#147a3d] text-white h-11 px-4 w-full sm:w-auto flex items-center justify-center text-sm font-bold transition-all shadow-sm"
          >
            <Calendar className="h-4 w-4 mr-2 shrink-0" />
            <span className="whitespace-nowrap">Generar Reporte</span>
          </Button>

          {isAdmin && (
            <Button 
              variant="outline" 
              onClick={() => navigate('/admin')} 
              className="border border-[#e5ddd0] bg-white text-slate-700 hover:bg-slate-100 h-11 px-4 w-full sm:w-auto flex items-center justify-center text-sm font-bold transition-all"
            >
              <Shield className="h-4 w-4 mr-2 shrink-0" />
              <span className="whitespace-nowrap">Administración</span>
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="bg-white rounded-2xl p-6 border border-[#efe8dd] shadow-sm hover:shadow-md transition-all duration-300"
            >
              <div className="flex items-center justify-between mb-4">
                <div className={`w-12 h-12 bg-gradient-to-r ${stat.color} rounded-xl flex items-center justify-center shadow-sm`}>
                  <Icon className="h-6 w-6 text-white" />
                </div>
              </div>

              <h3 className="text-2xl font-bold text-[#1a1c1e] mb-1">{stat.value}</h3>
              <p className="text-slate-500 text-sm">{stat.title}</p>
            </motion.div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="bg-white rounded-2xl p-6 border border-[#efe8dd] shadow-sm"
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-semibold text-[#1a1c1e] mb-1">Flujo de Ingresos</h3>
                <p className="text-slate-500 text-sm">Últimos 12 meses</p>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={showNotImplementedToast}
                className="text-slate-600 hover:bg-slate-100"
              >
                <BarChart3 className="h-4 w-4 mr-2" />
                Ver Detalle
              </Button>
            </div>
            
            <div className="h-64 bg-gradient-to-r from-emerald-50 to-green-50 rounded-xl flex items-center justify-center border border-emerald-100">
              <div className="text-center">
                <BarChart3 className="h-16 w-16 text-[#199b4d] mx-auto mb-4" />
                <p className="text-slate-600">Gráfico de ingresos no disponible</p>
                <p className="text-sm text-slate-400 mt-2">Los datos se cargarán dinámicamente</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="bg-white rounded-2xl p-6 border border-[#efe8dd] shadow-sm"
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-semibold text-[#1a1c1e] mb-1">Distribución de Gastos</h3>
                <p className="text-slate-500 text-sm">Categorías principales</p>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={showNotImplementedToast}
                className="text-slate-600 hover:bg-slate-100"
              >
                <PieChart className="h-4 w-4 mr-2" />
                Analizar
              </Button>
            </div>
            
            <div className="h-48 bg-gradient-to-r from-orange-50 to-red-50 rounded-xl flex items-center justify-center border border-orange-100">
              <div className="text-center">
                <PieChart className="h-12 w-12 text-orange-500 mx-auto mb-3" />
                <p className="text-slate-600">Gráfico de gastos no disponible</p>
              </div>
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="bg-white rounded-2xl p-6 border border-[#efe8dd] shadow-sm"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold text-[#1a1c1e]">Actividad Reciente</h3>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={showNotImplementedToast}
              className="text-slate-600 hover:bg-slate-100"
            >
              Ver Todo
            </Button>
          </div>
          
          <div className="space-y-4">
            {recentActivities.map((activity, index) => {
              const Icon = activity.icon;
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.1 }}
                  className="flex items-start space-x-3 p-3 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <Icon className={`h-5 w-5 mt-0.5 ${activity.color}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-900 text-sm font-medium">{activity.title}</p>
                    <p className="text-slate-400 text-xs mt-1">{activity.time}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Dashboard;