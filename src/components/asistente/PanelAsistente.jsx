// ============================================================================
// PANEL DEL ASISTENTE · VSV AI
// ----------------------------------------------------------------------------
// Va montado en MainPage, que es la ruta padre de todos los módulos y NO se
// desmonta al navegar. Esa es la razón de estar acá y no dentro de una pantalla:
// se puede preguntar algo, irse a Contabilidad y volver con la conversación
// intacta —el mismo motivo por el que LlamadaProvider vive ahí.
//
// POR QUÉ EMPUJA EN VEZ DE TAPAR
// En escritorio el panel corre el contenido hacia la izquierda en vez de
// superponerse. Consultar el asistente casi siempre es para contrastar con lo
// que hay en pantalla —«¿cuánto cobramos en agosto?» mirando el dashboard—, y un
// panel que tapa obliga a cerrarlo para comparar.
//
// En móvil no hay ancho para eso, así que ahí sí se superpone.
// ============================================================================
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, ArrowUp, Trash2, AlertCircle, PanelRightClose } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth.jsx';
import { preguntar, olvidarConversacion, estadoAsistente } from '@/services/asistenteService';

const ANCHO = 400;
const SUGERENCIAS = [
  '¿Quién me debe?',
  '¿Cuánto cobramos este mes?',
  '¿Qué tareas están vencidas?',
];

// Los montos vienen redactados por el modelo dentro del texto. Se resaltan para
// que la cifra se encuentre de un vistazo sin tener que leer el párrafo entero.
const RESALTAR_MONTOS = /(\$[\d.,]+)/g;

function Mensaje({ mensaje }) {
  const esUsuario = mensaje.rol === 'usuario';

  if (mensaje.error) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
        <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
        <p className="text-[13px] leading-relaxed text-red-700">{mensaje.texto}</p>
      </div>
    );
  }

  if (esUsuario) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[#199b4d] px-3.5 py-2 text-[13px] leading-relaxed text-white">
          {mensaje.texto}
        </div>
      </div>
    );
  }

  const partes = mensaje.texto.split(RESALTAR_MONTOS);
  return (
    <div className="space-y-1">
      <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-[#efe8dd] bg-white px-3.5 py-2.5 text-[13px] leading-relaxed text-slate-700">
        {partes.map((parte, i) =>
          RESALTAR_MONTOS.test(parte)
            ? <strong key={i} className="font-semibold tabular-nums text-slate-900">{parte}</strong>
            : <span key={i}>{parte}</span>
        )}
      </div>
      {mensaje.herramienta && (
        // Se muestra de dónde salió el dato. En un sistema que responde con
        // cifras del negocio, poder rastrear el origen es parte de la respuesta.
        <p className="pl-1 text-[10px] uppercase tracking-wider text-slate-400">
          {mensaje.herramienta.replace(/_/g, ' ')}
          {mensaje.ms ? ` · ${(mensaje.ms / 1000).toFixed(1)}s` : ''}
        </p>
      )}
    </div>
  );
}

function Escribiendo() {
  return (
    <div className="flex w-fit gap-1 rounded-2xl rounded-bl-md border border-[#efe8dd] bg-white px-3.5 py-3">
      {[0, 1, 2].map(i => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-slate-300"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}
    </div>
  );
}

export default function PanelAsistente({ abierto, onCerrar }) {
  const { user, selectedCompany } = useAuth();
  const [mensajes, setMensajes] = useState([]);
  const [borrador, setBorrador] = useState('');
  const [pensando, setPensando] = useState(false);
  const [estado, setEstado] = useState({ revisando: true });

  const disponible = estado.revisando || estado.disponible;

  const finRef = useRef(null);
  const entradaRef = useRef(null);
  const abortRef = useRef(null);
  // Un id por sesión de navegador: identifica el hilo en el servidor.
  const conversacionId = useRef(`web-${Date.now().toString(36)}`).current;

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes, pensando]);

  useEffect(() => {
    if (abierto) setTimeout(() => entradaRef.current?.focus(), 250);
  }, [abierto]);

  // Escape cierra, como cualquier panel. Se registra solo mientras está abierto
  // para no interferir con los modales del resto de la aplicación.
  useEffect(() => {
    if (!abierto) return;
    const alPulsar = (e) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [abierto, onCerrar]);

  // Si el panel se desmonta con una consulta en vuelo, se corta.
  useEffect(() => () => abortRef.current?.abort(), []);

  // Se consulta el estado al abrir, ANTES de dejar escribir. Sin esto el panel
  // acepta la pregunta, la manda, y recién ahí avisa que no está configurado:
  // el usuario escribe para nada y el error aparece donde va la respuesta, como
  // si hubiera fallado su consulta.
  useEffect(() => {
    if (!abierto) return;
    let vigente = true;
    setEstado({ revisando: true });
    estadoAsistente({ sessionId: user?.sessionId }).then(r => {
      if (vigente) setEstado({ revisando: false, ...r });
    });
    return () => { vigente = false; };
  }, [abierto, user?.sessionId]);

  const enviar = useCallback(async (texto) => {
    const pregunta = (texto ?? borrador).trim();
    if (!pregunta || pensando) return;

    setMensajes(m => [...m, { rol: 'usuario', texto: pregunta }]);
    setBorrador('');
    setPensando(true);

    abortRef.current = new AbortController();
    try {
      const r = await preguntar({
        mensaje: pregunta,
        conversacionId,
        sessionId: user?.sessionId,
        empresaId: selectedCompany?.id,
        signal: abortRef.current.signal,
      });
      setMensajes(m => [...m, {
        rol: 'asistente', texto: r.respuesta,
        herramienta: r.herramienta, ms: r.ms,
      }]);
    } catch (error) {
      setMensajes(m => [...m, { rol: 'asistente', texto: error.message, error: true }]);
    } finally {
      setPensando(false);
    }
  }, [borrador, pensando, conversacionId, user?.sessionId, selectedCompany?.id]);

  const limpiar = () => {
    setMensajes([]);
    olvidarConversacion({ conversacionId, sessionId: user?.sessionId });
  };

  const alTeclear = (e) => {
    // Enter envía, Shift+Enter salta de línea. Es lo que espera cualquiera que
    // haya usado un chat.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      enviar();
    }
  };

  return (
    <AnimatePresence>
      {abierto && (
        <>
          {/* Solo en móvil, donde el panel se superpone. */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onCerrar}
            className="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-[2px] lg:hidden"
          />

          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: ANCHO, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            className="fixed inset-y-0 right-0 z-50 flex h-full flex-col border-l border-[#efe8dd]
                       bg-[#faf9f7] shadow-xl lg:static lg:z-auto lg:shadow-none"
            style={{ maxWidth: '100vw' }}
          >
            {/* El contenido se fija al ancho final para que no se reacomode
                mientras el panel se abre. */}
            <div className="flex h-full flex-col" style={{ width: ANCHO, maxWidth: '100vw' }}>

              <header className="flex items-center justify-between border-b border-[#efe8dd] bg-white px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#199b4d]">
                    <Sparkles className="h-4 w-4 text-white" />
                  </div>
                  <div className="leading-tight">
                    <p className="text-[13px] font-semibold text-slate-800">VSV AI</p>
                    <p className="text-[10px] uppercase tracking-wider text-slate-400">Asistente interno</p>
                  </div>
                </div>
                <div className="flex items-center gap-0.5">
                  {mensajes.length > 0 && (
                    <button onClick={limpiar} title="Borrar conversación"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                  <button onClick={onCerrar} title="Cerrar"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600">
                    <PanelRightClose className="hidden h-4 w-4 lg:block" />
                    <X className="h-4 w-4 lg:hidden" />
                  </button>
                </div>
              </header>

              {/* Cuando el asistente no está disponible se avisa ACÁ, antes de
                  la caja de escritura y en tono informativo. Antes el aviso
                  aparecía como respuesta a la pregunta —o sea, después de
                  escribirla— y con aspecto de error del usuario. */}
              {!estado.revisando && !estado.disponible && (
                <div className="flex items-start gap-2 border-b border-amber-200/70 bg-amber-50 px-4 py-3">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <p className="text-[12px] leading-relaxed text-amber-800">
                    {estado.motivo === 'sin_configurar'
                      ? 'El asistente todavía no está habilitado en este ambiente.'
                      : estado.motivo === 'modelo_caido'
                        ? 'El asistente está conectado pero el modelo no responde. Vuelve a intentar en un rato.'
                        : 'No se pudo conectar con el asistente. Vuelve a intentar en un rato.'}
                    {' '}Puedes seguir usando el resto de VSV PRO con normalidad.
                  </p>
                </div>
              )}

              {/* El contenido se ancla abajo con `mt-auto` en el envoltorio, no
                  con `justify-end` en el contenedor: justify-end sobre un área
                  con scroll corta los mensajes de arriba y no deja subir. Así el
                  hueco queda arriba cuando hay poco, y hay scroll normal cuando
                  la conversación crece. */}
              <div className="custom-scrollbar flex flex-1 flex-col overflow-y-auto p-4">
                <div className="mt-auto space-y-3">
                {mensajes.length === 0 && !pensando && (
                  <div>
                    <p className="text-[13px] leading-relaxed text-slate-500">
                      Pregunta por deudas, cobros, facturación, tareas o cartera.
                      Respondo con los datos que <span className="text-slate-700">tú</span> puedes ver.
                    </p>
                    <div className="mt-5 space-y-1.5">
                      {SUGERENCIAS.map(s => (
                        <button key={s} onClick={() => enviar(s)} disabled={!disponible}
                          className="block w-full rounded-lg border border-[#efe8dd] bg-white px-3 py-2 text-left text-[13px]
                                     text-slate-600 transition-colors hover:border-[#199b4d]/40 hover:text-slate-900
                                     disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[#efe8dd]">
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {mensajes.map((m, i) => <Mensaje key={i} mensaje={m} />)}
                {pensando && <Escribiendo />}
                <div ref={finRef} />
                </div>
              </div>

              <div className="border-t border-[#efe8dd] bg-white p-3">
                <div className="flex items-end gap-2 rounded-xl border border-[#efe8dd] bg-[#faf9f7] px-3 py-2
                                focus-within:border-[#199b4d]/50 focus-within:bg-white transition-colors">
                  <textarea
                    ref={entradaRef}
                    rows={1}
                    value={borrador}
                    onChange={(e) => {
                      setBorrador(e.target.value);
                      // Crece con el texto hasta un tope; sin esto una pregunta
                      // larga se lee por una rendija de una línea.
                      e.target.style.height = 'auto';
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                    }}
                    onKeyDown={alTeclear}
                    placeholder={disponible ? 'Pregunta algo…' : 'No disponible por ahora'}
                    disabled={pensando || !disponible}
                    className="max-h-[120px] flex-1 resize-none bg-transparent text-[13px] leading-relaxed
                               text-slate-700 placeholder:text-slate-400 focus:outline-none disabled:opacity-50"
                  />
                  <button
                    onClick={() => enviar()}
                    disabled={!borrador.trim() || pensando || !disponible}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#199b4d] text-white
                               transition-opacity disabled:opacity-25"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-1.5 px-1 text-[10px] text-slate-400">
                  Solo consulta. No modifica nada.
                </p>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
