import { Suspense, lazy, useEffect } from 'react'; 
import { Routes, Route, Navigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth.jsx';
import { Toaster } from '@/components/ui/toaster';
import { Loader2 } from 'lucide-react';

const LoginPage = lazy(() => import('../components/autenticacion/LoginPage.jsx'));
const RegisterPage = lazy(() => import('../components/autenticacion/RegisterPage'));
// Página pública de cancelar suscripción (enlace al pie de los correos).
const BajaCorreo = lazy(() => import('../components/publico/BajaCorreo.jsx'));
// Eliminamos la importación de CompanyGuard y SelectionPage
const MainPage = lazy(() => import('../components/MainPage'));
const Dashboard = lazy(() => import('../components/Dashboard'));
const CRM = lazy(() => import('../components/CRM'));
const Facturacion = lazy(() => import('../components/Facturacion'));
const Contabilidad = lazy(() => import('../components/Contabilidad'));
const RecursosHumanos = lazy(() => import('../components/RecursosHumanos'));
const OperacionRenta = lazy(() => import('../components/OperacionRenta'));
const Bancos = lazy(() => import('../components/Bancos'));
const GestionUsuarios = lazy(() => import('../components/admin/GestionUsuarios.jsx'));
const GestionEmpresas = lazy(() => import('../components/admin/GestionEmpresas.jsx'));
const Administracion = lazy(() => import('../components/admin/Administracion.jsx'));
const ProfileEditor = lazy(() => import('../components/ProfileEditor.jsx'));
const Tareas = lazy(() => import('../components/Tareas.jsx'));

const ScrollToTop = () => {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
};

const ProtectedRoute = ({ isAdminRequired = false }) => {
  const { isAuthenticated, user, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (isAdminRequired && user?.rol !== 'Administrador') {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};

function App() {
  const { isAuthenticated, login, register } = useAuth();

  return (
    <>
      <ScrollToTop />
      <Suspense fallback={
        <div className="h-screen w-full flex flex-col items-center justify-center bg-[#0a0a0c] gap-4">
          <Loader2 className="h-10 w-10 text-blue-500 animate-spin" />
          <span className="text-[10px] text-gray-500 uppercase font-black tracking-[0.3em]">Cargando Sistemas...</span>
        </div>
      }>
        <Routes>
          {/* --- 🔓 RUTAS PÚBLICAS --- */}
          <Route 
            path="/login" 
            element={!isAuthenticated ? <LoginPage onLogin={login} /> : <Navigate to="/dashboard" replace />} 
          />
          
          <Route
            path="/register"
            element={!isAuthenticated ? <RegisterPage onRegister={register} /> : <Navigate to="/dashboard" replace />}
          />

          {/* Cancelar suscripción. Es donde aterriza el cliente que pulsa el
              enlace al pie de un correo, y NO se puede proteger: quien llega es
              un cliente sin cuenta en el sistema. Va acá arriba, fuera de
              ProtectedRoute, y sin el `!isAuthenticated` de login/register —
              tiene que funcionar igual esté o no la sesión iniciada. */}
          <Route path="/baja" element={<BajaCorreo />} />

          {/* --- 🔐 RUTAS PRIVADAS --- */}
          <Route element={<ProtectedRoute isAdminRequired={false} />}>
            
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            
            {/* Si por alguna razón el sistema intenta ir a select-company, lo rebotamos al dashboard */}
            <Route path="/select-company" element={<Navigate to="/dashboard" replace />} />

            <Route element={<MainPage />}>
              {/* Rutas directas sin el CompanyGuard */}
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/perfil" element={<ProfileEditor />} />
              <Route path="/CRM" element={<CRM />} />
              <Route path="/tareas" element={<Tareas />} />
              <Route path="/contabilidad" element={<Contabilidad />} />
              <Route path="/rrhh" element={<RecursosHumanos />} />
              <Route path="/facturacion" element={<Facturacion />} />
              <Route path="/operacion-renta" element={<OperacionRenta />} />
              <Route path="/bancos" element={<Bancos />} />

              {/* Administración accesible a todos los roles: el recorte de
                  módulos se hace por usuario en la BD, no rebotando por rol.
                  Antes un Cliente que entraba acá era devuelto al dashboard. */}
              <Route path="/admin">
                <Route index element={<Administracion />} />
                <Route path="usuarios" element={<GestionUsuarios />} />
                <Route path="empresas" element={<GestionEmpresas />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        
        </Routes>
      </Suspense>
      <Toaster />
    </>
  );
}

export default App;