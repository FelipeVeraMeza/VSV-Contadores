import React, { useState, useEffect, Suspense } from 'react';
import { Helmet } from 'react-helmet';
import { motion, AnimatePresence } from 'framer-motion';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Calculator, Users, FileText,
  Landmark, ShieldCheck, FileBarChart, LogOut, Menu, X, Package,
  ChevronDown, ShoppingCart, TrendingUp, Cloud, UserCheck,
  Wallet, CreditCard, BookCopy, ArrowRightLeft,
  Building2, UserPlus, MessageCircle, Mail, Activity, PieChart, UserCircle,
  Clock, Settings, DollarSign, Book, Umbrella, Receipt, Coins, Stethoscope,
  CalendarDays, Download, Percent, HeartPulse, ListChecks, FileSpreadsheet,
  BadgeCheck, Send, PanelLeftClose, PanelLeftOpen, Network, FolderOpen
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth.jsx';
import { SiiProvider } from '@/contexts/SiiContext.jsx';
import DelayedLoader from './ui/DelayedLoader';
import GlobalCompanySelector from '@/components/ui/GlobalCompanySelector'; // Importación del nuevo selector
import AvisoFacturacion from '@/components/ui/AvisoFacturacion';
import CampanaNotificaciones from '@/components/ui/CampanaNotificaciones';
import { subRRHH } from '@/config/rrhhNav';

function MainPage() {
  const { user, logout, selectedCompany } = useAuth(); 
  const location = useLocation();
  const navigate = useNavigate();
  
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedModule, setExpandedModule] = useState(null);
  const [railCollapsed, setRailCollapsed] = useState(() => { try { return localStorage.getItem('sidebarRail') === '1'; } catch { return false; } });
  const toggleRail = () => setRailCollapsed(v => { const n = !v; try { localStorage.setItem('sidebarRail', n ? '1' : '0'); } catch { /* ignore */ } return n; });

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

  // Submódulos del menú de Facturación (soporte interno / SII).
  //
  // "Cobro del Mes" y "Correo Masivo" son de la firma completa, no de una
  // empresa: el backend los reserva al Administrador (403) y Facturacion.jsx
  // rebota a quien no corresponde. Si además se muestran en el menú, el
  // Cliente hace clic y aterriza en otra pantalla sin ninguna explicación:
  // parece que la aplicación está rota. Se esconden en origen.
  const esAdministrador = user?.rol === 'Administrador';
  const subFacturacion = [
    { id: 'emision',    name: 'Emitir DTE',              icon: Send },
    { id: 'documentos', name: 'Historial de Documentos', icon: FileText },
    ...(esAdministrador ? [
      { id: 'cobros',   name: 'Cobro del Mes',           icon: Wallet },
      { id: 'correos',  name: 'Correo Masivo',           icon: Mail },
    ] : []),
  ];

  // Submódulos del menú de Tareas.
  //
  // "Equipo" muestra las tareas de TODA la organización y es solo para
  // Administradores. Mismo triple candado que Facturación: se esconde del menú,
  // la página rebota a quien entre por URL, y el backend responde 403. Esconder
  // la opción es cortesía; el candado de verdad está en el servidor.
  const subTareas = [
    { id: 'inicio',    name: 'Inicio',     icon: LayoutDashboard },
    { id: 'proyectos', name: 'Proyectos',  icon: FolderOpen },
    { id: 'todas',     name: 'Tareas',     icon: ListChecks },
    { id: 'mias',      name: 'Mis tareas', icon: UserCircle },
    ...(esAdministrador ? [
      { id: 'equipo',  name: 'Equipo',     icon: Users },
    ] : []),
  ];

  // Submódulos del menú de Recursos Humanos (Remuneraciones)
  // subRRHH viene de src/config/rrhhNav.js (7 secciones planas y uniformes;
  // las sub-páginas de cada sección se muestran como pestañas DENTRO de la página).

  // Auto-expandir Contabilidad cuando estás dentro de esa ruta
  useEffect(() => {
    if (location.pathname.startsWith('/contabilidad')) setExpandedModule('contabilidad');
    else if (location.pathname.startsWith('/CRM')) setExpandedModule('CRM');
    else if (location.pathname.startsWith('/rrhh')) setExpandedModule('rrhh');
    else if (location.pathname.startsWith('/facturacion')) setExpandedModule('facturacion');
    else if (location.pathname.startsWith('/tareas')) setExpandedModule('tareas');
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
  // MENÚ: mismos módulos para todos, recortados por usuario en la BD
  // -----------------------------------------
  // El recorte NO se hace por rol sino por usuario, con la tabla `admin_modulos`
  // (una fila por usuario, una bandera por módulo). Así se limita en un solo
  // lugar y no hay que tocar este archivo cada vez que cambia quién ve qué.
  //
  // Regla de seguridad al revés de lo habitual: sin fila en `admin_modulos` se
  // muestra TODO. Es a propósito — un usuario sin configurar no puede quedarse
  // sin acceso a su trabajo por un olvido. El recorte es una acción explícita.
  //
  // El candado de verdad está en el backend (requireModulo). Esconder la opción
  // del menú es comodidad, no seguridad.
  // =========================================
  const modules = [
    { id: 'dashboard', path: '/dashboard', name: 'Dashboard', icon: LayoutDashboard, color: 'from-emerald-500 to-green-500' },
    { id: 'CRM', path: '/CRM', name: 'CRM', icon: Package, color: 'from-pink-500 to-rose-500', sub: subCRM },
    // Las tareas cruzan todos los módulos, no son "algo del CRM": van al mismo
    // nivel que Contabilidad o Facturación.
    { id: 'tareas', path: '/tareas', name: 'Tareas', icon: ListChecks, color: 'from-violet-500 to-purple-600', sub: subTareas },
    { id: 'contabilidad', path: '/contabilidad', name: 'Contabilidad', icon: Calculator, color: 'from-green-500 to-emerald-500', sub: subContabilidad },
    { id: 'rrhh', path: '/rrhh', name: 'Recursos Humanos', icon: Users, color: 'from-purple-500 to-violet-500', sub: subRRHH },
    { id: 'facturacion', path: '/facturacion', name: 'Facturación SII', icon: FileText, color: 'from-orange-500 to-red-500', sub: subFacturacion },
    { id: 'operacionRenta', path: '/operacion-renta', name: 'Operación Renta', icon: FileBarChart, color: 'from-teal-500 to-cyan-600' },
    { id: 'bancos', path: '/bancos', name: 'Bancos', icon: Landmark, color: 'from-indigo-500 to-blue-600' },
    { id: 'admin', path: '/admin', name: 'Administración', icon: ShieldCheck, color: 'from-yellow-500 to-amber-500' },
    { id: 'perfil', path: '/perfil', name: 'Mi Perfil', icon: UserCircle, color: 'from-cyan-500 to-blue-600' },
  ];

  // Qué módulos tiene habilitados este usuario. `user.modulos` viene del login.
  // Dashboard, Bancos, Tareas y Mi Perfil no se recortan: son transversales.
  const BANDERA_POR_MODULO = {
    contabilidad:   'puedeVerContabilidad',
    facturacion:    'puedeVerFacturacion',
    rrhh:           'puedeVerRrhh',
    operacionRenta: 'puedeVerOperacionRenta',
    CRM:            'puedeVerCrm',
    admin:          'puedeVerAdmin',
  };
  const modulosVisibles = modules.filter((m) => {
    const bandera = BANDERA_POR_MODULO[m.id];
    if (!bandera || !user?.modulos) return true;   // sin configurar = ve todo
    return user.modulos[bandera] !== false;
  });

  // El modo "rail" (solo íconos) aplica únicamente en escritorio.
  const rail = railCollapsed && windowWidth >= 1024;

  return (
    <>
      <Helmet><title>VSV Pro | Sistema Contable</title></Helmet>
      <div className="flex h-screen overflow-hidden bg-gradient-to-br from-[#fdfcf9] via-[#f4eee3] to-[#eadfce] font-sans">
        
        <AnimatePresence>
          {(sidebarOpen || windowWidth >= 1024) && (
            <motion.aside
              initial={{ x: -300, opacity: 0, width: rail ? 76 : 240 }}
              animate={{ x: 0, opacity: 1, width: rail ? 76 : 240 }}
              exit={{ x: -300, opacity: 0 }}
              transition={{ x: { type: 'tween', duration: 0.25 }, width: { type: 'tween', duration: 0.2 } }}
              className="fixed lg:relative inset-y-0 left-0 z-50 h-full bg-white border-r border-[#efe8dd] flex flex-col overflow-hidden"
            >
              {/* Encabezado: logo + botón para colapsar el panel */}
              <div className={`flex items-center ${rail ? 'justify-center' : 'justify-between'} gap-2 h-[68px] px-4 border-b border-[#efe8dd] flex-shrink-0`}>
                {!rail && (
                  <h1 className="text-[#1a1c1e] font-black text-lg flex items-center gap-2 italic uppercase tracking-tighter min-w-0">
                    <ShieldCheck className="text-[#199b4d] h-6 w-6 flex-shrink-0" /><span className="truncate">VSV Pro</span>
                  </h1>
                )}
                <button onClick={toggleRail} title={rail ? 'Expandir panel' : 'Colapsar panel'}
                  className="hidden lg:inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors flex-shrink-0">
                  {rail ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
                </button>
              </div>

              {/* Navegación (con scroll propio) */}
              <nav className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar p-3 space-y-1.5">
                {modulosVisibles.map((m) => {
                  const Icon = m.icon;
                  const isActive = location.pathname.startsWith(m.path);
                  const tieneSub = Array.isArray(m.sub) && m.sub.length > 0;
                  const expandido = expandedModule === m.id && !rail;

                  return (
                    <div key={m.id}>
                      <button
                        onClick={() => {
                          if (rail) {
                            toggleRail();
                            if (tieneSub) { setExpandedModule(m.id); if (!isActive) navigate(m.path); }
                            else { navigate(m.path); }
                            return;
                          }
                          if (tieneSub) { setExpandedModule(expandido ? null : m.id); if (!isActive) navigate(m.path); }
                          else { navigate(m.path); if (windowWidth < 1024) setSidebarOpen(false); }
                        }}
                        title={rail ? m.name : undefined}
                        className={`w-full flex items-center ${rail ? 'justify-center' : 'justify-between'} px-3 py-3 rounded-xl transition-all ${
                          isActive ? `bg-gradient-to-r ${m.color} text-white shadow-lg shadow-emerald-500/25` : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                      >
                        <span className={`flex items-center min-w-0 ${rail ? '' : 'space-x-3'}`}>
                          <Icon className="h-5 w-5 flex-shrink-0" />
                          {!rail && <span className="font-bold uppercase text-[11px] tracking-wider leading-tight text-left truncate">{m.name}</span>}
                        </span>
                        {!rail && tieneSub && <ChevronDown className={`h-4 w-4 flex-shrink-0 transition-transform ${expandido ? 'rotate-180' : ''}`} />}
                      </button>

                      {/* Sub-páginas (planas y uniformes; sus secciones internas van como pestañas dentro de la página) */}
                      {!rail && tieneSub && (
                        <AnimatePresence initial={false}>
                          {expandido && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden ml-3 mt-1 border-l border-[#efe8dd] pl-2 space-y-0.5"
                            >
                              {m.sub.map((s) => {
                                const SubIcon = s.icon;
                                const subActive = isActive && (Array.isArray(s.match) ? s.match.includes(subActivo) : subActivo === s.id);
                                return (
                                  <button key={s.id}
                                    onClick={() => { navigate(`${m.path}?sub=${s.id}`); if (windowWidth < 1024) setSidebarOpen(false); }}
                                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-left ${subActive ? 'bg-emerald-50 text-[#199b4d]' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}>
                                    <SubIcon className="h-4 w-4 flex-shrink-0" />
                                    <span className="font-bold uppercase text-[10px] tracking-wider truncate">{s.name}</span>
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
          <header className="bg-white border-b border-[#efe8dd] w-full z-30 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)} className="lg:hidden text-slate-700">
                {sidebarOpen ? <X /> : <Menu />}
              </Button>
            </div>
            
            {/* AQUÍ EL SELECTOR GLOBAL QUE CAMBIA LA EMPRESA EN TODO EL SISTEMA */}
            <GlobalCompanySelector />
            
            <div className="flex items-center space-x-4">
              <CampanaNotificaciones />
              <AvisoFacturacion />
              <div className="hidden md:block text-right mr-2">
                <p className="text-[#1a1c1e] text-sm font-bold italic uppercase">{user?.nombre}</p>
                <p className="text-[9px] font-black uppercase text-[#199b4d] tracking-widest">{user?.rol}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={logout} className="h-10 w-10 text-slate-400 hover:text-red-500"><LogOut /></Button>
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