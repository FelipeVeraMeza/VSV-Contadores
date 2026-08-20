// ============================================================================
// ↩️ RESPONDER / REENVIAR un correo recibido
// ----------------------------------------------------------------------------
// Cierra el circuito. Sin esto, leer la bandeja quedaba a medias: uno veía la
// consulta del cliente y se tenía que ir a Gmail a contestarla, con lo que la
// respuesta no quedaba registrada en ninguna parte del sistema.
//
// AL RESPONDER, EL DESTINO NO SE PUEDE EDITAR. Va siempre a quien escribió, y
// se muestra para que se vea. Dejarlo editable es la forma más fácil de
// mandarle a un cliente lo que le contestaste a otro. Al REENVIAR sí se
// escribe, porque ahí justamente el punto es elegir a quién.
// ============================================================================
import React, { useState } from 'react';
import { X, Send, Loader2, CornerUpLeft, Forward } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import EditorRico from '@/components/comunicaciones/EditorRico';
import CuerpoCorreo from '@/components/comunicaciones/CuerpoCorreo';
import { responderRecibidoApi } from '@/services/correosService';

const getUser = () => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } };
const getSessionId = () => getUser().sessionId;

const inp = 'w-full bg-slate-50 border border-[#efe8dd] rounded-lg px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500';

const ResponderCorreo = ({ correo, modo = 'responder', onClose, onEnviado }) => {
    const reenviar = modo === 'reenviar';
    const [cuerpo, setCuerpo] = useState('');
    const [para, setPara] = useState('');
    const [enviando, setEnviando] = useState(false);

    const enviar = async () => {
        setEnviando(true);
        try {
            const r = await responderRecibidoApi(getSessionId(), correo.id, {
                cuerpo,
                reenviar,
                ...(reenviar ? { para } : {}),
            });
            const d = await r.json();
            if (!d.success) throw new Error(d.message);
            toast({ title: reenviar ? 'Correo reenviado' : 'Respuesta enviada', description: `A ${d.destino}` });
            onEnviado?.();
            onClose();
        } catch (e) {
            toast({ variant: 'destructive', title: 'No se pudo enviar', description: e.message, duration: 10000 });
        } finally { setEnviando(false); }
    };

    return (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
             onClick={onClose}>
            <div className="bg-white w-full max-w-2xl max-h-[88vh] rounded-2xl border border-[#efe8dd] shadow-2xl flex flex-col overflow-hidden"
                 onClick={(e) => e.stopPropagation()}>

                <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-[#efe8dd] bg-slate-50/60">
                    {reenviar ? <Forward size={14} className="text-emerald-600" />
                              : <CornerUpLeft size={14} className="text-emerald-600" />}
                    <p className="text-sm font-black text-slate-900">
                        {reenviar ? 'Reenviar' : 'Responder'}
                    </p>
                    <button onClick={onClose} className="ml-auto text-slate-400 hover:text-red-500"><X size={16} /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    <div>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Para</span>
                        {reenviar ? (
                            <input value={para} onChange={(e) => setPara(e.target.value)}
                                placeholder="destinatario@ejemplo.cl" className={`${inp} mt-1 font-mono`} />
                        ) : (
                            <div className="mt-1 bg-slate-50 border border-[#efe8dd] rounded-lg px-3 py-2 text-xs text-slate-600 font-mono">
                                {correo.deNombre ? `${correo.deNombre} <${correo.deCorreo}>` : correo.deCorreo}
                            </div>
                        )}
                    </div>

                    <div>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Asunto</span>
                        <div className="mt-1 bg-slate-50 border border-[#efe8dd] rounded-lg px-3 py-2 text-xs text-slate-600">
                            {(reenviar ? 'Rv: ' : 'Re: ')}{correo.asunto}
                        </div>
                    </div>

                    <div>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Tu mensaje</span>
                        <div className="mt-1">
                            <EditorRico value={cuerpo} onChange={setCuerpo} minAlto={180}
                                placeholder={reenviar ? 'Te reenvío esto…' : 'Escribe tu respuesta…'} />
                        </div>
                        <p className="text-[9px] text-slate-400 mt-1">
                            Tu firma se agrega sola, y debajo va citado el correo original.
                        </p>
                    </div>

                    {/* El original a la vista mientras se escribe: contestar sin
                        poder releer lo que preguntaron obliga a cerrar y abrir. */}
                    <details className="border border-[#efe8dd] rounded-xl">
                        <summary className="cursor-pointer text-[10px] font-black text-slate-500 uppercase tracking-widest px-3 py-2">
                            Ver el correo original
                        </summary>
                        <div className="px-3 pb-3 border-t border-[#efe8dd] pt-2">
                            <CuerpoCorreo texto={correo.cuerpoHtml || correo.cuerpoTexto}
                                className="text-[11px] text-slate-600 leading-relaxed" />
                        </div>
                    </details>
                </div>

                <div className="shrink-0 px-4 py-3 border-t border-[#efe8dd] flex gap-2">
                    <button onClick={enviar} disabled={enviando || (reenviar && !para.trim())}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg h-10 text-[10px] font-black uppercase tracking-widest inline-flex items-center justify-center gap-2">
                        {enviando ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                        {enviando ? 'Enviando…' : reenviar ? 'Reenviar' : 'Enviar respuesta'}
                    </button>
                    <button onClick={onClose}
                        className="px-4 rounded-lg border border-[#efe8dd] text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-900">
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ResponderCorreo;
