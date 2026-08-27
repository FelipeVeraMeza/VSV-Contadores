// =====================================================================
// FINALIZAR UNA TAREA · el aviso con vuelta atrás
// ---------------------------------------------------------------------
// POR QUÉ EXISTE
// El 27-08-2026 se finalizaron varias tareas por accidente: en la lista, en el
// árbol y en Inicio bastaba UN clic en el círculo de la izquierda —pegado al
// borde de una fila que además es clicable entera— para cerrarlas, sin
// preguntar y sin dejar rastro visible. La tarea se tachaba, salía del filtro
// «Activas» y desaparecía de la pantalla. Para recuperarla había que saber que
// existe el filtro «Finalizadas», ir, encontrarla y devolverla a mano.
//
// El arreglo tiene dos mitades:
//
//   1. QUE NO PASE. Un clic ya no finaliza nada: el círculo de las listas es un
//      indicador de estado y abre la tarea, y el estado se cambia adentro, con
//      los botones del detalle. Eso está en cada pantalla.
//   2. QUE SE PUEDA DESHACER, que es esto. Donde SÍ se finaliza —el detalle, el
//      tablero, el widget del CRM— el aviso trae un botón para devolver la tarea
//      al estado que tenía. Dura un minuto, que es lo que tarda uno en darse
//      cuenta de que cerró la que no era.
//
// Va en su propio archivo porque lo usan cuatro pantallas de dos módulos
// distintos, y porque un aviso que promete «Deshacer» y no deshace es peor que
// no ofrecerlo: conviene que haya UNA implementación.
// =====================================================================
import React from 'react';
import { toast } from '@/components/ui/use-toast';
import { ToastAction } from '@/components/ui/toast';

/**
 * Avisa que una tarea se finalizó y ofrece devolverla a como estaba.
 *
 * @param {string} titulo       el título de la tarea, para que el aviso diga cuál
 * @param {() => void} deshacer qué hacer si pulsan «Deshacer» (dejarla como estaba)
 */
export const avisarFinalizada = (titulo, deshacer) => toast({
    title: 'Tarea finalizada',
    description: titulo,
    action: deshacer
        ? <ToastAction altText="Deshacer" onClick={deshacer}
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50">
              Deshacer
          </ToastAction>
        : undefined,
});
