// =====================================================================
// DOCUMENTACIÓN · el módulo
// ---------------------------------------------------------------------
// EL PEDIDO
// «Pasar lo que tenemos hoy en el código —la documentación principal que está
// ahí— directamente a la página, para que ellos también puedan verlo sin
// necesidad de explicarlo siempre todos los días.»
//
// CÓMO SE LEE
// A la izquierda el índice del documento; a la derecha el texto. El índice sale
// de los encabezados del propio .md, así que no hay que mantenerlo aparte: si
// alguien agrega una sección al documento, aparece sola.
//
// LO QUE SE VE ES LO MISMO QUE HAY EN EL CÓDIGO
// El texto se lee del archivo en cada carga. No hay copia en la base que pueda
// envejecer sin que nadie lo note.
// =====================================================================
import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { BookOpen, Loader2, AlertTriangle, List, FileText } from 'lucide-react';
import { documentosApi, documentoApi } from '@/services/crmService';
import Markdown from '@/components/documentacion/Markdown';

const getSessionId = () => {
    try { return JSON.parse(localStorage.getItem('user') || '{}').sessionId; } catch { return null; }
};

const Documentacion = () => {
    const [documentos, setDocumentos] = useState([]);
    const [activo, setActivo] = useState(null);
    const [doc, setDoc] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState(null);

    // 1. La lista de documentos disponibles.
    useEffect(() => {
        (async () => {
            try {
                const r = await documentosApi(getSessionId());
                const d = await r.json();
                if (!d.success) throw new Error(d.message || 'No se pudo cargar.');
                setDocumentos(d.documentos || []);
                // Se abre el primero solo: un módulo que arranca vacío obliga a
                // un clic para ver algo que siempre se quiere ver.
                if (d.documentos?.length) setActivo(d.documentos[0].id);
            } catch (e) { setError(e.message); setCargando(false); }
        })();
    }, []);

    // 2. El documento elegido.
    const cargarDoc = useCallback(async (id) => {
        if (!id) return;
        setCargando(true); setError(null);
        try {
            const r = await documentoApi(getSessionId(), id);
            const d = await r.json();
            if (!d.success) throw new Error(d.message || 'No se pudo cargar el documento.');
            setDoc(d.documento);
        } catch (e) { setError(e.message); setDoc(null); }
        finally { setCargando(false); }
    }, []);

    useEffect(() => { cargarDoc(activo); }, [activo, cargarDoc]);

    const irA = (ancla) => {
        const el = document.getElementById(ancla);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    return (
        <>
            <Helmet><title>Documentación · VSV PRO</title></Helmet>
            <div className="h-full flex flex-col gap-3">
                <div>
                    <h2 className="text-[15px] font-semibold text-slate-900 tracking-[-0.01em] flex items-center gap-2">
                        <BookOpen size={16} className="text-emerald-600" /> Documentación
                    </h2>
                    <p className="text-[11.5px] text-slate-500 mt-1">
                        Cómo funciona cada módulo, qué tiene y qué falta. Es la misma documentación
                        que se mantiene junto al código.
                    </p>
                </div>

                {error && (
                    <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                        <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                        <span className="text-[11.5px] text-amber-800">{error}</span>
                    </div>
                )}

                <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-3">
                    {/* Columna izquierda: los documentos y el índice del abierto */}
                    <div className="flex flex-col gap-3 min-h-0 overflow-y-auto">
                        {documentos.length > 1 && (
                            <div className="bg-white border border-[#efe8dd] rounded-2xl p-2">
                                {documentos.map(d => (
                                    <button key={d.id} onClick={() => setActivo(d.id)}
                                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[12px] transition-colors ${
                                            activo === d.id ? 'bg-emerald-600 text-white font-semibold'
                                                            : 'text-slate-600 hover:bg-slate-50'}`}>
                                        {d.titulo}
                                    </button>
                                ))}
                            </div>
                        )}

                        {doc?.indice?.length > 0 && (
                            <div className="bg-white border border-[#efe8dd] rounded-2xl p-3">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-2">
                                    <List size={11} /> En este documento
                                </span>
                                <div className="flex flex-col">
                                    {doc.indice.map((s, i) => (
                                        <button key={i} onClick={() => irA(s.ancla)}
                                            title={s.texto}
                                            className={`text-left py-1 text-[11px] text-slate-600 hover:text-emerald-700 transition-colors truncate ${
                                                s.nivel === 3 ? 'pl-3 text-slate-500' : 'font-medium'}`}>
                                            {s.texto}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Columna derecha: el documento */}
                    <div className="bg-white border border-[#efe8dd] rounded-2xl min-h-0 overflow-y-auto">
                        {cargando ? (
                            <div className="flex items-center justify-center py-20 text-slate-400">
                                <Loader2 className="animate-spin" size={20} />
                            </div>
                        ) : doc ? (
                            <div className="px-5 py-4 max-w-3xl">
                                <Markdown texto={doc.contenido} />
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-20 text-center gap-2">
                                <FileText className="text-slate-300" size={28} />
                                <p className="text-[12px] text-slate-400">Elige un documento para leerlo.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};

export default Documentacion;
