// ============================================================================
// DESCARGAR EL PDF DE UN FOLIO RECIÉN EMITIDO
// ----------------------------------------------------------------------------
// En el cuadro de «¡Proceso Finalizado!» estaba solo «Volver al CRM». Si la
// descarga automática no salió —o se cerró la pestaña sin querer— la única
// forma de recuperar el documento era ir a buscarlo al SII a mano.
//
// OJO CON EL TIEMPO: no hay copia guardada del PDF. El servidor levanta el
// robot, entra al SII, busca el folio y lo trae; eso tarda entre 30 y 90
// segundos. Por eso el botón avisa cuánto puede demorar ANTES de apretarlo y
// queda con un indicador mientras trabaja: sin eso parece que se colgó y la
// gente lo aprieta tres veces.
// ============================================================================
import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import * as apiDTE from "@/services/apiDTE.js";

// El servidor manda el nombre en la cabecera; si no llega, se arma uno.
const nombreDesdeCabecera = (res, respaldo) => {
    const cd = res.headers.get('Content-Disposition') || '';
    const m = cd.match(/filename="?([^"]+)"?/i);
    return m?.[1] || respaldo;
};

const BotonDescargarFolio = ({ folio, tipo = 33, etiqueta = "Descargar factura" }) => {
    const [bajando, setBajando] = useState(false);

    const descargar = async () => {
        if (!folio) return;
        setBajando(true);
        try {
            const res = await apiDTE.descargarPdfFolio(folio, tipo);
            if (!res.ok) {
                // El servidor responde JSON con el motivo cuando falla, en vez de
                // un PDF roto: así se puede decir qué pasó.
                const d = await res.json().catch(() => ({}));
                throw new Error(d.error || `El SII no devolvió el documento (HTTP ${res.status}).`);
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = nombreDesdeCabecera(res, `${tipo === 34 ? 'Exenta' : 'Factura'}_${folio}.pdf`);
            a.click();
            URL.revokeObjectURL(url);
            toast({ title: "Documento descargado", description: `Folio ${folio}. Búscalo en las descargas del navegador.` });
        } catch (e) {
            toast({
                variant: "destructive",
                title: "No se pudo descargar",
                description: `${e.message} La factura YA fue emitida: esto es solo la copia en PDF.`,
                duration: 12000,
            });
        } finally {
            setBajando(false);
        }
    };

    return (
        <Button
            onClick={descargar}
            disabled={bajando || !folio}
            title="Va a buscar el documento al SII en el momento. Tarda entre 30 y 90 segundos."
            className="bg-white hover:bg-slate-50 border border-[#efe8dd] text-slate-700 w-full rounded-xl font-black uppercase tracking-widest h-14 inline-flex items-center justify-center gap-2"
        >
            {bajando
                ? <><Loader2 className="animate-spin" size={18} /> Buscándola en el SII…</>
                : <><Download size={18} /> {etiqueta}</>}
        </Button>
    );
};

export default BotonDescargarFolio;
