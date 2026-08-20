import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Upload, Users, Loader2, CheckCircle2, AlertTriangle, Play, Calendar } from 'lucide-react';
import { read, utils } from 'xlsx';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { crearPersonaApi } from '@/services/personaService';

const getSessionId = () => {
    try { return JSON.parse(localStorage.getItem('user') || '{}').sessionId; }
    catch { return null; }
};

// Normaliza un encabezado: sin acentos, minúsculas, sin espacios extra
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Devuelve el primer valor no vacío de la fila cuyo encabezado coincide con algún candidato
const pick = (row, candidatos) => {
    const keys = Object.keys(row);
    for (const cand of candidatos) {
        const k = keys.find(key => norm(key) === cand || norm(key).includes(cand));
        if (k && row[k] != null && String(row[k]).trim() !== '') return String(row[k]).trim();
    }
    return '';
};

// Teléfonos: solo dígitos, se conservan los de 8 o más
const soloTel = (v) => String(v || '').replace(/\D/g, '');
const correoValido = (c) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(c || '').trim());

// Fecha chilena dd/mm/yyyy (día primero). Años de 2 dígitos → 2000+.
// También acepta un serial de Excel por si la celda viene sin formato de fecha.
const parseFechaCL = (str) => {
    const s = String(str || '').trim();
    if (!s) return null;
    const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (m) {
        let [, d, mo, y] = m;
        d = +d; mo = +mo; y = +y < 100 ? 2000 + +y : +y;
        if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
            const dt = new Date(y, mo - 1, d);
            if (!isNaN(dt)) return dt;
        }
    }
    // Serial de Excel (días desde 1899-12-30)
    if (/^\d{4,6}$/.test(s)) {
        const dt = new Date(Date.UTC(1899, 11, 30) + (+s) * 86400000);
        if (!isNaN(dt)) return dt;
    }
    return null;
};

// Recorta a lo que aceptan las columnas varchar(120) del backend.
const cap = (v, n = 120) => { const s = String(v || '').trim(); return s ? s.slice(0, n) : null; };

// Convierte una fecha a formato yyyy-mm-dd (para el campo date)
const aISO = (dt) => dt ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}` : null;

// Mapea una fila del Excel al payload de persona.
// Cada columna cae en un campo visible; el contexto comercial va a "observaciones".
const mapRow = (row) => {
    const nombre = pick(row, ['nombre completo', 'nombre']);
    const tels = [pick(row, ['telefono', 'fono', 'celular']), pick(row, ['telefono 2', 'telefono2', 'fono 2'])]
        .map(soloTel).filter(t => t.length >= 8);
    const correoRaw = pick(row, ['mail', 'correo', 'email', 'e-mail']);
    const correos = correoValido(correoRaw) ? [correoRaw] : [];

    const cuandoLlego = pick(row, ['cuando llego']);
    const necesita = pick(row, ['que necesita']);
    const estadoCli = pick(row, ['estado del cliente']);
    const llamados = pick(row, ['llamados']);
    const accion = pick(row, ['accion']);

    // Cada columna del Excel cae en su campo propio (necesidad / estado
    // comercial / acción). Lo que no tiene campo propio va a observaciones.
    const partes = [];
    if (llamados) partes.push(`Llamados: ${llamados}`);
    if (cuandoLlego) partes.push(`Llegó: ${cuandoLlego}`);
    const observaciones = partes.join('\n');

    // "contactar": si trae una fecha, se usa como Próxima acción
    const contactarDate = parseFechaCL(pick(row, ['contactar']));

    return {
        nombre,
        telefonos: tels,
        correos,
        necesidad: cap(necesita, 500),
        estadoComercial: cap(estadoCli),
        accionSiguiente: cap(accion),
        observaciones: observaciones || null,
        proximoContacto: aISO(contactarDate),
        origen: 'import',
        forzar: true,
        _fecha: parseFechaCL(cuandoLlego),
        _fechaTxt: cuandoLlego,
        _necesita: necesita,
    };
};

const inputCls = "bg-slate-50 border border-[#efe8dd] rounded-lg p-2.5 text-xs text-slate-900 outline-none focus:border-emerald-500 transition-colors w-full";

const CrmImportProspectosModal = ({ onClose, onImported }) => {
    const [workbook, setWorkbook] = useState(null);
    const [sheets, setSheets] = useState([]);
    const [sheetName, setSheetName] = useState('');
    const [fileName, setFileName] = useState('');
    // Sin corte por defecto: se importan todos los registros. El filtro por
    // fecha es opcional (antes venía fijo en 2026-07-10 y descartaba en
    // silencio todo lo anterior, por eso "no cargaba la totalidad").
    const [corte, setCorte] = useState('');
    const [parsing, setParsing] = useState(false);
    const [importing, setImporting] = useState(false);
    const [progress, setProgress] = useState(0);
    const [result, setResult] = useState(null);
    const fileRef = useRef(null);

    // Reprocesa la hoja seleccionada con el corte de fecha actual
    const procesar = (wb, hoja, corteStr) => {
        const sheet = wb.Sheets[hoja];
        if (!sheet) return { total: 0, enRango: [], fueraRango: 0, sinFecha: 0 };
        const json = utils.sheet_to_json(sheet, { defval: '', raw: false });
        const corteDate = corteStr ? new Date(corteStr + 'T00:00:00') : null;
        let fueraRango = 0, sinFecha = 0, sinDato = 0;
        const enRango = [];
        json.forEach(r => {
            const m = mapRow(r);
            // Descarta filas sin ningún dato aprovechable (ni nombre, ni teléfono, ni correo)
            if (!m.nombre && m.telefonos.length === 0 && m.correos.length === 0) { sinDato++; return; }
            // El filtro por fecha solo aplica si el usuario fijó un corte.
            if (corteDate) {
                if (!m._fecha) { sinFecha++; return; }
                if (m._fecha < corteDate) { fueraRango++; return; }
            }
            enRango.push(m);
        });
        return { total: json.length, enRango, fueraRango, sinFecha, sinDato };
    };

    const [stats, setStats] = useState(null);

    const recomputar = (wb, hoja, corteStr) => {
        const s = procesar(wb, hoja, corteStr);
        setStats(s);
    };

    const handleFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setParsing(true);
        setResult(null);
        setFileName(file.name);
        try {
            const data = await file.arrayBuffer();
            const wb = read(data, { type: 'array' });
            const nombres = wb.SheetNames || [];
            // Hoja por defecto: la que incluya "prospec", si no la primera
            const preferida = nombres.find(n => norm(n).includes('prospec')) || nombres[0] || '';
            setWorkbook(wb);
            setSheets(nombres);
            setSheetName(preferida);
            recomputar(wb, preferida, corte);
        } catch (err) {
            toast({ title: 'Error leyendo el archivo', description: err.message, variant: 'destructive' });
        } finally {
            setParsing(false);
        }
    };

    const cambiarHoja = (h) => { setSheetName(h); if (workbook) recomputar(workbook, h, corte); };
    const cambiarCorte = (c) => { setCorte(c); if (workbook) recomputar(workbook, sheetName, c); };

    const enRango = stats?.enRango || [];

    const handleImport = async () => {
        if (enRango.length === 0) return;
        setImporting(true);
        setProgress(0);
        const sessionId = getSessionId();
        let creados = 0;
        const errores = [];
        for (let i = 0; i < enRango.length; i++) {
            const m = enRango[i];
            const payload = {
                nombre: m.nombre || null,
                telefonos: m.telefonos,
                correos: m.correos,
                necesidad: m.necesidad,
                estadoComercial: m.estadoComercial,
                accionSiguiente: m.accionSiguiente,
                observaciones: m.observaciones,
                proximoContacto: m.proximoContacto,
                origen: m.origen,
                forzar: m.forzar,
            };
            try {
                const response = await crearPersonaApi(sessionId, payload);
                const data = await response.json();
                if (data.success) creados++;
                else errores.push({ fila: i + 1, nombre: m.nombre || m.telefonos[0] || 's/dato', motivo: data.message || 'Error' });
            } catch (err) {
                errores.push({ fila: i + 1, nombre: m.nombre || 's/dato', motivo: err.message });
            }
            setProgress(Math.round(((i + 1) / enRango.length) * 100));
        }
        setResult({ creados, errores });
        setImporting(false);
        if (creados > 0 && onImported) onImported();
    };

    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={onClose}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="w-full max-w-2xl bg-white border border-[#efe8dd] rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-5 border-b border-[#efe8dd] flex items-center justify-between bg-gradient-to-r from-amber-900/30 to-transparent shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-600">
                            <Users size={20} />
                        </div>
                        <div>
                            <h2 className="text-sm font-black text-slate-900 uppercase tracking-tight">Importar Prospectos</h2>
                            <p className="text-[10px] text-slate-400">Desde Excel — filtra por fecha de ingreso</p>
                        </div>
                    </div>
                    <button onClick={onClose} aria-label="Cerrar" className="p-2 rounded-xl bg-slate-50 text-slate-500 hover:text-red-500 transition-colors"><X size={18} /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-thin scrollbar-thumb-white/10">
                    {/* Cargar archivo */}
                    <div
                        onClick={() => fileRef.current?.click()}
                        className="border-2 border-dashed border-[#e5ddd0] hover:border-amber-500/50 rounded-2xl p-6 text-center cursor-pointer transition-colors"
                    >
                        <input ref={fileRef} type="file" accept=".csv,.xls,.xlsx" className="hidden" onChange={handleFile} />
                        {parsing ? <Loader2 size={28} className="mx-auto text-amber-600 animate-spin" /> : <Upload size={28} className="mx-auto text-slate-400" />}
                        <p className="text-xs text-slate-600 mt-2 font-bold">{fileName || 'Haz clic para seleccionar un archivo'}</p>
                        <p className="text-[10px] text-slate-400 mt-1">Columnas reconocidas: Nombre completo, Teléfono, Teléfono 2, Mail, Cuando llegó</p>
                    </div>

                    {/* Hoja + corte de fecha */}
                    {workbook && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <label className="flex flex-col gap-1">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Hoja del Excel</span>
                                <select value={sheetName} onChange={(e) => cambiarHoja(e.target.value)} className={`${inputCls} cursor-pointer`}>
                                    {sheets.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </label>
                            <label className="flex flex-col gap-1">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><Calendar size={11} /> Importar desde (opcional)</span>
                                <input type="date" value={corte} onChange={(e) => cambiarCorte(e.target.value)} className={inputCls} placeholder="Todos" />
                                <span className="text-[9px] text-slate-400">{corte ? 'Solo los que llegaron desde esa fecha.' : 'Vacío = importar todos.'}</span>
                            </label>
                        </div>
                    )}

                    {/* Contadores */}
                    {stats && !result && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-center">
                                <div className="text-xl font-black text-emerald-600">{enRango.length}</div>
                                <div className="text-[9px] uppercase tracking-widest text-slate-500 mt-0.5">A importar</div>
                            </div>
                            <div className="bg-white border border-[#efe8dd] rounded-xl p-3 text-center">
                                <div className="text-xl font-black text-slate-600">{stats.total}</div>
                                <div className="text-[9px] uppercase tracking-widest text-slate-400 mt-0.5">Filas Excel</div>
                            </div>
                            <div className="bg-white border border-[#efe8dd] rounded-xl p-3 text-center">
                                <div className="text-xl font-black text-slate-600">{stats.fueraRango}</div>
                                <div className="text-[9px] uppercase tracking-widest text-slate-400 mt-0.5">Antes del corte</div>
                            </div>
                            <div className="bg-white border border-[#efe8dd] rounded-xl p-3 text-center">
                                <div className="text-xl font-black text-slate-600">{stats.sinDato || 0}</div>
                                <div className="text-[9px] uppercase tracking-widest text-slate-400 mt-0.5">Sin datos</div>
                            </div>
                        </div>
                    )}

                    {/* Vista previa */}
                    {enRango.length > 0 && !result && (
                        <div className="bg-slate-50 border border-[#efe8dd] rounded-xl p-3">
                            <p className="text-[11px] text-slate-600 font-bold mb-2">{enRango.length} prospecto(s) a importar. Primeros 5:</p>
                            <div className="overflow-x-auto">
                                <table className="w-full text-[10px] text-left">
                                    <thead className="text-slate-400 uppercase">
                                        <tr><th className="pr-3 py-1">Nombre</th><th className="pr-3 py-1">Teléfono</th><th className="pr-3 py-1">Qué necesita</th><th className="pr-3 py-1">Contactar</th><th className="pr-3 py-1">Llegó</th></tr>
                                    </thead>
                                    <tbody className="text-slate-600">
                                        {enRango.slice(0, 5).map((m, i) => (
                                            <tr key={i} className="border-t border-[#efe8dd]">
                                                <td className="pr-3 py-1">{m.nombre || <span className="text-slate-400 italic">sin nombre</span>}</td>
                                                <td className="pr-3 py-1 font-mono">{m.telefonos[0] || '—'}</td>
                                                <td className="pr-3 py-1 max-w-[160px] truncate" title={m._necesita || ''}>{m._necesita || '—'}</td>
                                                {/* La fecha en que hay que llamar es lo que convierte la
                                                    planilla en trabajo. Si sale "—" habiendo columna, es
                                                    que el formato no se entendió: mejor verlo acá. */}
                                                <td className="pr-3 py-1 font-mono">
                                                    {m.proximoContacto
                                                        ? <span className="text-emerald-700 font-bold">{m.proximoContacto}</span>
                                                        : <span className="text-amber-600">—</span>}
                                                </td>
                                                <td className="pr-3 py-1 font-mono">{m._fechaTxt}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Progreso */}
                    {importing && (
                        <div>
                            <div className="h-2 bg-slate-50 rounded-full overflow-hidden">
                                <div className="h-full bg-amber-500 transition-all" style={{ width: `${progress}%` }} />
                            </div>
                            <p className="text-[10px] text-slate-400 text-center mt-1">Importando… {progress}%</p>
                        </div>
                    )}

                    {/* Resultado */}
                    {result && (
                        <div className="bg-slate-50 border border-[#efe8dd] rounded-xl p-4 space-y-2">
                            <div className="flex items-center gap-2 text-emerald-600 text-xs font-bold"><CheckCircle2 size={16} /> {result.creados} prospecto(s) creado(s)</div>
                            {result.errores.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-2 text-red-500 text-xs font-bold mb-1"><AlertTriangle size={16} /> {result.errores.length} con error</div>
                                    <div className="max-h-32 overflow-y-auto text-[10px] text-slate-500 space-y-0.5">
                                        {result.errores.slice(0, 20).map((e, i) => (
                                            <div key={i}>Fila {e.fila} ({e.nombre}): {e.motivo}</div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-[#efe8dd] flex gap-3 shrink-0 bg-white">
                    <Button variant="ghost" onClick={onClose} className="flex-1 uppercase font-black text-[10px] tracking-widest text-slate-500 h-10 rounded-xl bg-slate-50 hover:bg-slate-100">
                        {result ? 'Cerrar' : 'Cancelar'}
                    </Button>
                    {!result && (
                        <Button
                            onClick={handleImport}
                            disabled={enRango.length === 0 || importing}
                            className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white uppercase font-black text-[10px] tracking-widest h-10 rounded-xl flex items-center justify-center gap-2"
                        >
                            {importing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Importar {enRango.length > 0 ? `(${enRango.length})` : ''}
                        </Button>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
};

export default CrmImportProspectosModal;
