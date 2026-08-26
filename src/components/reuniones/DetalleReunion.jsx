// =====================================================================
// PANEL DE UNA REUNIÓN · todo lo que se le puede hacer, en un solo lugar
// ---------------------------------------------------------------------
// Antes la lista solo dejaba entrar y cancelar. Todo lo demás —sumar a alguien,
// sacar a alguien, mandarle el enlace a un cliente, corregir lo que se acordó,
// limpiar una sala de prueba— no existía o había que hacerlo en la base.
//
// Se abre desde la fila. Muestra tres cosas y en este orden, que es el orden en
// que se necesitan:
//
//   1. QUIÉNES  · a quién se invitó, quién entró y a qué hora. Se agrega y se
//                 saca gente acá mismo, también con la reunión en curso.
//   2. ENLACE   · para mandárselo a alguien de fuera. Es la única forma que hay
//                 hoy de meter a un cliente, así que se dice claro lo que
//                 implica en vez de esconderlo.
//   3. LO ACORDADO · la nota, editable. Al colgar se escribe apurado y con el
//                 otro despidiéndose; si no se puede corregir, nadie la llena.
//
// Y abajo lo que no tiene vuelta atrás, separado del resto a propósito.
// =====================================================================
import React, { useState } from 'react';
import {
    X, Users, Link2, Copy, Check, Trash2, Loader2, UserPlus, Video,
    CalendarX2, Building2, Clock, StickyNote, ShieldAlert,
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import {
    agregarParticipanteApi, quitarParticipanteApi,
    editarNotasApi, eliminarReunionApi, cancelarReunionApi,
} from '@/services/reunionesService';

const getUser = () => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } };
const getSessionId = () => getUser().sessionId;

const hora = (d) => d ? new Date(d).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : null;

const DetalleReunion = ({ reunion, usuarios, onCerrar, onCambio, onEntrar }) => {
    const yo = getUser().id;
    const soyQuienConvoco = reunion.creadoPor === yo;
    const viva = reunion.estado === 'agendada' || reunion.estado === 'en_curso';

    const [r, setR] = useState(reunion);
    const [notas, setNotas] = useState(reunion.notas || '');
    const [guardando, setGuardando] = useState(false);
    const [copiado, setCopiado] = useState(false);
    const [ocupado, setOcupado] = useState(null);   // id del usuario que se está agregando/quitando

    const refrescar = (nueva) => { if (nueva) setR(nueva); onCambio?.(); };

    // Copiar al portapapeles. `navigator.clipboard` solo existe en HTTPS o en
    // localhost; en cualquier otro caso hay que caer al truco viejo del textarea
    // o el botón no hace nada y nadie sabe por qué.
    const copiarEnlace = async () => {
        const texto = r.enlace || '';
        try {
            if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(texto);
            else {
                const t = document.createElement('textarea');
                t.value = texto; t.style.position = 'fixed'; t.style.opacity = '0';
                document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
            }
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
        } catch {
            toast({ variant: 'destructive', title: 'No se pudo copiar', description: texto });
        }
    };

    const invitar = async (usuarioId) => {
        setOcupado(usuarioId);
        try {
            const res = await agregarParticipanteApi(getSessionId(), r.id, usuarioId);
            const d = await res.json(); if (!d.success) throw new Error(d.message);
            refrescar(d.reunion);
            toast({ title: 'Invitado', description: 'Le llegó el aviso por la campana.' });
        } catch (e) { toast({ variant: 'destructive', title: 'No se pudo invitar', description: e.message }); }
        finally { setOcupado(null); }
    };

    const quitar = async (usuarioId, nombre) => {
        setOcupado(usuarioId);
        try {
            const res = await quitarParticipanteApi(getSessionId(), r.id, usuarioId);
            const d = await res.json(); if (!d.success) throw new Error(d.message);
            refrescar(d.reunion);
            toast({ title: `${nombre} ya no está invitado` });
        } catch (e) { toast({ variant: 'destructive', title: 'No se pudo quitar', description: e.message }); }
        finally { setOcupado(null); }
    };

    const guardarNotas = async () => {
        setGuardando(true);
        try {
            const res = await editarNotasApi(getSessionId(), r.id, notas);
            const d = await res.json(); if (!d.success) throw new Error(d.message);
            refrescar(d.reunion);
            toast({ title: 'Nota guardada' });
        } catch (e) { toast({ variant: 'destructive', title: 'No se pudo guardar', description: e.message }); }
        finally { setGuardando(false); }
    };

    const cancelar = async () => {
        if (!window.confirm(`¿Cancelar «${r.titulo}»?\n\nSe avisa a los invitados y queda en el historial como cancelada.`)) return;
        try {
            await cancelarReunionApi(getSessionId(), r.id);
            toast({ title: 'Reunión cancelada' });
            onCambio?.(); onCerrar();
        } catch { toast({ variant: 'destructive', title: 'No se pudo cancelar' }); }
    };

    const eliminar = async () => {
        if (!window.confirm(
            `¿Borrar «${r.titulo}» del historial?\n\nEsto NO se puede deshacer: se van también la asistencia y la nota de lo acordado.`
        )) return;
        try {
            const res = await eliminarReunionApi(getSessionId(), r.id);
            const d = await res.json(); if (!d.success) throw new Error(d.message);
            toast({ title: 'Borrada del historial' });
            onCambio?.(); onCerrar();
        } catch (e) { toast({ variant: 'destructive', title: 'No se pudo borrar', description: e.message }); }
    };

    const invitados = r.participantes || [];
    const yaInvitado = new Set(invitados.map(p => p.id));
    const porInvitar = (usuarios || []).filter(u => !yaInvitado.has(u.id));

    return (
        <div className="fixed inset-0 z-[130] bg-black/50 flex items-center justify-center p-4" onClick={onCerrar}>
            <div className="w-full max-w-lg bg-white rounded-2xl border border-[#efe8dd] shadow-2xl max-h-[90vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}>

                {/* Encabezado */}
                <div className="flex items-start gap-2 px-5 pt-5 pb-3 shrink-0">
                    <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-black text-slate-900 truncate">{r.titulo}</h3>
                        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-slate-500 flex-wrap">
                            {r.personaNombre && <span className="flex items-center gap-1 truncate"><Building2 size={11} /> {r.personaNombre}</span>}
                            {r.iniciadaAt && <span className="flex items-center gap-1"><Clock size={11} /> empezó {hora(r.iniciadaAt)}</span>}
                            {r.terminadaAt && <span className="flex items-center gap-1">· terminó {hora(r.terminadaAt)}</span>}
                        </div>
                    </div>
                    {viva && (
                        <button onClick={() => onEntrar(r)}
                            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-3 py-1.5 text-[11px] font-black uppercase tracking-widest shrink-0">
                            <Video size={13} /> Entrar
                        </button>
                    )}
                    <button onClick={onCerrar} className="text-slate-400 hover:text-red-500 shrink-0 pt-1"><X size={18} /></button>
                </div>

                <div className="px-5 pb-1 flex-1 min-h-0 overflow-y-auto space-y-5">

                    {/* ── 1 · QUIÉNES ─────────────────────────────────────── */}
                    <section>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                            <Users size={11} /> Invitados · {invitados.length}
                        </p>
                        <div className="border border-[#efe8dd] rounded-xl overflow-hidden">
                            {invitados.map(p => {
                                const entro = !!p.entroAt;
                                const esElDueno = p.id === r.creadoPor;
                                return (
                                    <div key={p.id} className="flex items-center gap-2 px-3 py-2 border-b border-[#efe8dd] last:border-0">
                                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${entro ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                            title={entro ? 'Estuvo en la reunión' : 'No ha entrado'} />
                                        <span className="text-xs text-slate-700 flex-1 truncate">{p.nombre}</span>
                                        {esElDueno && <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">convocó</span>}
                                        {entro && <span className="text-[10px] text-slate-400 tabular-nums">{hora(p.entroAt)}</span>}
                                        {/* Sacar solo lo puede quien convocó, y solo a quien
                                            todavía no ha entrado: la asistencia es un hecho
                                            registrado, no una invitación que se deshaga. */}
                                        {soyQuienConvoco && !esElDueno && !entro && (
                                            ocupado === p.id
                                                ? <Loader2 size={13} className="animate-spin text-slate-400" />
                                                : <button onClick={() => quitar(p.id, p.nombre)} title="Quitar de la reunión"
                                                    className="text-slate-300 hover:text-red-500"><X size={13} /></button>
                                        )}
                                    </div>
                                );
                            })}
                            {invitados.length === 0 && (
                                <p className="px-3 py-3 text-[11px] text-slate-400 italic">Nadie invitado todavía.</p>
                            )}
                        </div>

                        {porInvitar.length > 0 && (
                            <>
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-3 mb-1.5 flex items-center gap-1.5">
                                    <UserPlus size={11} /> Sumar a la reunión
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {porInvitar.map(u => (
                                        <button key={u.id} onClick={() => invitar(u.id)} disabled={ocupado === u.id}
                                            className="flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-lg border border-[#efe8dd] bg-slate-50 text-slate-600 hover:border-emerald-400 hover:text-emerald-700 transition-colors">
                                            {ocupado === u.id ? <Loader2 size={11} className="animate-spin" /> : <UserPlus size={11} />}
                                            {u.nombre}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </section>

                    {/* ── 2 · ENLACE ──────────────────────────────────────── */}
                    {r.enlace && viva && (
                        <section>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                                <Link2 size={11} /> Enlace de la sala
                            </p>
                            <div className="flex items-center gap-2">
                                <input readOnly value={r.enlace} onFocus={(e) => e.target.select()}
                                    className="flex-1 min-w-0 bg-slate-50 border border-[#efe8dd] rounded-lg px-3 py-2 text-[11px] text-slate-600 outline-none" />
                                <button onClick={copiarEnlace}
                                    className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold shrink-0 transition-colors ${
                                        copiado ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white hover:bg-slate-800'}`}>
                                    {copiado ? <Check size={13} /> : <Copy size={13} />}
                                    {copiado ? 'Copiado' : 'Copiar'}
                                </button>
                            </div>
                            {/* Decirlo claro es parte de la función: quien manda el
                                enlace tiene que saber que está entregando la llave. */}
                            <p className="flex items-start gap-1.5 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 mt-1.5">
                                <ShieldAlert size={12} className="shrink-0 mt-px" />
                                <span>Sirve para invitar a alguien de fuera —un cliente— sin que tenga cuenta.
                                    Cualquiera con este enlace entra a la sala, así que mándalo solo a quien corresponde.</span>
                            </p>
                        </section>
                    )}

                    {/* ── 3 · LO ACORDADO ─────────────────────────────────── */}
                    <section>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                            <StickyNote size={11} /> Lo que se acordó
                        </p>
                        <textarea rows={4} value={notas} onChange={(e) => setNotas(e.target.value)}
                            placeholder="Los acuerdos, los pendientes, lo que hay que hacer…"
                            className="w-full bg-white border border-[#efe8dd] rounded-lg px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500 resize-none" />
                        {notas !== (r.notas || '') && (
                            <button onClick={guardarNotas} disabled={guardando}
                                className="mt-1.5 flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-3 py-1.5 text-[11px] font-bold">
                                {guardando ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Guardar nota
                            </button>
                        )}
                    </section>
                </div>

                {/* Lo que no tiene vuelta atrás, separado del resto */}
                {soyQuienConvoco && (
                    <div className="px-5 py-3 shrink-0 border-t border-[#efe8dd] flex items-center gap-2">
                        {viva ? (
                            <button onClick={cancelar}
                                className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 hover:text-amber-700">
                                <CalendarX2 size={13} /> Cancelar la reunión
                            </button>
                        ) : (
                            <button onClick={eliminar}
                                className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 hover:text-red-600">
                                <Trash2 size={13} /> Borrar del historial
                            </button>
                        )}
                        <span className="text-[10px] text-slate-400 ml-auto">
                            {viva ? 'Se avisa a los invitados' : 'No se puede deshacer'}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DetalleReunion;
