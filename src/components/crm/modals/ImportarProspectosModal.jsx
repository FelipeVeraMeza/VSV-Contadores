// =====================================================================
// IMPORTAR PROSPECTOS DESDE UNA PLANILLA
// ---------------------------------------------------------------------
// Tres pasos: se elige el archivo, se dice qué columna es cada cosa, y se
// revisa antes de guardar.
//
// El paso de "qué columna es cada cosa" no es burocracia: las planillas reales
// tienen encabezados que no dicen lo que contienen. La que sirvió de guía traía
// una columna "TELEFONO 2" que en realidad llevaba intentos de llamada ("nc1",
// "nc2", "ok") y una "LLAMADOS" con notas de venta. Adivinar por el nombre del
// encabezado habría metido basura en el teléfono de 85 prospectos.
//
// Nada se guarda hasta que la persona ve el resumen y confirma.
// =====================================================================
import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
    X, Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle,
    ArrowRight, ArrowLeft, UserPlus, Phone, Mail, Calendar, Users,
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { previsualizarImportacionApi, importarProspectosApi } from '@/services/personaService';

const getUser = () => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } };

// Los campos que el sistema sabe usar. `pista` son nombres de encabezado
// habituales, para proponer el mapeo y que no haya que elegir todo a mano.
const CAMPOS = [
    { id: 'telefono',        label: 'Teléfono',            icono: Phone,    pista: ['telefono', 'teléfono', 'fono', 'celular', 'whatsapp'], clave: true },
    { id: 'nombre',          label: 'Nombre',              icono: UserPlus, pista: ['nombre', 'nombre completo', 'cliente', 'contacto'] },
    { id: 'correo',          label: 'Correo',              icono: Mail,     pista: ['mail', 'correo', 'email', 'e-mail'] },
    { id: 'necesidad',       label: 'Qué necesita',        icono: null,     pista: ['que necesita', 'qué necesita', 'necesidad', 'requiere', 'servicio'] },
    { id: 'estado',          label: 'Estado',              icono: null,     pista: ['estado', 'estado del cliente', 'situacion', 'situación'] },
    { id: 'proximoContacto', label: 'Cuándo contactar',    icono: Calendar, pista: ['cuando contactar', 'cuándo contactar', 'contactar', 'proximo contacto', 'próximo contacto', 'seguimiento'] },
    { id: 'fechaLlegada',    label: 'Cuándo llegó',        icono: Calendar, pista: ['cuando llego', 'cuándo llegó', 'cuando llegó', 'fecha', 'ingreso'] },
    { id: 'telefono2',       label: 'Intentos de llamada', icono: null,     pista: ['telefono 2', 'teléfono 2', 'llamadas', 'intentos'] },
    { id: 'llamados',        label: 'Notas',               icono: null,     pista: ['llamados', 'notas', 'observaciones', 'comentarios'] },
    { id: 'accion',          label: 'Acción siguiente',    icono: null,     pista: ['accion', 'acción', 'siguiente', 'tarea'] },
];

// Sin tildes y en minúsculas, para que "Teléfono" y "telefono" se emparejen.
const normaliza = (s) => String(s || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Empareja columnas con campos. Dos vueltas, y el orden importa:
//
//   1ª · coincidencia exacta. Es la que resuelve los casos peligrosos:
//        "Telefono" se queda con el teléfono y "TELEFONO 2" con los intentos
//        de llamada, y no al revés.
//   2ª · el encabezado CONTIENE la pista. Acá caen los títulos que la gente
//        escribe de verdad: "CUANDO CONTACTAR", "Fecha próximo contacto".
//        Sin esta vuelta esas columnas quedaban en «— ninguna —» y su dato
//        —la fecha en que hay que llamar— no se importaba nunca.
//
// Se propone, no se impone: el paso 2 muestra el resultado para corregirlo.
const emparejar = (columnas) => {
    const mapa = {};
    const usadas = new Set();
    const libre = (c) => !usadas.has(c);
    const asigna = (campo, col) => { mapa[campo.id] = col; usadas.add(col); };

    for (const campo of CAMPOS) {
        const exacta = columnas.find(c => libre(c) && campo.pista.includes(normaliza(c)));
        if (exacta) asigna(campo, exacta);
    }
    for (const campo of CAMPOS) {
        if (mapa[campo.id]) continue;
        const parcial = columnas.find(c => libre(c) && campo.pista.some(p =>
            // Solo pistas de 5+ letras: "fono" dentro de otra palabra da falsos
            // positivos; "contactar" dentro de "CUANDO CONTACTAR" no.
            normaliza(p).length >= 5 && normaliza(c).includes(normaliza(p))));
        if (parcial) asigna(campo, parcial);
    }
    return mapa;
};

const inp = "w-full bg-slate-50 border border-[#efe8dd] rounded-lg px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-emerald-500";

const Dato = ({ n, label, tono = 'text-slate-900', sub }) => (
    <div className="bg-white border border-[#efe8dd] rounded-xl px-3 py-2.5">
        <p className={`text-xl font-black tabular-nums ${n > 0 ? tono : 'text-slate-300'}`}>{n}</p>
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-tight mt-0.5">{label}</p>
        {sub && <p className="text-[9px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
);

const ImportarProspectosModal = ({ onClose, onImportado }) => {
    const [paso, setPaso] = useState(1);
    const [nombreArchivo, setNombreArchivo] = useState('');
    const [columnas, setColumnas] = useState([]);
    const [filas, setFilas] = useState([]);
    const [mapa, setMapa] = useState({});
    const [previa, setPrevia] = useState(null);
    const [cargando, setCargando] = useState(false);
    const [omitirExistentes, setOmitirExistentes] = useState(true);
    const [resultado, setResultado] = useState(null);

    const yo = getUser().nombre || 'tu cuenta';

    // ---- Paso 1 · leer el archivo ----
    const leerArchivo = async (file) => {
        if (!file) return;
        setCargando(true);
        try {
            const buf = await file.arrayBuffer();
            const wb = XLSX.read(buf);
            const hoja = wb.Sheets[wb.SheetNames[0]];
            const datos = XLSX.utils.sheet_to_json(hoja, { defval: null });
            if (!datos.length) throw new Error('La planilla está vacía.');

            // Las columnas se toman de TODAS las filas, no solo de la primera:
            // si la primera fila tiene celdas vacías, esas columnas no aparecen.
            const cols = [...new Set(datos.flatMap(f => Object.keys(f)))];

            setNombreArchivo(file.name);
            setColumnas(cols);
            setFilas(datos);

            // Propuesta automática de mapeo, que después se puede corregir.
            setMapa(emparejar(cols));
            setPaso(2);
        } catch (e) {
            toast({ variant: 'destructive', title: 'No se pudo leer la planilla', description: e.message });
        } finally { setCargando(false); }
    };

    // ---- Paso 2 → 3 · vista previa ----
    const revisar = async () => {
        if (!mapa.telefono && !mapa.nombre && !mapa.correo) {
            toast({ variant: 'destructive', title: 'Falta lo mínimo', description: 'Indica al menos el teléfono, el nombre o el correo.' });
            return;
        }
        setCargando(true);
        try {
            const r = await previsualizarImportacionApi(getUser().sessionId, filas, mapa);
            const d = await r.json();
            if (!d.success) throw new Error(d.message);
            setPrevia(d);
            setPaso(3);
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error al revisar', description: e.message });
        } finally { setCargando(false); }
    };

    // ---- Paso 3 · importar ----
    const importar = async () => {
        setCargando(true);
        try {
            const r = await importarProspectosApi(getUser().sessionId, filas, mapa, { omitirExistentes });
            const d = await r.json();
            if (!d.success) throw new Error(d.message);
            setResultado(d);
            setPaso(4);
            onImportado?.();
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error al importar', description: e.message });
        } finally { setCargando(false); }
    };

    const yaUsadas = useMemo(() => new Set(Object.values(mapa).filter(Boolean)), [mapa]);

    return (
        <div className="fixed inset-0 z-[140] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="w-full max-w-2xl bg-white rounded-2xl border border-[#efe8dd] shadow-2xl max-h-[92vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}>

                <div className="flex items-center justify-between px-5 py-4 border-b border-[#efe8dd] shrink-0">
                    <div>
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                            <FileSpreadsheet size={16} className="text-emerald-600" /> Importar prospectos
                        </h3>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                            {nombreArchivo || 'Desde una planilla de Excel'}
                            {filas.length > 0 && ` · ${filas.length} filas`}
                        </p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-red-500"><X size={18} /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-5">

                    {/* ---------- PASO 1 · el archivo ---------- */}
                    {paso === 1 && (
                        <label className="block border-2 border-dashed border-[#efe8dd] rounded-2xl p-10 text-center cursor-pointer hover:border-emerald-500/50 transition-colors">
                            <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
                                onChange={(e) => leerArchivo(e.target.files?.[0])} />
                            {cargando
                                ? <Loader2 size={28} className="mx-auto text-emerald-600 animate-spin" />
                                : <Upload size={28} className="mx-auto text-slate-300" />}
                            <p className="text-xs font-bold text-slate-700 mt-3">Elige la planilla</p>
                            <p className="text-[10px] text-slate-400 mt-1">Excel (.xlsx, .xls) o CSV</p>
                            <p className="text-[10px] text-slate-400 mt-3 max-w-xs mx-auto leading-relaxed">
                                No importa cómo se llamen las columnas. En el paso siguiente
                                dices qué es cada una.
                            </p>
                        </label>
                    )}

                    {/* ---------- PASO 2 · qué es cada columna ---------- */}
                    {paso === 2 && (
                        <div className="space-y-3">
                            <p className="text-[11px] text-slate-500 leading-relaxed">
                                Revisa el emparejamiento. Lo que quede en <b>«— ninguna —»</b> simplemente
                                no se importa.
                            </p>
                            <div className="space-y-1.5">
                                {CAMPOS.map(c => (
                                    <div key={c.id} className="flex items-center gap-2">
                                        <span className={`text-[10px] font-black uppercase tracking-widest w-40 shrink-0 ${c.clave ? 'text-slate-700' : 'text-slate-400'}`}>
                                            {c.label}{c.clave && <span className="text-emerald-600"> ·</span>}
                                        </span>
                                        <select className={`${inp} cursor-pointer`} value={mapa[c.id] || ''}
                                            onChange={(e) => setMapa(m => ({ ...m, [c.id]: e.target.value || undefined }))}>
                                            <option value="">— ninguna —</option>
                                            {columnas.map(col => (
                                                <option key={col} value={col}
                                                    disabled={yaUsadas.has(col) && mapa[c.id] !== col}>
                                                    {col}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                ))}
                            </div>
                            <p className="text-[10px] text-slate-400 border-l-2 border-[#efe8dd] pl-2.5 leading-relaxed">
                                El <b>teléfono</b> es lo que identifica a un prospecto: por ahí se detecta
                                si ya lo tienes. Sin él igual se importa, pero podría entrar repetido.
                            </p>
                        </div>
                    )}

                    {/* ---------- PASO 3 · revisar antes de guardar ---------- */}
                    {paso === 3 && previa && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                <Dato n={previa.nuevas} label="Se van a crear" tono="text-emerald-600" />
                                <Dato n={previa.yaExisten} label="Ya los tienes" tono="text-amber-600" />
                                <Dato n={previa.repetidasEnPlanilla} label="Repetidos en la planilla" tono="text-amber-600" />
                                <Dato n={previa.descartadas} label="Sin datos útiles" tono="text-slate-400" />
                            </div>

                            {/* Cuándo contactar. Es la única columna que se
                                convierte en trabajo agendado, así que se muestra
                                aparte: si sale 0 habiendo mapeado la columna, el
                                problema está en el formato de la fecha y hay que
                                verlo ANTES de importar, no después. */}
                            {mapa.proximoContacto ? (
                                <div className={`rounded-xl p-3 flex items-start gap-2 border ${previa.conProximoContacto > 0
                                    ? 'bg-emerald-500/5 border-emerald-500/25'
                                    : 'bg-amber-500/5 border-amber-500/25'}`}>
                                    <Calendar size={14} className={`shrink-0 mt-0.5 ${previa.conProximoContacto > 0 ? 'text-emerald-600' : 'text-amber-600'}`} />
                                    <p className="text-[11px] text-slate-600 leading-relaxed">
                                        {previa.conProximoContacto > 0 ? (
                                            <>
                                                <b>{previa.conProximoContacto}</b> traen fecha para contactar
                                                (columna «{mapa.proximoContacto}»). Quedan agendados y aparecen
                                                en la columna <b>Contactar</b> de la lista de prospectos.
                                            </>
                                        ) : (
                                            <>
                                                Ninguna fila de «{mapa.proximoContacto}» trae una fecha legible.
                                                Se importarán sin fecha de contacto. Se esperan formatos como
                                                <b> 6/8/2026</b> (día/mes/año) o <b>2026-08-06</b>.
                                            </>
                                        )}
                                    </p>
                                </div>
                            ) : (
                                <div className="bg-amber-500/5 border border-amber-500/25 rounded-xl p-3 flex items-start gap-2">
                                    <Calendar size={14} className="text-amber-600 shrink-0 mt-0.5" />
                                    <p className="text-[11px] text-slate-600 leading-relaxed">
                                        No indicaste qué columna es <b>«Cuándo contactar»</b>. Los prospectos
                                        entran sin fecha de seguimiento. Vuelve <b>Atrás</b> si tu planilla
                                        la trae.
                                    </p>
                                </div>
                            )}

                            <div className="bg-emerald-500/5 border border-emerald-500/25 rounded-xl p-3 flex items-start gap-2">
                                <Users size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                                <p className="text-[11px] text-slate-600 leading-relaxed">
                                    Todos quedarán en la cartera de <b>{yo}</b>. Los prospectos que
                                    importas son tuyos: aparecen en tu lista y nadie más los trabaja.
                                </p>
                            </div>

                            {(previa.sinNombre > 0 || previa.correosInvalidos > 0) && (
                                <div className="bg-amber-500/5 border border-amber-500/25 rounded-xl p-3">
                                    <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest flex items-center gap-1.5 mb-1">
                                        <AlertTriangle size={12} /> Para que lo sepas
                                    </p>
                                    <ul className="text-[11px] text-slate-600 space-y-0.5">
                                        {previa.sinNombre > 0 && (
                                            <li>· <b>{previa.sinNombre}</b> no traen nombre. Se importan igual y se identifican por el teléfono.</li>
                                        )}
                                        {previa.correosInvalidos > 0 && (
                                            <li>· <b>{previa.correosInvalidos}</b> traen un correo mal escrito. Se importan sin correo.</li>
                                        )}
                                    </ul>
                                </div>
                            )}

                            {previa.yaExisten > 0 && (
                                <label className="flex items-start gap-2 cursor-pointer bg-slate-50 border border-[#efe8dd] rounded-xl p-3">
                                    <input type="checkbox" checked={omitirExistentes}
                                        onChange={(e) => setOmitirExistentes(e.target.checked)} className="mt-0.5 accent-emerald-600" />
                                    <span className="text-[11px] text-slate-600 leading-relaxed">
                                        Saltar los <b>{previa.yaExisten}</b> que ya tienes
                                        {previa.ejemplosExistentes?.length > 0 && (
                                            <span className="text-slate-400"> ({previa.ejemplosExistentes.slice(0, 3).join(', ')}…)</span>
                                        )}.
                                        <span className="block text-slate-400 mt-0.5">
                                            Si lo destildas se crearán duplicados. Casi nunca es lo que quieres.
                                        </span>
                                    </span>
                                </label>
                            )}

                            {previa.muestra?.length > 0 && (
                                <div>
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                                        Así van a quedar los primeros
                                    </p>
                                    <div className="border border-[#efe8dd] rounded-xl overflow-hidden divide-y divide-[#f5f0e8]">
                                        {previa.muestra.slice(0, 5).map((m, i) => (
                                            <div key={i} className="px-3 py-2 text-[11px]">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-bold text-slate-900">
                                                        {[m.nombre, m.apellidos].filter(Boolean).join(' ') || <span className="text-slate-400 italic">sin nombre</span>}
                                                    </span>
                                                    {m.telefonos?.[0] && <span className="text-slate-500">{m.telefonos[0]}</span>}
                                                    {m.etapa && <span className="text-[9px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-500/10 border border-emerald-500/25 rounded px-1.5 py-0.5">{m.etapa}</span>}
                                                    {m.proximoContacto && (
                                                        <span className="text-[9px] text-slate-500 flex items-center gap-0.5">
                                                            <Calendar size={9} /> {m.proximoContacto}
                                                        </span>
                                                    )}
                                                </div>
                                                {m.necesidad && <p className="text-slate-500 truncate mt-0.5">{m.necesidad}</p>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ---------- PASO 4 · resultado ---------- */}
                    {paso === 4 && resultado && (
                        <div className="text-center py-4">
                            <CheckCircle2 size={40} className="mx-auto text-emerald-500" />
                            <p className="text-lg font-black text-slate-900 mt-3">
                                {resultado.creados} prospectos importados
                            </p>
                            <p className="text-[11px] text-slate-500 mt-1">
                                Están en tu cartera, listos para trabajar.
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-5 text-left">
                                <Dato n={resultado.creados} label="Creados" tono="text-emerald-600" />
                                <Dato n={resultado.omitidos} label="Saltados" tono="text-slate-500" />
                                <Dato n={resultado.fallidos} label="Con problema" tono="text-red-600" />
                            </div>
                            {resultado.errores?.length > 0 && (
                                <div className="mt-4 text-left bg-red-500/5 border border-red-500/25 rounded-xl p-3">
                                    <p className="text-[10px] font-black text-red-700 uppercase tracking-widest mb-1">
                                        No se pudieron importar
                                    </p>
                                    {resultado.errores.map((e, i) => (
                                        <p key={i} className="text-[10px] text-slate-600">
                                            Fila {e.fila} · {e.quien} — {e.motivo}
                                        </p>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* ---------- Botones ---------- */}
                <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-[#efe8dd] shrink-0">
                    {paso > 1 && paso < 4 ? (
                        <button onClick={() => setPaso(p => p - 1)}
                            className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-700">
                            <ArrowLeft size={13} /> Atrás
                        </button>
                    ) : <span />}

                    {paso === 2 && (
                        <button onClick={revisar} disabled={cargando}
                            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-4 h-9 text-[10px] font-black uppercase tracking-widest">
                            {cargando ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />} Revisar
                        </button>
                    )}
                    {paso === 3 && (
                        <button onClick={importar} disabled={cargando || previa?.nuevas === 0}
                            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg px-4 h-9 text-[10px] font-black uppercase tracking-widest">
                            {cargando ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                            Importar {previa?.nuevas > 0 ? previa.nuevas : ''}
                        </button>
                    )}
                    {paso === 4 && (
                        <button onClick={onClose}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-5 h-9 text-[10px] font-black uppercase tracking-widest">
                            Listo
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ImportarProspectosModal;
