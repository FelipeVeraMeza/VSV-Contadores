import { useRef, useState } from 'react';
import { ImagePlus, X, Loader2 } from 'lucide-react';

// ============================================================================
// SUBIDA DE LOGO (reutilizable)
// ----------------------------------------------------------------------------
// Toma una imagen del computador, la ACHICA a un tamaño razonable y la entrega
// como data URI base64 por `onChange`. Ese texto se guarda tal cual en la base
// (empresa.logo_url, que es TEXT) y se muestra directo en un <img> — sin
// necesidad de un servidor de archivos ni de descargar nada.
//
// Se reduce a 400px de lado y se guarda como PNG (conserva transparencia). Un
// logo así pesa unos pocos KB en vez de los megas de la foto original, que es lo
// que hace viable guardarlo en la base.
// ============================================================================
const MAX_LADO = 400;                       // px del lado más largo
const MAX_ENTRADA = 5 * 1024 * 1024;        // 5 MB de archivo original

export default function LogoUploader({ value, onChange, size = 96, onError }) {
    const inputRef = useRef(null);
    const [cargando, setCargando] = useState(false);

    const avisar = (msg) => { if (onError) onError(msg); else console.warn(msg); };

    const procesar = (file) => {
        if (!file) return;
        if (!file.type?.startsWith('image/')) { avisar('El archivo debe ser una imagen.'); return; }
        if (file.size > MAX_ENTRADA) { avisar('La imagen es muy grande (máximo 5 MB).'); return; }

        setCargando(true);
        const fr = new FileReader();
        fr.onload = () => {
            const img = new Image();
            img.onload = () => {
                const escala = Math.min(1, MAX_LADO / Math.max(img.width, img.height));
                const w = Math.max(1, Math.round(img.width * escala));
                const h = Math.max(1, Math.round(img.height * escala));
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                onChange(canvas.toDataURL('image/png'));
                setCargando(false);
            };
            img.onerror = () => { setCargando(false); avisar('No se pudo leer la imagen.'); };
            img.src = fr.result;
        };
        fr.onerror = () => { setCargando(false); avisar('No se pudo leer el archivo.'); };
        fr.readAsDataURL(file);
    };

    return (
        <div className="flex items-center gap-3">
            <div
                className="rounded-xl border border-[#efe8dd] bg-slate-50 overflow-hidden flex items-center justify-center shrink-0"
                style={{ width: size, height: size }}
            >
                {value
                    ? <img src={value} alt="logo" className="w-full h-full object-cover" />
                    : <ImagePlus size={size / 4} className="text-slate-300" />}
            </div>
            <div className="flex flex-col gap-1.5">
                <input
                    ref={inputRef} type="file" accept="image/*" className="hidden"
                    onChange={(e) => { procesar(e.target.files?.[0]); e.target.value = ''; }}
                />
                <button
                    type="button" onClick={() => inputRef.current?.click()} disabled={cargando}
                    className="text-[11px] font-black uppercase tracking-widest text-emerald-700 hover:text-emerald-600 flex items-center gap-1.5 disabled:opacity-50"
                >
                    {cargando ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
                    {value ? 'Cambiar logo' : 'Subir logo'}
                </button>
                {value && (
                    <button
                        type="button" onClick={() => onChange('')}
                        className="text-[10px] font-bold text-slate-400 hover:text-red-500 flex items-center gap-1"
                    >
                        <X size={11} /> Quitar
                    </button>
                )}
            </div>
        </div>
    );
}
