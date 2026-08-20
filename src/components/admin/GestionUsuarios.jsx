import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, User as UserIcon, Shield, 
  Briefcase, Search, Mail, Hash, Pencil, Trash2, 
  UserPlus, X, Loader2, LayoutDashboard, ChevronRight,
  MailCheckIcon
} from 'lucide-react';
import { useInfiniteQuery, useQueryClient, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth.jsx';
import { toast } from '@/components/ui/use-toast';

import UserFormModal from '@/components/admin/modals/UserFormModal';
import { getUsersApi } from '@/services/userService.js';
import { getCompaniesApi } from '@/services/companyService'; 
import { cleanRut } from '@/lib/rut';

// --- TARJETA DE LISTA ---
const UserListCard = ({ u, isSelected, onClick, rolStyles, searchTerm }) => {
  const style = rolStyles[u.rol] || rolStyles.Cliente;

  const isRutMatch = searchTerm && cleanRut(u.rut).includes(cleanRut(searchTerm));

  return (
    <motion.div
      layout
      onClick={onClick}
      className={`relative p-5 rounded-[1.8rem] border transition-all duration-300 cursor-pointer flex items-center justify-between group
        ${isSelected 
          ? 'bg-blue-600/10 border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.15)] ring-1 ring-blue-500/20' 
          : 'bg-white border-[#efe8dd] hover:bg-slate-50 hover:border-[#efe8dd]'
        }`}
    >
      <div className="flex items-center gap-4 min-w-0">
        <div className={`p-3 rounded-xl border transition-colors ${isSelected ? 'bg-blue-600/20 border-blue-500/40' : 'bg-white border-[#efe8dd]'}`}>
          <UserIcon className={`h-5 w-5 ${isSelected ? 'text-blue-600' : 'text-slate-400'}`} />
        </div>
        <div className="min-w-0">
          <h3 className={`text-slate-900 font-black text-sm uppercase italic truncate transition-colors ${isSelected ? 'text-blue-600' : ''}`}>
            {u.nombre}
          </h3>
          <p className={`font-mono text-[9px] tracking-widest uppercase mt-0.5 transition-colors ${isRutMatch ? 'text-blue-600 font-bold' : 'text-slate-400'}`}>
            {cleanRut(u.rut)}
          </p>
        </div>
      </div>
      
      <div className="flex items-center gap-3 shrink-0">
        <div className={`h-2 w-2 rounded-full ${u.activo ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-red-500'}`} />
        <ChevronRight className={`h-4 w-4 transition-transform ${isSelected ? 'text-blue-600 translate-x-1' : 'text-slate-600'}`} />
      </div>
    </motion.div>
  );
};

/* Visor del perfil */
const UserInspector = ({ u, onEdit, onDelete, rolStyles, allCompanies = [] }) => {
  if (!u) return (
    <div className="h-full flex flex-col items-center justify-center text-center p-10 opacity-20">
      <LayoutDashboard size={40} className="text-slate-400 mb-4" />
      <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500 italic">Esperando Selección</p>
    </div>
  );

  const assignedData = useMemo(() => {
    if (!u.assignedCompanies) return [];

    console.log("Asignaciones del usuario:", u.assignedCompanies);

    return u.assignedCompanies.map(companyId => {
      const found = allCompanies.find(c => String(c.id) === String(companyId));

      return found ? {
        razonSocial: found.razonSocial,
        rut: found.rut
      } : { 
        razonSocial: "ID: " + companyId.substring(0,8),
        rut: "No disponible" 
      };
    });
  }, [u.assignedCompanies, allCompanies]);

  const style = rolStyles[u.rol] || rolStyles.Cliente;

  return (
    <motion.div 
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      key={u.id}
      className="h-full flex flex-col"
    >
      {/* 1. HEADER */}
      <header className="p-6 border-b border-[#efe8dd] bg-white">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="p-3 bg-white rounded-2xl border border-[#efe8dd] shadow-xl">
              <UserIcon size={24} className="text-blue-500" />
            </div>
            <div className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#0a0a0c] ${u.activo ? 'bg-emerald-500' : 'bg-red-500'}`} />
          </div>
          
          <div className="min-w-0">
            <h2 className="text-slate-900 font-black text-xl uppercase italic tracking-tighter leading-none truncate">
              {u.nombre}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span className={`px-2 py-0.5 rounded-md border text-[8px] font-black uppercase tracking-widest ${style.color}`}>
                {u.rol}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* 2. CONTENIDO */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
        
        {/* DATOS */}
        <div className="grid grid-cols-1 gap-2">
          <p className="text-[9px] uppercase font-black text-slate-400 tracking-[0.3em] ml-1 mb-1">Información de Enlace</p>
          {[
            { label: 'Identificador RUT', value: cleanRut(u.rut), icon: Hash },
            { label: 'Correo Electrónico', value: u.email, icon: Mail }
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-3 p-3 bg-white border border-[#efe8dd] rounded-xl">
              <item.icon size={14} className="text-blue-600 shrink-0" />
              <div className="flex flex-col min-w-0">
                <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">{item.label}</span>
                <span className="text-[11px] text-slate-600 font-bold uppercase truncate tracking-tight">{item.value}</span>
              </div>
            </div>
          ))}
        </div>

        {/* EMPRESAS ASIGNADAS*/}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-[#efe8dd] pb-2">
            <p className="text-[9px] uppercase font-black text-slate-400 tracking-[0.3em] ml-1">Entidades Autorizadas</p>
            <span className="text-[9px] font-black text-blue-500 bg-blue-500/10 px-2 rounded-full border border-blue-500/20">
              {u.assignedCompanies?.length || 0}
            </span>
          </div>
          
          <div className="grid grid-cols-1 gap-2 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
            {assignedData.length > 0 ? (
              assignedData.map((co, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 bg-white border border-[#efe8dd] rounded-xl group hover:bg-slate-50">
                  <div className="p-1.5 bg-white rounded-lg text-slate-400 group-hover:text-blue-600 transition-colors">
                    <Briefcase size={12} />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[10px] text-slate-600 font-bold uppercase truncate">
                      {co.razonSocial}
                    </span>
                    <span className="text-[8px] text-slate-400 font-mono">
                      {co.rut !== "No disponible" ? cleanRut(co.rut) : co.rut}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-4 text-center opacity-20 italic text-[9px]">Sin asignaciones</div>
            )}
          </div>
        </div>
      </div>

      {/* ACCIONES */}
      <footer className="p-6 border-t border-[#efe8dd] bg-slate-50 backdrop-blur-md">
        <div className="flex gap-3">
          {/* Los administradores ya se pueden editar y eliminar. Los resguardos
              viven en el backend (motivoParaFrenar): no puedes cambiar tu propio
              rol, ni desactivarte, ni dejar la organización sin administrador.
              Se ponen ahí y no acá para que valgan aunque alguien llame la API
              directo. */}
          <Button 
            variant="ghost"
            onClick={() => onDelete(u)}
            className="bg-red-600/10 text-red-500 hover:bg-red-600 hover:text-slate-900 h-12 w-12 rounded-xl border border-red-500/10 active:scale-95 transition-all"
          >
            <Trash2 size={18} />
          </Button>
          <Button 
            onClick={() => onEdit(u)}
            className="flex-1 bg-emerald-600 hover:bg-emerald-500 h-12 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-emerald-900/20 active:scale-95 transition-all"
          >
            <Pencil className="mr-2 h-3.5 w-3.5" /> Editar Perfil
          </Button>
        </div>
      </footer>
    </motion.div>
  );
};

const GestionUsuarios = () => {
  const navigate = useNavigate();
  const { user, deleteUser, saveUser, logout } = useAuth();
  const queryClient = useQueryClient();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(""); 
  const [selectedUser, setSelectedUser] = useState(null); // Para el Modal
  const [userInView, setUserInView] = useState(null); // Para el Visor Derecho
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  
  const searchInputRef = useRef(null);
  const observer = useRef();

  {/* BARRA DE BÚSQUEDA */}
  useEffect(() => {
    const handler = setTimeout(() => {
      const trimmed = searchTerm.trim();
      if (!trimmed) {
        setDebouncedSearchTerm("");
        return;
      }
      const esNombre = /[a-jL-Z]/i.test(trimmed);
      setDebouncedSearchTerm(esNombre ? trimmed : cleanRut(trimmed));
    }, 350);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const { data: companiesData } = useQuery({
    queryKey: ['companies-razons'],
    queryFn: async () => {
      const res = await getCompaniesApi(user?.sessionId, { limit: 1000 });
      if (res.status === 401) logout();
      const data = await res.json();
      return data.companies || [];
    },
    enabled: !!user?.sessionId, 
    staleTime: 1000 * 60 * 10,
  });

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: initialLoading
  } = useInfiniteQuery({
    queryKey: ['users', debouncedSearchTerm], 
    queryFn: async ({ pageParam = 0 }) => {
      const res = await getUsersApi(user?.sessionId, { 
        page: pageParam, 
        limit: 10, 
        search: debouncedSearchTerm 
      });
      
      if (res.status === 401) {
        logout();
        throw new Error("Sesión expirada");
      }
      return res.json(); 
    },
    getNextPageParam: (lastPage) => lastPage.nextPage ?? undefined,
    initialPageParam: 0,
    enabled: !!user?.sessionId,
  });

  {/* Inicializar scroll infinito */}
  const allUsers = data?.pages.flatMap(page => page.users) || [];
  const observerRef = useCallback(node => {
    if (isFetchingNextPage) return;
    if (observer.current) observer.current.disconnect();

    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasNextPage) {
        fetchNextPage();
      }
    }, { rootMargin: '300px' });

    if (node) observer.current.observe(node);
  }, [isFetchingNextPage, hasNextPage, fetchNextPage]);
  
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirmDelete = async () => {
    if (confirmText !== "ELIMINAR" || isDeleting) return;
    setIsDeleting(true);
    
    try {
      const success = await deleteUser(userToDelete.id);
      if (success) {
        toast({ 
          title: "REGISTRO PURGADO", 
          description: `El expediente de ${userToDelete.nombre} ha sido borrado físicamente del sistema.` 
        });
        if (userInView?.id === userToDelete.id) setUserInView(null);
        setDeleteConfirmOpen(false);
        queryClient.invalidateQueries({ queryKey: ['users'] });
      }
    } catch (error) {
      console.error("Error en purga:", error);
      toast({ 
        variant: "destructive", 
        title: "ERROR DE PROTOCOLO", 
        description: error.message || "No se pudo conectar con el núcleo para ejecutar la purga." 
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaveUser = async (data) => {
  try {
    const res = await saveUser(data);
    if (userInView?.id === data.id) {
      setUserInView({ ...userInView, ...data });
    }
    toast({ title: "EXPEDIENTE ACTUALIZADO", description: "Los cambios se han sincronizado con el núcleo." });
    queryClient.invalidateQueries({ queryKey: ['users'] });
    return res;
  } catch (error) {
    toast({ variant: "destructive", title: "FALLO DE SINCRONIZACIÓN", description: error.message || "Error al guardar cambios." });
    throw error;
  }
};

  const rolStyles = {
    Administrador: { icon: <Shield />, color: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
    Consultor: { icon: <Briefcase />, color: 'bg-blue-500/10 text-blue-600 border-blue-500/30' },
    Cliente: { icon: <UserIcon />, color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' },
  };
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      
      {/* HEADER */}
      <header className="p-6 lg:px-0 lg:p-6 lg:pt-2 shrink-0">
        <div className="flex items-center justify-between max-w-[1600px] mx-auto">
          <div className="flex items-center gap-8">
            <Button variant="ghost" onClick={() => navigate('/admin')} className="text-slate-700 hover:bg-slate-100 h-14 w-14 bg-slate-50 border border-[#efe8dd] rounded-[1.5rem] transition-all">
              <ArrowLeft className="h-6 w-6" />
            </Button>
            <div className="hidden sm:block">
              <h1 className="text-4xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">Gestión Usuarios</h1>
              <p className="text-slate-400 text-[9px] uppercase tracking-[0.5em] font-black mt-2">Búnker de Control Operativo</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
          {/* BARRA DE BÚSQUEDA */}
          <div className="flex items-center relative">
            <motion.div
              animate={{ width: isSearchOpen ? '300px' : '48px' }}
              className="h-12 border rounded-2xl flex items-center overflow-hidden bg-slate-50 border-[#efe8dd] backdrop-blur-xl"
            >
              <button onClick={() => setIsSearchOpen(!isSearchOpen)} className="w-12 h-12 flex items-center justify-center shrink-0">
                {isSearchOpen ? <X className="h-4 w-4 text-blue-500" /> : <Search className="h-4 w-4 text-slate-500" />}
              </button>
              <input 
                ref={searchInputRef}
                type="text"
                placeholder="BUSCAR NOMBRE O RUT..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-transparent border-none text-slate-700 text-[10px] outline-none uppercase font-black pr-4 tracking-widest"
              />
            </motion.div>
          </div>
          <Button onClick={() => { setSelectedUser(null); setIsModalOpen(true); }} className="h-12 w-12 bg-emerald-600 hover:bg-emerald-500 rounded-2xl shrink-0 shadow-lg shadow-emerald-900/20 active:scale-95 transition-all">
            <UserPlus className="h-5 w-5" />
          </Button>
        </div>
        </div>
      </header>
      {/* --- ÁREA DE DOBLE COLUMNA --- */}
      {/* En teléfono las dos columnas no caben lado a lado: se apilan.
          `overflow-hidden` + fila fija dejaba la columna derecha fuera de la
          pantalla, sin manera de llegar a ella. Apiladas, la página entera
          hace scroll vertical, que es lo natural en un teléfono. */}
      <main className="flex-1 flex flex-col lg:flex-row lg:overflow-hidden max-w-[1600px] w-full lg:px-0 pb-10 gap-4 lg:gap-8">

        {/* COLUMNA IZQUIERDA */}
        <div className="w-full lg:max-w-[420px] flex flex-col gap-4 lg:overflow-y-auto custom-scrollbar lg:pr-2 flex-shrink-0">
          {initialLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-30">
              <Loader2 className="h-10 w-10 animate-spin" />
              <span className="text-[10px] font-black uppercase tracking-widest">Sincronizando...</span>
            </div>
          ) : (
            <>
              <AnimatePresence mode="popLayout">
                {allUsers.map((u) => (
                  <UserListCard 
                    key={u.id} 
                    u={u} 
                    isSelected={userInView?.id === u.id} 
                    onClick={() => setUserInView(u)} 
                    rolStyles={rolStyles}
                    searchTerm={searchTerm}
                  />
                ))}
              </AnimatePresence>

              {allUsers.length === 0 && (
                <motion.div 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 0.4 }} 
                  className="flex flex-col items-center justify-center py-20 text-center"
                >
                  <Search size={40} className="text-slate-400 mb-4" />
                  <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500 italic">
                    Sin registros para "{searchTerm}"
                  </p>
                </motion.div>
              )}

              {isFetchingNextPage && (
                <div className="flex flex-col items-center gap-2 py-6 opacity-50">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                  <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">
                    Cargando más expedientes...
                  </span>
                </div>
              )}
            </>
          )}
          
          <div ref={observerRef} className="h-10 shrink-0" />
        </div>

        {/* COLUMNA DERECHA */}
        <div className="hidden md:block flex-1 bg-white border border-[#efe8dd] rounded-[3rem] overflow-hidden relative shadow-inner">
           <UserInspector 
              u={userInView}
              allCompanies={companiesData}
              rolStyles={rolStyles}
              onEdit={(u) => { setSelectedUser(u); setIsModalOpen(true); }}
              onDelete={(u) => { setUserToDelete(u); setConfirmText(""); setDeleteConfirmOpen(true); }}
           />
        </div>
      </main>

      {/* MODALES */}
      {/* MODAL DE CONFIRMACIÓN DE ELIMINACIÓN */}
      <AnimatePresence>
        {deleteConfirmOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white border border-[#efe8dd] rounded-[3rem] p-10 max-w-sm w-full text-center shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-red-600" />
              <Trash2 className="h-16 w-16 text-red-600 mx-auto mb-6" />
              <h2 className="text-slate-900 font-black text-xl uppercase italic mb-2 tracking-tighter">¿Purgar Registro?</h2>
              <p className="text-slate-400 text-[10px] uppercase mb-8 tracking-[0.2em] font-bold">{userToDelete?.nombre}</p>
             
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                placeholder="ELIMINAR"
                className="w-full bg-slate-50 border border-[#efe8dd] rounded-2xl p-5 text-center text-slate-700 text-xs mb-8 outline-none focus:border-red-600 font-black tracking-[0.3em] transition-all"
              />
             
              <div className="flex gap-4">
                <Button variant="ghost" onClick={() => setDeleteConfirmOpen(false)} className="flex-1 text-slate-400 uppercase font-black text-[10px] tracking-widest h-14 rounded-2xl">Abortar</Button>
                <Button
                  onClick={handleConfirmDelete}
                  disabled={confirmText !== "ELIMINAR" || isDeleting}
                  className="flex-1 bg-red-600 hover:bg-red-500 text-white uppercase font-black text-[10px] tracking-widest h-14 rounded-2xl shadow-lg shadow-red-900/40"
                >
                  {isDeleting ? <Loader2 className="animate-spin" /> : 'Confirmar'}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
     
      {/* MODAL DE CREAR/EDITAR USUARIO */}
      <UserFormModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setSelectedUser(null); }}
        onSave={handleSaveUser}
        user={selectedUser}
        companies={companiesData || []}
      />
    </div>
  );
};

export default GestionUsuarios;