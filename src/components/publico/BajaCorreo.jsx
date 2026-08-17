// =====================================================================
// CANCELAR SUSCRIPCIÓN · página PÚBLICA
// ---------------------------------------------------------------------
// Es donde aterriza el cliente que pulsa «cancelar tu suscripción» al pie de
// un correo. No pide iniciar sesión —quien llega no tiene cuenta en el
// sistema— y no muestra nada de la aplicación: ni menú, ni datos de la firma,
// ni de otros clientes.
//
// TRES COSAS QUE PARECEN DETALLES Y NO LO SON:
//
// 1. El correo se muestra OFUSCADO (j***z@gmail.com). Lo decide el servidor.
//    Si mostrara la dirección completa, cualquiera con el enlace sabría de
//    quién es.
// 2. Hay que CONFIRMAR con un botón. Los antivirus y varios clientes de correo
//    pre-visitan los enlaces para revisarlos; si con solo abrir la página
//    quedara dado de baja, se desuscribiría a gente que nunca pulsó nada.
// 3. Si ya estaba de baja, se dice y listo. Discutirle a alguien que quiere
//    irse que «no estaba suscrito» es pelear por un detalle técnico.
// =====================================================================
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle2, AlertTriangle, MailX } from 'lucide-react';
import { API_BASE_URL } from '../../../config.js';

const Marco = ({ children }) => (
    <div className="min-h-screen w-full flex items-center justify-center px-4 py-10 bg-[#faf7f2]">
        <div className="w-full max-w-md bg-white border border-[#efe8dd] rounded-2xl shadow-xl p-7 text-center">
            {children}
            <p className="mt-7 pt-4 border-t border-[#f3ede4] text-[10px] text-slate-400">
                VSV Contadores
            </p>
        </div>
    </div>
);

const BajaCorreo = () => {
    const [params] = useSearchParams();
    const token = params.get('t');

    const [cargando, setCargando] = useState(true);
    const [datos, setDatos] = useState(null);
    const [error, setError] = useState(null);
    const [enviando, setEnviando] = useState(false);
    const [listo, setListo] = useState(false);
    const [motivo, setMotivo] = useState('');

    useEffect(() => {
        (async () => {
            if (!token) { setError('El enlace está incompleto.'); setCargando(false); return; }
            try {
                const r = await fetch(`${API_BASE_URL}/baja?t=${encodeURIComponent(token)}`);
                const d = await r.json();
                if (!d.success) throw new Error(d.message);
                setDatos(d);
                if (d.yaDeBaja) setListo(true);
            } catch (e) {
                setError(e.message || 'No pudimos procesar el enlace.');
            } finally { setCargando(false); }
        })();
    }, [token]);

    const confirmar = async () => {
        setEnviando(true);
        try {
            const r = await fetch(`${API_BASE_URL}/baja`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ t: token, motivo }),
            });
            const d = await r.json();
            if (!d.success) throw new Error(d.message);
            setListo(true);
        } catch (e) {
            setError(e.message || 'No pudimos procesar tu solicitud.');
        } finally { setEnviando(false); }
    };

    if (cargando) return (
        <Marco>
            <Loader2 className="mx-auto animate-spin text-slate-400" size={26} />
            <p className="text-xs text-slate-400 mt-3">Un momento…</p>
        </Marco>
    );

    if (error) return (
        <Marco>
            <AlertTriangle className="mx-auto text-amber-500" size={30} />
            <h1 className="text-base font-black text-slate-900 mt-3">No pudimos procesar el enlace</h1>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">{error}</p>
            <p className="text-[11px] text-slate-400 mt-4 leading-relaxed">
                Si quieres dejar de recibir nuestros correos, responde al último que te
                enviamos y lo hacemos nosotros.
            </p>
        </Marco>
    );

    if (listo) return (
        <Marco>
            <CheckCircle2 className="mx-auto text-emerald-500" size={34} />
            <h1 className="text-base font-black text-slate-900 mt-3">Listo</h1>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                <b>{datos?.correo}</b> no volverá a recibir nuestros correos informativos.
            </p>
            {/* Se aclara qué SIGUE llegando. Si alguien deja de recibir su factura
                sin saberlo, el problema es peor que el que vino a resolver. */}
            <p className="text-[11px] text-slate-400 mt-4 leading-relaxed">
                Seguirás recibiendo los correos necesarios del servicio que tienes
                contratado, como el envío de tus facturas.
            </p>
        </Marco>
    );

    return (
        <Marco>
            <MailX className="mx-auto text-slate-400" size={30} />
            <h1 className="text-base font-black text-slate-900 mt-3">Cancelar suscripción</h1>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                Vas a dejar de recibir correos informativos en<br />
                <b className="text-slate-900">{datos?.correo}</b>
            </p>

            <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={2}
                placeholder="¿Nos cuentas por qué? (opcional)"
                className="w-full mt-4 bg-slate-50 border border-[#efe8dd] rounded-lg px-3 py-2 text-xs outline-none focus:border-emerald-500 resize-none"
            />

            <button
                onClick={confirmar}
                disabled={enviando}
                className="w-full mt-3 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white rounded-lg h-11 text-[11px] font-black uppercase tracking-widest inline-flex items-center justify-center gap-2"
            >
                {enviando ? <Loader2 size={14} className="animate-spin" /> : null}
                Confirmar y no recibir más
            </button>

            <p className="text-[11px] text-slate-400 mt-4 leading-relaxed">
                Seguirás recibiendo los correos necesarios del servicio que tienes
                contratado, como el envío de tus facturas.
            </p>
        </Marco>
    );
};

export default BajaCorreo;
