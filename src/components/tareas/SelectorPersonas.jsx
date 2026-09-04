// =====================================================================
// ELEGIR PERSONAS · un desplegable, no una parrilla de botones
// ---------------------------------------------------------------------
// POR QUÉ EXISTE
// Los colaboradores se elegían de una parrilla de botones: uno por cada
// usuario de la organización, todos dibujados a la vez, y el que estaba
// elegido se distinguía del que no por el color de fondo. Con cuatro personas
// se entiende; con veinte es un muro de pastillas verdes y grises donde hay
// que leer una por una para saber quién está dentro.
//
// El pedido fue explícito: «sugiero no utilizar nunca más este sistema de
// selección, sugiero cambiarlo por listas desplegables».
//
// QUÉ HACE
// Un desplegable que se abre, se busca escribiendo y se marca con una casilla.
// Lo elegido se ve arriba como fichas con su «×», que es donde uno mira para
// saber a quién puso — no hay que recorrer la lista entera para averiguarlo.
//
// SE USA EN LOS DOS LADOS
// Al crear la tarea y al editarla ya creada. Antes solo se podía al crear:
// si te olvidabas de alguien, no había forma de agregarlo después.
// =====================================================================
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, X, Search, Check } from 'lucide-react';
import { iniciales } from '@/components/tareas/estilos';

const SelectorPersonas = ({
    usuarios = [],
    valor = [],
    onChange,
    placeholder = 'Nadie',
    // Para no ofrecer al responsable como colaborador de su propia tarea.
    excluir = [],
}) => {
    const [abierto, setAbierto] = useState(false);
    const [busca, setBusca] = useState('');
    const caja = useRef(null);

    const disponibles = useMemo(
        () => usuarios.filter(u => !excluir.includes(u.id)),
        [usuarios, excluir]);

    const elegidos = useMemo(
        () => disponibles.filter(u => valor.includes(u.id)),
        [disponibles, valor]);

    const filtrados = useMemo(() => {
        const q = busca.trim().toLowerCase();
        if (!q) return disponibles;
        return disponibles.filter(u => String(u.nombre || '').toLowerCase().includes(q));
    }, [disponibles, busca]);

    // Cerrar al pulsar fuera: si no, el desplegable queda tapando el formulario.
    useEffect(() => {
        if (!abierto) return;
        const fuera = (e) => { if (caja.current && !caja.current.contains(e.target)) setAbierto(false); };
        document.addEventListener('mousedown', fuera);
        return () => document.removeEventListener('mousedown', fuera);
    }, [abierto]);

    const alternar = (id) => {
        const nuevo = valor.includes(id) ? valor.filter(x => x !== id) : [...valor, id];
        onChange(nuevo);
    };

    return (
        <div className="relative" ref={caja}>
            {/* Lo elegido, como fichas. Es lo que uno mira para saber a quién
                puso, sin tener que recorrer la lista completa. */}
            {elegidos.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1.5">
                    {elegidos.map(u => (
                        <span key={u.id}
                            className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-md pl-1 pr-0.5 py-0.5 text-[10px] font-semibold">
                            <span className="w-3.5 h-3.5 rounded-full bg-emerald-600 text-white text-[7px] font-black flex items-center justify-center">
                                {iniciales(u.nombre)}
                            </span>
                            {u.nombre}
                            <button type="button" onClick={() => alternar(u.id)}
                                title={`Quitar a ${u.nombre}`}
                                className="text-emerald-500 hover:text-emerald-800 p-0.5">
                                <X size={10} />
                            </button>
                        </span>
                    ))}
                </div>
            )}

            <button type="button" onClick={() => setAbierto(v => !v)}
                className="w-full flex items-center justify-between bg-slate-50 border border-[#efe8dd] rounded-lg px-2.5 py-1.5 text-xs text-slate-700 hover:border-emerald-500/50 transition-colors">
                <span className={elegidos.length ? 'text-slate-700' : 'text-slate-400'}>
                    {elegidos.length
                        ? `${elegidos.length} ${elegidos.length === 1 ? 'persona' : 'personas'}`
                        : placeholder}
                </span>
                <ChevronDown size={13} className={`text-slate-400 transition-transform ${abierto ? 'rotate-180' : ''}`} />
            </button>

            {abierto && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-[#efe8dd] rounded-lg shadow-xl overflow-hidden">
                    {/* El buscador aparece solo cuando hay suficientes personas
                        para que buscar tenga sentido. */}
                    {disponibles.length > 6 && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-[#f5f0e8]">
                            <Search size={12} className="text-slate-400 shrink-0" />
                            <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)}
                                placeholder="Buscar…"
                                className="flex-1 bg-transparent text-xs outline-none text-slate-700 placeholder:text-slate-400" />
                        </div>
                    )}
                    <div className="max-h-52 overflow-y-auto">
                        {filtrados.length === 0 ? (
                            <p className="text-[11px] text-slate-400 italic text-center py-4">
                                {busca ? 'Nadie con ese nombre.' : 'No hay personas.'}
                            </p>
                        ) : filtrados.map(u => {
                            const puesto = valor.includes(u.id);
                            return (
                                <button type="button" key={u.id} onClick={() => alternar(u.id)}
                                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-slate-50 transition-colors">
                                    {/* La casilla dice si está dentro o fuera. Es la
                                        diferencia con la parrilla de botones: acá el
                                        estado se lee, no se deduce del color. */}
                                    <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                                        puesto ? 'bg-emerald-600 border-emerald-600' : 'bg-white border-slate-300'}`}>
                                        {puesto && <Check size={9} className="text-white" strokeWidth={3.5} />}
                                    </span>
                                    <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-[8px] font-black flex items-center justify-center shrink-0">
                                        {iniciales(u.nombre)}
                                    </span>
                                    <span className="text-xs text-slate-700 truncate">{u.nombre}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SelectorPersonas;
