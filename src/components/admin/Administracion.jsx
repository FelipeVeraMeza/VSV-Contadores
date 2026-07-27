import React from 'react';
import { motion } from 'framer-motion';
import { Users as UsersIcon, ChevronRight, Shield, Building2, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

const Administracion = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div className="space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
        <div>
          <h1 className="text-4xl font-black text-slate-900 mb-2 flex items-center gap-3 tracking-tighter uppercase italic leading-none">
            Panel de Administración
          </h1>
          <p className="text-slate-500 text-[10px] uppercase tracking-[0.4em] font-bold">
            Configuración Global del Búnker VSV
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl">

        {/* GESTIÓN DE USUARIOS */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          whileHover={{
            y: -5,
            backgroundColor: "rgba(255, 255, 255, 0.08)",
            borderColor: "rgba(255, 255, 255, 0.2)",
            transition: { duration: 0.2 }
          }}
          onClick={() => navigate('/admin/usuarios')}
          className="relative group p-8 bg-slate-50 backdrop-blur-xl rounded-[2.5rem] border border-[#efe8dd] shadow-2xl overflow-hidden cursor-pointer transition-colors"
        >
          <div className="absolute -right-4 -top-4 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl group-hover:bg-blue-500/20 transition-colors" />
          
          <div className="flex flex-col gap-6 relative z-10">
            <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-900/40 group-hover:bg-blue-500 transition-colors">
              <UsersIcon className="h-7 w-7 text-white" />
            </div>
            
            <div>
              <h3 className="text-2xl font-black text-slate-900 uppercase italic tracking-tight">Gestión de Usuarios</h3>
              <p className="text-slate-400 text-xs mt-2 font-medium leading-relaxed">
                Administra perfiles, roles y accesos del equipo. Control total sobre el personal del búnker.
              </p>
            </div>

            <div className="flex items-center text-blue-600 text-[10px] font-black uppercase tracking-widest pt-2">
              Configurar usuarios 
              <ChevronRight className="h-4 w-4 ml-1 group-hover:translate-x-2 transition-transform" />
            </div>
          </div>
        </motion.div>

        {/* GESTIÓN DE EMPRESAS */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          whileHover={{ 
            y: -5,
            backgroundColor: "rgba(255, 255, 255, 0.08)",
            borderColor: "rgba(255, 255, 255, 0.2)",
            transition: { duration: 0.2 } 
          }}
          onClick={() => navigate('/admin/empresas')} 
          className="relative group p-8 bg-slate-50 backdrop-blur-xl rounded-[2.5rem] border border-[#efe8dd] shadow-2xl overflow-hidden cursor-pointer transition-colors"
        >
          <div className="absolute -right-4 -top-4 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl group-hover:bg-emerald-500/20 transition-colors" />
          
          <div className="flex flex-col gap-6 relative z-10">
            <div className="w-14 h-14 bg-emerald-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-900/40 group-hover:bg-emerald-500 transition-colors">
              <Building2 className="h-7 w-7 text-white" />
            </div>
            
            <div>
              <h3 className="text-2xl font-black text-slate-900 uppercase italic tracking-tight">Gestión de Empresas</h3>
              <p className="text-slate-400 text-xs mt-2 font-medium leading-relaxed">
                Configura razones sociales, sucursales y datos legales. Maestro de entidades corporativas.
              </p>
            </div>

            <div className="flex items-center text-emerald-600 text-[10px] font-black uppercase tracking-widest pt-2">
              Configurar empresas 
              <ChevronRight className="h-4 w-4 ml-1 group-hover:translate-x-2 transition-transform" />
            </div>
          </div>
        </motion.div>

        {/*Algunas ideas a futuro*/}
        {/*Configuraciones globales*/}
        {/*Logs*/}
      </div>
    </div>
  );
};

export default Administracion;