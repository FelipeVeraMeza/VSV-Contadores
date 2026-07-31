// =====================================================================
// ✅ TAREAS — módulo propio, al mismo nivel que CRM o Contabilidad
// ---------------------------------------------------------------------
// Antes vivía como una pestaña dentro del CRM (`/CRM?sub=tareas`), lo que
// obligaba a entrar al CRM para ver el trabajo del equipo. Pero las tareas no
// son "algo del CRM": cruzan todos los módulos —contabilidad, remuneraciones,
// facturación— y son la vista diaria de cada persona.
//
// El panel en sí (proyectos con avance, subtareas, comentarios, adjuntos,
// estados) ya estaba construido y se reutiliza tal cual: esto es un cambio de
// ubicación, no una reescritura.
// =====================================================================
import React from 'react';
import { motion } from 'framer-motion';
import TareasPanel from '@/components/crm/views/TareasPanel';

const Tareas = () => {
  return (
    <div className="h-full flex flex-col gap-6 relative">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 flex-shrink-0">
        <div>
          <h1 className="text-xl md:text-3xl font-black text-slate-900 uppercase tracking-tighter">Tareas</h1>
          <p className="text-slate-500 text-xs mt-1 font-bold tracking-widest uppercase">
            Proyectos, tareas y subtareas del equipo
          </p>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col bg-white backdrop-blur-xl rounded-3xl border border-[#efe8dd] shadow-2xl overflow-hidden">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="flex-1 min-h-0 p-4 md:p-6 flex flex-col"
        >
          <TareasPanel />
        </motion.div>
      </div>
    </div>
  );
};

export default Tareas;
