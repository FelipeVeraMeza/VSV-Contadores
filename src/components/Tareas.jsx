// =====================================================================
// 🎫 TICKETS — módulo propio, al mismo nivel que CRM o Contabilidad
// ---------------------------------------------------------------------
// Antes vivía como una pestaña dentro del CRM (`/CRM?sub=tareas`), lo que
// obligaba a entrar al CRM para ver el trabajo del equipo. Pero el trabajo no
// es "algo del CRM": cruza todos los módulos —contabilidad, remuneraciones,
// facturación— y es la vista diaria de cada persona.
//
// EL MÓDULO SE LLAMA TICKETS Y ADENTRO VAN LAS TAREAS. Un ticket es el pedido
// que entra; las tareas son lo que hay que hacer para cerrarlo. Es un cambio de
// vocabulario, no de modelo: la ruta sigue siendo `/tareas` y la tabla sigue
// siendo `tarea`, porque las notificaciones ya emitidas y los enlaces del CRM
// apuntan ahí. Renombrar la URL rompería avisos viejos sin que nadie gane nada.
//
// CINCO SECCIONES (`?sub=`), igual que Contabilidad o Facturación:
//
//   inicio     · el resumen del día                        (fase 4)
//   proyectos  · administrar proyectos                     (fase 3)
//   todas      · todas las tareas en las que participo
//   mias       · solo lo asignado a mí
//   equipo     · toda la organización — SOLO Administradores
//
// REUNIONES YA NO ESTÁ ACÁ. Estuvo, con el argumento de que una reunión es
// trabajo que entra igual que un ticket. Se mudó a Comunicaciones el 27-08-2026
// (decisión de Felipe): hablar con alguien es hablar con alguien, sea por
// correo, por WhatsApp o por video, y ahí es donde se busca. Ahora vive en
// `/comunicaciones?sub=reuniones`.
//
// Las tres últimas son el mismo panel con un alcance distinto: la sección ya
// decide qué se ve, así que el panel no vuelve a preguntarlo.
// =====================================================================
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { ShieldAlert, Ticket, FileSpreadsheet } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth.jsx';
import TareasPanel from '@/components/crm/views/TareasPanel';
import ProyectosPanel from '@/components/tareas/ProyectosPanel';
import InicioPanel from '@/components/tareas/InicioPanel';
import ImportarTareasModal from '@/components/tareas/ImportarTareasModal';

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
  const [importando, setImportando] = useState(false);
  // Cada panel se trae sus propias tareas al montarse. Subir el contador cambia
  // la `key` del panel, que lo remonta y lo hace releer: si no, se importan
  // treinta tareas y la lista de atrás sigue mostrando las de antes.
  const [recarga, setRecarga] = useState(0);

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
    <div className="h-full flex flex-col gap-3 relative">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 flex-shrink-0">
        {/* UNA LÍNEA, NO TRES.
            Antes eran tres renglones —«TICKETS», el título en mayúsculas
            enormes, y la bajada también en mayúsculas— que juntos se comían
            unos 90 px de alto en TODAS las pantallas del módulo, todos los
            días, para decir algo que el menú lateral ya dice y que se lee una
            sola vez. Ahora es una línea, y la bajada pasa a `title`: sigue
            estando para quien la necesite, sin ocupar sitio.
            El módulo se sigue nombrando —el menú dice «Tickets» y la pantalla
            debe reconocerse— pero al lado del título, no encima. */}
        <div className="flex items-baseline gap-2.5 min-w-0" title={meta.bajada}>
          <h1 className="text-lg md:text-xl font-black text-slate-900 tracking-tight truncate">{meta.titulo}</h1>
          <span className="hidden sm:flex items-center gap-1 text-[10px] font-semibold text-violet-600 shrink-0">
            <Ticket size={11} /> Tickets
          </span>
        </div>

        {/* SOLO EN «TAREAS».
            Estaba en el encabezado del módulo, así que aparecía también en
            Inicio —que es un resumen del día, no un lugar donde se carga
            nada— y en Proyectos, donde importar TAREAS no significa nada y se
            leía como si fuera a importar proyectos. Un botón que no
            corresponde a la pantalla obliga a preguntarse qué hace ahí. */}
        {sub === 'todas' && (
          <button
            onClick={() => setImportando(true)}
            className="flex items-center gap-2 bg-white border border-[#efe8dd] hover:border-violet-400 hover:text-violet-700 text-slate-600 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors shrink-0"
          >
            <FileSpreadsheet size={14} /> Importar Excel
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 flex flex-col bg-white backdrop-blur-xl rounded-3xl border border-[#efe8dd] shadow-2xl overflow-hidden">
        <motion.div
          key={`${sub}-${recarga}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="flex-1 min-h-0 p-4 md:p-6 flex flex-col"
        >
          {renderSub()}
        </motion.div>
      </div>

      {importando && (
        <ImportarTareasModal
          onClose={() => setImportando(false)}
          onImportado={() => setRecarga(n => n + 1)}
        />
      )}
    </div>
  );
};

export default Tareas;
