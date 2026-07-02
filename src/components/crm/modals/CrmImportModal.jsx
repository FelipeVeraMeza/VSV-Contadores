import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle, Play } from 'lucide-react';
import { read, utils } from 'xlsx';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { crearEmpresaApi } from '@/services/crmService';

const getSessionId = () => {
    try { return JSON.parse(localStorage.getItem('user') || '{}').sessionId; }
    catch { return null; }
};

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Busca en una fila (objeto keyed por encabezado) el primer valor cuyo encabezado coincide con algún candidato
const pick = (row, candidatos) => {
    const keys = Object.keys(row);
    for (const cand of candidatos) {
        const k = keys.find(key => norm(key) === cand || norm(key).includes(cand));
        if (k && row[k] != null && String(row[k]).trim() !== '') return String(row[k]).trim();
    }
    return '';
};

const mapRow = (row) => ({
    rut: pick(row, ['rut', 'r.u.t']),
    razonSocial: pick(row, ['razon social', 'razon', 'nombre', 'razonsocial']),
    giro: pick(row, ['giro', 'actividad']),
    correo: pick(row, ['correo', 'email', 'e-mail']),
    telefono: pick(row, ['telefono', 'fono', 'celular']),
    whatsapp: pick(row, ['whatsapp', 'wsp']),
    repNombre: pick(row, ['representante', 'rep']),
    comuna: pick(row, ['comuna']),
    ciudad: pick(row, ['ciudad'])
});

const CrmImportModal = ({ onClose, onImported }) => {
    const [rows, setRows] = useState([]);
    const [fileName, setFileName] = useState('');
    const [parsing, setParsing] = useState(false);
    const [importing, setImporting] = useState(false);
    const [progress, setProgress] = useState(0);
    const [result, setResult] = useState(null); // { creados, duplicados, errores: [] }
    const fileRef = useRef(null);

    const handleFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setParsing(true);
        setResult(null);
        setFileName(file.name);
        try {
            const data = await file.arrayBuffer();
            const wb = read(data, { type: 'array' });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const json = utils.sheet_to_json(sheet, { defval: '' });
            const mapped = json.map(mapRow).filter(r => r.rut || r.razonSocial);
            setRows(mapped);
            if (mapped.length === 0) toast({ title: "Sin filas válidas", description: "No se encontró una columna RUT o Razón Social.", variant: "destructive" });
        } catch (err) {
            toast({ title: "Error leyendo el archivo", description: err.message, variant: "destructive" });
        } finally {
            setParsing(false);
        }
    };

    const handleImport = async () => {
        setImporting(true);
        setProgress(0);
        const sessionId = getSessionId();
        let creados = 0, duplicados = 0;
        const errores = [];
        for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            try {
                const response = await crearEmpresaApi(sessionId, r);
                const payload = await response.json();
                if (payload.success) creados++;
                else if (payload.code === 'DUPLICADO') duplicados++;
                else errores.push({ fila: i + 2, rut: r.rut, motivo: payload.message || 'Error' });
            } catch (err) {
                errores.push({ fila: i + 2, rut: r.rut, motivo: err.message });
            }
            setProgress(Math.round(((i + 1) / rows.length) * 100));
        }
        setResult({ creados, duplicados, errores });
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
                className="w-full max-w-2xl bg-[#0f172a] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-5 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-emerald-900/30 to-transparent shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                            <FileSpreadsheet size={20} />
                        </div>
                        <div>
                            <h2 className="text-sm font-black text-white uppercase tracking-tight">Importar Clientes</h2>
                            <p className="text-[10px] text-gray-500">Desde Excel (.xlsx) o CSV — requiere columna RUT</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl bg-white/5 text-gray-400 hover:text-red-400 transition-colors"><X size={18} /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-thin scrollbar-thumb-white/10">
                    {/* Cargar archivo */}
                    <div
                        onClick={() => fileRef.current?.click()}
                        className="border-2 border-dashed border-white/15 hover:border-emerald-500/50 rounded-2xl p-6 text-center cursor-pointer transition-colors"
                    >
                        <input ref={fileRef} type="file" accept=".csv,.xls,.xlsx" className="hidden" onChange={handleFile} />
                        {parsing ? (
                            <Loader2 size={28} className="mx-auto text-emerald-400 animate-spin" />
                        ) : (
                            <Upload size={28} className="mx-auto text-gray-500" />
                        )}
                        <p className="text-xs text-gray-300 mt-2 font-bold">{fileName || 'Haz clic para seleccionar un archivo'}</p>
                        <p className="text-[10px] text-gray-600 mt-1">Columnas reconocidas: RUT, Razón Social, Giro, Correo, Teléfono, Representante, Comuna, Ciudad</p>
                    </div>

                    {/* Vista previa */}
                    {rows.length > 0 && !result && (
                        <div className="bg-black/20 border border-white/5 rounded-xl p-3">
                            <p className="text-[11px] text-gray-300 font-bold mb-2">{rows.length} fila(s) detectada(s). Primeras 5:</p>
                            <div className="overflow-x-auto">
                                <table className="w-full text-[10px] text-left">
                                    <thead className="text-gray-500 uppercase">
                                        <tr><th className="pr-3 py-1">RUT</th><th className="pr-3 py-1">Razón Social</th><th className="pr-3 py-1">Correo</th></tr>
                                    </thead>
                                    <tbody className="text-gray-300">
                                        {rows.slice(0, 5).map((r, i) => (
                                            <tr key={i} className="border-t border-white/5"><td className="pr-3 py-1 font-mono">{r.rut || '—'}</td><td className="pr-3 py-1">{r.razonSocial || '—'}</td><td className="pr-3 py-1">{r.correo || '—'}</td></tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Progreso */}
                    {importing && (
                        <div>
                            <div className="h-2 bg-black/40 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
                            </div>
                            <p className="text-[10px] text-gray-500 text-center mt-1">Importando… {progress}%</p>
                        </div>
                    )}

                    {/* Resultado */}
                    {result && (
                        <div className="bg-black/20 border border-white/5 rounded-xl p-4 space-y-2">
                            <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold"><CheckCircle2 size={16} /> {result.creados} creados</div>
                            <div className="flex items-center gap-2 text-amber-400 text-xs font-bold"><AlertTriangle size={16} /> {result.duplicados} duplicados (omitidos)</div>
                            {result.errores.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-2 text-red-400 text-xs font-bold mb-1"><X size={16} /> {result.errores.length} con error</div>
                                    <div className="max-h-32 overflow-y-auto text-[10px] text-gray-400 space-y-0.5">
                                        {result.errores.slice(0, 20).map((e, i) => (
                                            <div key={i}>Fila {e.fila} ({e.rut || 's/rut'}): {e.motivo}</div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-white/10 flex gap-3 shrink-0 bg-[#0f172a]">
                    <Button variant="ghost" onClick={onClose} className="flex-1 uppercase font-black text-[10px] tracking-widest text-gray-400 h-10 rounded-xl bg-white/5 hover:bg-white/10">
                        {result ? 'Cerrar' : 'Cancelar'}
                    </Button>
                    {!result && (
                        <Button
                            onClick={handleImport}
                            disabled={rows.length === 0 || importing}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white uppercase font-black text-[10px] tracking-widest h-10 rounded-xl flex items-center justify-center gap-2"
                        >
                            {importing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Importar {rows.length > 0 ? `(${rows.length})` : ''}
                        </Button>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
};

export default CrmImportModal;
