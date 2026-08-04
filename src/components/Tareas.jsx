// =====================================================================
// ✅ TAREAS — módulo propio, al mismo nivel que CRM o Contabilidad
// ---------------------------------------------------------------------
// Antes vivía como una pestaña dentro del CRM (`/CRM?sub=tareas`), lo que
// obligaba a entrar al CRM para ver el trabajo del equipo. Pero las tareas no
// son "algo del CRM": cruzan todos los módulos —contabilidad, remuneraciones,
// facturación— y son la vista diaria de cada persona.
//
// CINCO SECCIONES (`?sub=`), igual que Contabilidad o Facturación:
//
//   inicio     · el resumen del día                        (fase 4)
//   proyectos  · administrar proyectos                     (fase 3)
//   todas      · todas las tareas en las que participo
//   mias       · solo lo asignado a mí
//   equipo     · toda la organización — SOLO Administradores
//
// Las tres últimas son el mismo panel con un alcance distinto: la sección ya
// decide qué se ve, así que el panel no vuelve a preguntarlo.
// =====================================================================
import React from 'react';
import { motion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth.jsx';
import TareasPanel from '@/components/crm/views/TareasPanel';
import ProyectosPanel from '@/components/tareas/ProyectosPanel';
import InicioPanel from '@/components/tareas/InicioPanel';

const SECCIONES = {
  inicio:    { titulo: 'Inicio',     bajada: 'Tu resumen del día: lo que vence, lo que va atrasado y lo que cerraste' },
  proyectos: { titulo: 'Proyectos',  bajada: 'Los proyectos de la organización, su avance y quién responde por cada uno' },
  todas:     { titulo: 'Tareas',     bajada: 'Todas las tareas en las que participas' },
  mias:      { titulo: 'Mis tareas', bajada: 'Solo lo que tienes asignado o donde colaboras' },
  equipo:    { titulo: 'Equipo',     bajada: 'Todas las tareas de la organización' },
};

// Segundo candado de "Equipo": el menú ya la esconde, pero la URL sigue
// escribiéndose a mano. El tercero —el que importa— está en el backend.
const SinPermiso = () => (
  <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
    <ShieldAlert className="text-amber-500" size={34} />
    <p className="text-sm font-black text-slate-600 uppercase tracking-widest">Sección reservada</p>
    <p className="text-xs text-slate-400 max-w-sm">
      La vista de equipo es solo para administradores. En <b>Mis tareas</b> tienes todo lo tuyo.
    </p>
  </div>
);

const Tareas = () => {
  const { user } = useAuth();
  const esAdmin = user?.rol === 'Administrador';
  const [searchParams] = useSearchParams();

  const pedida = searchParams.get('sub') || 'todas';
  const sub = SECCIONES[pedida] ? pedida : 'todas';
  const meta = SECCIONES[sub];

  const renderSub = () => {
    switch (sub) {
      case 'inicio':    return <InicioPanel modo="todas" />;
      case 'proyectos': return <ProyectosPanel />;
      case 'equipo':    return esAdmin ? <TareasPanel modo="equipo" /> : <SinPermiso />;
      case 'mias':      return <TareasPanel modo="mias" />;
      default:          return <TareasPanel modo="todas" />;
    }
  };

  return (
    <div className="h-full flex flex-col gap-6 relative">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 flex-shrink-0">
        <div>
          <h1 className="text-xl md:text-3xl font-black text-slate-900 uppercase tracking-tighter">{meta.titulo}</h1>
          <p className="text-slate-500 text-xs mt-1 font-bold tracking-widest uppercase">{meta.bajada}</p>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col bg-white backdrop-blur-xl rounded-3xl border border-[#efe8dd] shadow-2xl overflow-hidden">
        <motion.div
          key={sub}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="flex-1 min-h-0 p-4 md:p-6 flex flex-col"
        >
          {renderSub()}
        </motion.div>
      </div>
    </div>
  );
};

export default Tareas;
