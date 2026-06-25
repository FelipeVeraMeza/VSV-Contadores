import React, { useState, useEffect, Suspense } from 'react';
import { Helmet } from 'react-helmet';
import { motion, AnimatePresence } from 'framer-motion';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Calculator, Users, FileText,
  Landmark, ShieldCheck, FileBarChart, LogOut, Menu, X, Package,
  ChevronDown, ShoppingCart, TrendingUp, Cloud, UserCheck,
  Wallet, CreditCard, BookCopy, ArrowRightLeft,
  Building2, UserPlus, MessageCircle, Mail, Activity, PieChart
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
  const [expandedModule, setExpandedModule] = useState(null);

  // Submódulos del menú de Contabilidad
  const subContabilidad = [
    { id: 'compras',        name: 'Compras',           icon: ShoppingCart },
    { id: 'ventas',         name: 'Ventas',            icon: TrendingUp },
    { id: 'sii',            name: 'Conexión SII',      icon: Cloud },
    { id: 'honorarios',     name: 'Honorarios',        icon: UserCheck },
    { id: 'recaudaciones',  name: 'Recaudaciones',     icon: Wallet },
    { id: 'pagos',          name: 'Pagos',             icon: CreditCard },
    { id: 'centralizacion', name: 'Centralización',    icon: BookCopy },
    { id: 'traspaso',       name: 'Traspaso Apertura', icon: ArrowRightLeft },
    { id: 'reportes',       name: 'Reportes',          icon: FileBarChart },
  ];

  const subCRM = [
    { id: 'dashboard',     name: 'Dashboard',     icon: LayoutDashboard },
    { id: 'list',          name: 'Clientes',      icon: Building2 },
    { id: 'prospectos',    name: 'Prospectos',    icon: UserPlus },
    { id: 'whatsapp',      name: 'WhatsApp',      icon: MessageCircle },
    { id: 'correo',        name: 'Correo',        icon: Mail },
    { id: 'interacciones', name: 'Interacciones', icon: Activity },
    { id: 'analytics',     name: 'Métricas',      icon: PieChart },
  ];

  // Auto-expandir Contabilidad cuando estás dentro de esa ruta
  useEffect(() => {
    if (location.pathname.startsWith('/contabilidad')) setExpandedModule('contabilidad');
    else if (location.pathname.startsWith('/CRM')) setExpandedModule('CRM');
  }, [location.pathname]);

  const subActivo = new URLSearchParams(location.search).get('sub');

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
      { id: 'contabilidad', path: '/contabilidad', name: 'Contabilidad', icon: Calculator, color: 'from-green-500 to-emerald-500', sub: subContabilidad },
      { id: 'facturacion', path: '/facturacion', name: 'Facturación SII', icon: FileText, color: 'from-orange-500 to-red-500' },
      { id: 'rrhh', path: '/rrhh', name: 'Recursos Humanos', icon: Users, color: 'from-purple-500 to-violet-500' }
    ];
  } else {
    modules = [
      { id: 'dashboard', path: '/dashboard', name: 'Dashboard', icon: LayoutDashboard, color: 'from-blue-500 to-cyan-500' },
      { id: 'CRM', path: '/CRM', name: 'CRM', icon: Package, color: 'from-pink-500 to-rose-500', sub: subCRM },
      { id: 'contabilidad', path: '/contabilidad', name: 'Contabilidad', icon: Calculator, color: 'from-green-500 to-emerald-500', sub: subContabilidad },
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
                  const tieneSub = Array.isArray(m.sub) && m.sub.length > 0;
                  const expandido = expandedModule === m.id;

                  return (
                    <div key={m.id}>
                      <button
                        onClick={() => {
                          if (tieneSub) {
                            setExpandedModule(expandido ? null : m.id);
                            if (!isActive) navigate(m.path);
                          } else {
                            navigate(m.path); setSidebarOpen(false);
                          }
                        }}
                        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all ${
                          isActive ? `bg-gradient-to-r ${m.color} text-white shadow-lg shadow-purple-500/25` : 'text-gray-400 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        <span className="flex items-center space-x-3">
                          <Icon className="h-5 w-5" />
                          <span className="font-bold uppercase text-[11px] tracking-wider">{m.name}</span>
                        </span>
                        {tieneSub && <ChevronDown className={`h-4 w-4 transition-transform ${expandido ? 'rotate-180' : ''}`} />}
                      </button>

                      {/* Submódulos */}
                      {tieneSub && (
                        <AnimatePresence initial={false}>
                          {expandido && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden ml-3 mt-1 border-l border-white/10 pl-2 space-y-1"
                            >
                              {m.sub.map((s) => {
                                const SubIcon = s.icon;
                                const subIsActive = isActive && subActivo === s.id;
                                return (
                                  <button
                                    key={s.id}
                                    onClick={() => { navigate(`${m.path}?sub=${s.id}`); setSidebarOpen(false); }}
                                    className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg transition-all text-left ${
                                      subIsActive ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white hover:bg-white/5'
                                    }`}
                                  >
                                    <SubIcon className="h-4 w-4 flex-shrink-0" />
                                    <span className="font-bold uppercase text-[10px] tracking-wider">{s.name}</span>
                                  </button>
                                );
                              })}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      )}
                    </div>
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