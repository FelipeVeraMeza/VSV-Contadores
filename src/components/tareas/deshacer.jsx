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

/**
 * Avisa que una SUBTAREA volvió a estar activa, y dice dónde quedó.
 *
 * POR QUÉ EXISTE
 * Reabrir una subtarea finalizada la hacía desaparecer de la pantalla. El
 * camino es este: las subtareas no salen sueltas en la lista —las esconde
 * `soloRaiz`, porque se ven dentro de su madre—, así que la ÚNICA lista que las
 * muestra por su cuenta es «Finalizadas». Al marcarla como activa deja de
 * calzar con ese filtro, sale de ahí, y en la lista normal tampoco aparece.
 * Queda viva pero sin ningún lugar donde encontrarla, salvo que uno sepa que
 * existe el interruptor «Con subtareas» o entre por el árbol.
 *
 * El interruptor ya estaba; lo que faltaba era que alguien lo dijera. Un aviso
 * que explica dónde quedó la tarea cuesta menos que descubrirlo buscándola, y
 * el botón lleva directo a la lista que sí la muestra.
 *
 * @param {string} titulo   el título de la subtarea
 * @param {() => void} verla  qué hacer para mostrarla (encender «Con subtareas»)
 */
export const avisarSubtareaReabierta = (titulo, verla) => toast({
    title: 'Subtarea reabierta',
    description: `«${titulo}» volvió a estar activa. Se ve dentro de su tarea madre, o en la lista con «Con subtareas» encendido.`,
    action: verla
        ? <ToastAction altText="Mostrarla en la lista" onClick={verla}
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50">
              Mostrarla
          </ToastAction>
        : undefined,
});
