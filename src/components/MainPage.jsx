import React, { useState, useEffect, Suspense } from 'react';
import { Helmet } from 'react-helmet';
import { motion, AnimatePresence } from 'framer-motion';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Calculator, Users, FileText,
  Landmark, ShieldCheck, FileBarChart, LogOut, Menu, X, Package
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth.jsx';
import { SiiProvider } from '@/contexts/SiiContext.jsx';
import DelayedLoader from './ui/DelayedLoader';
import GlobalCompanySelector from '@/components/ui/GlobalCompanySelector'; // Importación del nuevo selector

function MainPage() {
  const { user, logout, selectedCompany } = useAuth(); 
  const location = useLocation();
  const navigate = useNavigate();
  
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
      if (window.innerWidth >= 1024) setSidebarOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // =========================================
  // LÓGICA DE RUTEO POR ROLES
  // =========================================
  let modules = [];

  if (user?.rol === 'Cliente') {
    modules = [
      { id: 'dashboard', path: '/dashboard', name: 'Dashboard', icon: LayoutDashboard, color: 'from-blue-500 to-cyan-500' },
      { id: 'contabilidad', path: '/contabilidad', name: 'Contabilidad', icon: Calculator, color: 'from-green-500 to-emerald-500' },
      { id: 'facturacion', path: '/facturacion', name: 'Facturación SII', icon: FileText, color: 'from-orange-500 to-red-500' },
      { id: 'rrhh', path: '/rrhh', name: 'Recursos Humanos', icon: Users, color: 'from-purple-500 to-violet-500' }
    ];
  } else {
    modules = [
      { id: 'dashboard', path: '/dashboard', name: 'Dashboard', icon: LayoutDashboard, color: 'from-blue-500 to-cyan-500' },
      { id: 'CRM', path: '/CRM', name: 'CRM', icon: Package, color: 'from-pink-500 to-rose-500' },
      { id: 'contabilidad', path: '/contabilidad', name: 'Contabilidad', icon: Calculator, color: 'from-green-500 to-emerald-500' },
      { id: 'rrhh', path: '/rrhh', name: 'Recursos Humanos', icon: Users, color: 'from-purple-500 to-violet-500' },
      { id: 'facturacion', path: '/facturacion', name: 'Facturación SII', icon: FileText, color: 'from-orange-500 to-red-500' },
      { id: 'operacionRenta', path: '/operacion-renta', name: 'Operación Renta', icon: FileBarChart, color: 'from-teal-500 to-cyan-600' },
      { id: 'bancos', path: '/bancos', name: 'Bancos', icon: Landmark, color: 'from-indigo-500 to-blue-600' },
    ];
    if (user?.rol === 'Administrador') {
      modules.push({ id: 'admin', path: '/admin', name: 'Administración', icon: ShieldCheck, color: 'from-yellow-500 to-amber-500' });
    }
  }

  return (
    <>
      <Helmet><title>VSV Pro | Sistema Contable</title></Helmet>
      <div className="flex h-screen overflow-hidden bg-gradient-to-br from-slate-900 via-purple-900 to-indigo-900 font-sans">
        
        <AnimatePresence>
          {(sidebarOpen || windowWidth >= 1024) && (
            <motion.aside
              initial={{ x: -300, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -300, opacity: 0 }}
              className="fixed lg:relative inset-y-0 left-0 z-50 w-60 h-full bg-black/40 backdrop-blur-xl border-r border-white/10"
            >
              <div className="p-6 border-b border-white/10">
                <h1 className="text-white font-black text-xl flex items-center gap-2 italic uppercase tracking-tighter">
                  <ShieldCheck className="text-purple-400 h-6 w-6" /> VSV Pro
                </h1>
              </div>
              <nav className="p-4 space-y-2">
                {modules.map((m) => {
                  const Icon = m.icon;
                  const isActive = location.pathname.startsWith(m.path);
                  
                  return (
                    <button
                      key={m.id}
                      onClick={() => { navigate(m.path); setSidebarOpen(false); }}
                      className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${
                        isActive ? `bg-gradient-to-r ${m.color} text-white shadow-lg shadow-purple-500/25` : 'text-gray-400 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="font-bold uppercase text-[11px] tracking-wider">{m.name}</span>
                    </button>
                  );
                })}
              </nav>
            </motion.aside>
          )}
        </AnimatePresence>

        <div className="flex-1 flex flex-col h-full overflow-hidden w-full">
          {/* HEADER CON SELECTOR GLOBAL */}
          <header className="bg-black/20 backdrop-blur-xl border-b border-white/10 w-full z-30 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)} className="lg:hidden text-white">
                {sidebarOpen ? <X /> : <Menu />}
              </Button>
            </div>
            
            {/* AQUÍ EL SELECTOR GLOBAL QUE CAMBIA LA EMPRESA EN TODO EL SISTEMA */}
            <GlobalCompanySelector />
            
            <div className="flex items-center space-x-4">
              <div className="hidden md:block text-right mr-2">
                <p className="text-white text-sm font-bold italic uppercase">{user?.nombre}</p>
                <p className="text-[9px] font-black uppercase text-amber-400 tracking-widest">{user?.rol}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={logout} className="h-10 w-10 text-gray-400 hover:text-red-400"><LogOut /></Button>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto custom-scrollbar p-3 sm:p-5 lg:p-8">
            <div className="max-w-[1600px] mx-auto h-full">
              <SiiProvider>
                <Suspense fallback={<DelayedLoader />}>
                  <Outlet />
                </Suspense> 
              </SiiProvider>
            </div>
          </main>
        </div>
      </div>
    </>
  );
}

export default MainPage;