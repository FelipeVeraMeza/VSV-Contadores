import React, { useState } from 'react';
import { FileText, Loader2, Printer, BadgeCheck, Coins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { getCertificadoApi } from '@/services/rrhhService';
import TrabajadorSelect from '@/components/rrhh/TrabajadorSelect';

const CERTIFICADOS = [
    { tipo: 'antiguedad', titulo: 'Certificado de Antigüedad Laboral', desc: 'Acredita el cargo, la fecha de ingreso y el tipo de contrato del trabajador.', icon: BadgeCheck, color: 'from-blue-500 to-indigo-600' },
    { tipo: 'renta', titulo: 'Certificado de Renta', desc: 'Detalla las remuneraciones (imponible, haberes y líquido) de los últimos períodos aprobados/pagados.', icon: Coins, color: 'from-emerald-500 to-green-600' },
];

const CertificadosRrhh = ({ empresaId }) => {
    const { user } = useAuth();
    const sid = user?.sessionId;
    const [trabajadorId, setTrabajadorId] = useState('');
    const [generando, setGenerando] = useState('');

    const generar = async (tipo) => {
        if (!trabajadorId) { toast({ title: 'Selecciona un trabajador', variant: 'destructive' }); return; }
        const w = window.open('', '_blank');
        if (!w) { toast({ title: 'Permite las ventanas emergentes', variant: 'destructive' }); return; }
        w.document.write('<p style="font-family:Arial;padding:24px;color:#475569">Generando certificado…</p>');
        setGenerando(tipo);
        try {
            const r = await getCertificadoApi(sid, trabajadorId, tipo);
            const d = await r.json().catch(() => ({}));
            if (!r.ok) { w.close(); toast({ title: 'No se pudo generar', description: d?.message, variant: 'destructive' }); return; }
            w.document.open(); w.document.write(d.html); w.document.close(); w.focus();
            setTimeout(() => w.print(), 350);
        } catch { w.close(); toast({ title: 'Error al generar el certificado', variant: 'destructive' }); }
        finally { setGenerando(''); }
    };

    return (
        <div className="space-y-5">
            <div className="w-full lg:w-96">
                <TrabajadorSelect value={trabajadorId} onChange={setTrabajadorId} empresaId={empresaId} />
            </div>

            {!trabajadorId ? (
                <div className="flex flex-col items-center text-gray-500 py-20">
                    <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center mb-4"><FileText className="h-6 w-6 text-purple-400/60" /></div>
                    <h3 className="text-base font-semibold text-white">Elige un trabajador</h3>
                    <p className="text-sm mt-1">Selecciona un trabajador para emitir sus certificados.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {CERTIFICADOS.map(c => {
                        const Icon = c.icon;
                        return (
                            <div key={c.tipo} className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 flex flex-col">
                                <div className="flex items-start gap-3 mb-3">
                                    <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${c.color} flex items-center justify-center flex-shrink-0`}><Icon className="h-5 w-5 text-white" /></div>
                                    <div><h3 className="text-base font-bold text-white">{c.titulo}</h3><p className="text-xs text-gray-400 mt-0.5">{c.desc}</p></div>
                                </div>
                                <Button onClick={() => generar(c.tipo)} disabled={generando === c.tipo} className="mt-auto bg-white/[0.05] border border-white/10 text-white hover:bg-white/[0.1] h-10">
                                    {generando === c.tipo ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Printer className="h-4 w-4 mr-2" />}Generar y descargar
                                </Button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default CertificadosRrhh;
