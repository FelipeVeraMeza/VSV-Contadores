// =====================================================================
// 📣 COMUNICACIONES — módulo propio, al mismo nivel que CRM o Contabilidad
// ---------------------------------------------------------------------
// Antes esto estaba repartido en dos módulos distintos: Correo y WhatsApp
// colgaban del CRM (`/CRM?sub=correo`), y el Correo Masivo del facturador
// colgaba de Facturación (`/facturacion?sub=correos`). Para responderse
// «¿qué le mandamos a este cliente?» había que acordarse de en cuál de los
// dos mirar.
//
// Hablarle al cliente no es «algo del CRM» ni «algo del facturador»: es su
// propio trabajo, con sus plantillas y su registro. Por eso va acá.
//
// CINCO SECCIONES (`?sub=`), igual que Tareas o Facturación:
//
//   correo      · redactar y enviar a un conjunto de clientes
//   whatsapp    · la conversación por WhatsApp
//   plantillas  · los textos guardados, sin tener que entrar a redactar
//   historial   · qué salió, a quién y qué decía        (RF-CO-30)
//   masivo      · facturas y recordatorios de pago — SOLO Administradores
//
// PERMISOS: se reusa la bandera del CRM (`puedeVerCrm`). El backend exige
// `requireModulo('crm')` en /api/correos, así que esconder esto con otra
// bandera dejaría a alguien viendo el menú y comiéndose un 403 al entrar.
// El día que Comunicaciones tenga su propia bandera, se cambia en los dos
// lados a la vez.
// =====================================================================
import React from 'react';
import { motion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth.jsx';
import ClienteCorreo from '@/components/comunicaciones/ClienteCorreo';
import WhatsappPanel from '@/components/crm/views/WhatsappPanel';
import PlantillasCorreo from '@/components/comunicaciones/PlantillasCorreo';
import CorreoMasivo from '@/components/facturacion/tabs/CorreoMasivo';

const SECCIONES = {
  correo:     { titulo: 'Correo',        bajada: 'Lo que llega, lo que sale y lo que le contestas a cada cliente' },
  whatsapp:   { titulo: 'WhatsApp',      bajada: 'La conversación por WhatsApp con los clientes' },
  plantillas: { titulo: 'Plantillas',    bajada: 'Los textos guardados, tuyos y los que el equipo compartió' },
  masivo:     { titulo: 'Correo Masivo', bajada: 'Facturas enviadas y recordatorios de pago' },
};

// Segundo candado de «Correo Masivo»: el menú ya la esconde, pero la URL se
// sigue escribiendo a mano. El tercero —el que importa— está en el backend.
const SinPermiso = () => (
  <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
    <ShieldAlert className="text-amber-500" size={34} />
    <p className="text-sm font-black text-slate-600 uppercase tracking-widest">Sección reservada</p>
    <p className="text-xs text-slate-400 max-w-sm">
      El correo masivo va a los clientes de toda la firma y se apoya en los documentos del
      facturador, así que pide ser administrador y tener Facturación habilitada.
      En <b>Correo</b> puedes escribirle a los clientes que tú elijas.
    </p>
  </div>
);

const Comunicaciones = () => {
  const { user } = useAuth();
  // El correo masivo se mudó de módulo pero sus datos no: sigue leyendo
  // /api/dte y /api/cobros, que exigen el módulo `facturacion`. Por eso pide
  // las dos cosas —ser Administrador y tener Facturación— y no solo el rol:
  // si no, la pantalla se abre y cada consulta responde 403.
  const esAdmin = user?.rol === 'Administrador';
  const puedeVerFacturacion = user?.modulos?.puedeVerFacturacion !== false;
  const puedeMasivo = esAdmin && puedeVerFacturacion;
  const [searchParams] = useSearchParams();

  const pedida = searchParams.get('sub') || 'correo';
  const sub = SECCIONES[pedida] ? pedida : 'correo';
  const meta = SECCIONES[sub];

  const renderSub = () => {
    switch (sub) {
      case 'whatsapp':   return <WhatsappPanel />;
      case 'plantillas': return <PlantillasCorreo />;
      // Viene de Facturación, donde se dibujaba dentro de una tarjeta blanca.
      // Se la conserva para que la pantalla se vea igual que antes de mudarse.
      case 'masivo':
        return puedeMasivo ? (
          <div className="h-full min-h-0 bg-white border border-[#efe8dd] rounded-2xl p-4 md:p-5 overflow-hidden">
            <CorreoMasivo />
          </div>
        ) : <SinPermiso />;
      // El cliente de correo completo: carpetas, bandeja, enviados y redactar.
      default: return <ClienteCorreo />;
    }
  };

  return (
    <div className="h-full flex flex-col gap-3 lg:gap-5 relative">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 flex-shrink-0">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-[#1a1c1e] uppercase tracking-tighter">{meta.titulo}</h1>
          <p className="text-slate-500 text-xs mt-1 font-bold tracking-widest uppercase">{meta.bajada}</p>
        </div>
      </div>

      {/* Cada panel trae su propio marco (tarjetas, bordes), igual que en el
          CRM: no se envuelve en otra tarjeta blanca o quedarían dos marcos. */}
      <motion.div
        key={sub}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="flex-1 min-h-0 flex flex-col"
      >
        {renderSub()}
      </motion.div>
    </div>
  );
};

export default Comunicaciones;
