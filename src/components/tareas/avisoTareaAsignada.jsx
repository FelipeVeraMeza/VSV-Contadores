// =====================================================================
// EL POP-UP DE «TE ASIGNARON UNA TAREA»
// ---------------------------------------------------------------------
// POR QUÉ EXISTE
// Estaba en el pedido original del módulo —un aviso emergente al recibir una
// tarea, «con su urgencia»— y nunca se hizo (docs/tareas-requerimientos.md
// §10.5, punto 2). Lo que sí se hizo fue la campana y el sonido, y con eso
// alcanzaba mientras uno estuviera mirando el encabezado. El problema es que
// el número rojo de la campana mide 16 píxeles en una esquina: si estás
// escribiendo un correo o cuadrando una conciliación, no lo ves.
//
// Y sobre todo: la campana no distingue. Una tarea crítica y una de prioridad
// baja encienden el mismo punto rojo del mismo tamaño. La urgencia era la
// mitad del pedido y era justo la mitad que faltaba.
//
// QUÉ HACE
// Un aviso que se explica solo: quién te la pasó, cómo se llama, qué tan
// urgente es —dicho con color Y con palabra, porque el color solo no se lee
// si uno no sabe qué significa cada uno— y un botón para abrirla.
//
// CUÁNTO DURA
// Según la urgencia. Una crítica se queda hasta que la cierres: si te asignan
// algo crítico mientras estás en otra pestaña, un aviso de cinco segundos que
// ya se fue es lo mismo que no haberlo mandado. Una baja se va sola.
//
// LO QUE NO HACE
// No pide permisos del navegador ni manda notificaciones del sistema
// operativo. Eso es otra cosa —y hay que pedirle permiso al usuario— así que
// queda para cuando se decida; esto funciona dentro de la pestaña, que es
// donde la persona ya está.
// =====================================================================
import React from 'react';
import { toast } from '@/components/ui/use-toast';
import { ToastAction } from '@/components/ui/toast';

// La urgencia, dicha de tres formas a la vez: color de borde, etiqueta y
// cuánto se queda en pantalla. Los colores son los mismos del resto del módulo
// (ver `estilos.js`), para que una tarea crítica se vea igual acá que en la
// lista, en el tablero y en el árbol.
const URGENCIA = {
    critica: {
        etiqueta: 'Crítica',
        clase: 'border-red-500 border-l-4 bg-red-50',
        texto: 'text-red-700',
        // Sin cierre automático: lo crítico no se descarta solo.
        duracion: Infinity,
    },
    alta: {
        etiqueta: 'Alta',
        clase: 'border-orange-400 border-l-4 bg-orange-50',
        texto: 'text-orange-700',
        duracion: 30000,
    },
    media: {
        etiqueta: 'Media',
        clase: 'border-amber-300 border-l-4 bg-amber-50',
        texto: 'text-amber-700',
        duracion: 15000,
    },
    baja: {
        etiqueta: 'Baja',
        clase: 'border-slate-300 border-l-4 bg-white',
        texto: 'text-slate-600',
        duracion: 10000,
    },
};

// Un aviso sin prioridad —los que ya estaban en la base antes de la migración,
// y los que no son de una tarea— se dibuja como uno de prioridad media, que es
// el valor por omisión de una tarea. Nunca se cae por un dato que falta.
const POR_OMISION = URGENCIA.media;

/**
 * Muestra el pop-up de una tarea recién asignada.
 *
 * @param {object} aviso   el aviso tal como llega del canal en vivo
 * @param {(id: string) => void} abrir  qué hacer al pulsar «Ver la tarea»
 */
export const avisarTareaAsignada = (aviso, abrir) => {
    const u = URGENCIA[aviso?.prioridad] || POR_OMISION;

    toast({
        duration: u.duracion,
        className: u.clase,
        title: (
            <span className="flex items-center gap-2">
                <span className="text-sm">📋</span>
                <span className="text-[13px] font-bold text-slate-900">Nueva tarea para ti</span>
                {/* La urgencia también con palabra: el color solo obliga a
                    saberse el código, y nadie se lo sabe el primer día. */}
                <span className={`text-[9px] font-black uppercase tracking-widest ${u.texto}`}>
                    {u.etiqueta}
                </span>
            </span>
        ),
        description: (
            <span className="block">
                {/* El título de la tarea es lo único que se lee de verdad, así
                    que va primero y con el peso visual. */}
                <span className="block text-[12px] font-semibold text-slate-800 leading-snug">
                    {aviso?.titulo || 'Tarea asignada'}
                </span>
                {aviso?.descripcion && (
                    <span className="block text-[10px] text-slate-500 mt-0.5">{aviso.descripcion}</span>
                )}
            </span>
        ),
        action: aviso?.entidadId && abrir
            ? <ToastAction altText="Ver la tarea" onClick={() => abrir(aviso.entidadId)}
                  className="border-slate-300 text-slate-700 hover:bg-white">
                  Ver
              </ToastAction>
            : undefined,
    });
};
