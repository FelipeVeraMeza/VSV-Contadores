import React, { useState, useEffect } from 'react';
import { Percent, Save, Loader2, AlertTriangle, Calendar, BookCopy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getParametrosApi, upsertParametrosApi, getCatalogosApi, updateAfpApi,
    getConfigEmpresaApi, updateConfigEmpresaApi, getPlanCuentasApi } from '@/services/rrhhService';
import { ThemedSelect } from '@/components/ui/ThemedSelect';

const mesActual = () => new Date().toISOString().slice(0, 7);

const CUENTAS = [
    { k: 'cuentaSueldos', label: 'Remuneraciones (gasto)' },
    { k: 'cuentaAportes', label: 'Aportes patronales (gasto)' },
    { k: 'cuentaLiquidoPagar', label: 'Líquido por pagar' },
    { k: 'cuentaAfp', label: 'AFP / previsión por pagar' },
    { k: 'cuentaSalud', label: 'Salud por pagar' },
    { k: 'cuentaCesantia', label: 'Cesantía por pagar' },
    { k: 'cuentaImpuesto', label: 'Impuesto único por pagar' },
    { k: 'cuentaMutual', label: 'Mutual por pagar' },
    { k: 'cuentaOtrosDesc', label: 'Otros descuentos por pagar' },
];

const CAMPOS = [
    { k: 'uf', label: 'UF', step: '0.01' },
    { k: 'utm', label: 'UTM', step: '0.01' },
    { k: 'uta', label: 'UTA', step: '0.01' },
    { k: 'sueldoMinimo', label: 'Sueldo mínimo (IMM)', step: '1' },
    { k: 'topeImponibleAfpUf', label: 'Tope imponible AFP/salud (UF)', step: '0.01' },
    { k: 'topeImponibleCesantiaUf', label: 'Tope imponible cesantía (UF)', step: '0.01' },
    { k: 'tasaSis', label: 'Tasa SIS (%)', step: '0.01' },
    { k: 'tasaCesantiaTrabajador', label: 'Cesantía trabajador (%)', step: '0.01' },
    { k: 'tasaCesantiaEmpleadorIndef', label: 'Cesantía empleador indefinido (%)', step: '0.01' },
    { k: 'tasaCesantiaEmpleadorPlazo', label: 'Cesantía empleador plazo fijo (%)', step: '0.01' },
];

const ConfiguracionRrhh = ({ empresaId }) => {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const sid = user?.sessionId;
    const [periodo, setPeriodo] = useState(mesActual());
    const [form, setForm] = useState({});
    const [afpEdits, setAfpEdits] = useState({});
    const [cuentasForm, setCuentasForm] = useState({});

    const { data: config } = useQuery({
        queryKey: ['rem-config-empresa', empresaId],
        queryFn: async () => { const r = await getConfigEmpresaApi(sid, empresaId); return r.ok ? r.json() : null; },
        enabled: !!sid && !!empresaId,
    });
    const { data: planCuentas = [] } = useQuery({
        queryKey: ['rem-plan-cuentas', empresaId],
        queryFn: async () => { const r = await getPlanCuentasApi(sid, empresaId); return r.ok ? r.json() : []; },
        enabled: !!sid && !!empresaId,
    });

    const { data: paramData, isLoading } = useQuery({
        queryKey: ['rem-parametros', periodo],
        queryFn: async () => { const r = await getParametrosApi(sid, periodo); return r.ok ? r.json() : null; },
        enabled: !!sid,
    });
    const { data: catalogos } = useQuery({
        queryKey: ['rem-catalogos'],
        queryFn: async () => { const r = await getCatalogosApi(sid); return r.ok ? r.json() : null; },
        enabled: !!sid,
    });

    useEffect(() => {
        if (!paramData) return;
        const p = paramData.parametro || {};
        const f = {};
        for (const { k } of CAMPOS) f[k] = p[k] ?? '';
        setForm(f);
    }, [paramData]);

    useEffect(() => {
        if (catalogos?.afp) setAfpEdits(Object.fromEntries(catalogos.afp.map(a => [a.id, a.tasaComision])));
    }, [catalogos]);

    useEffect(() => {
        if (!config) return;
        const f = { tasaMutual: config.tasaMutual ?? '', mutual: config.mutual ?? '', moneda: config.moneda ?? 'CLP', gratificacionDefault: config.gratificacionDefault ?? 'tope_475' };
        for (const { k } of CUENTAS) f[k] = config[k] ?? '';
        setCuentasForm(f);
    }, [config]);

    const guardarParametros = useMutation({
        mutationFn: async () => {
            const r = await upsertParametrosApi(sid, { periodo, ...form });
            if (!r.ok) throw new Error((await r.json())?.message || 'Error');
            return r.json();
        },
        onSuccess: () => {
            toast({ title: 'Indicadores guardados', description: `Período ${periodo}.` });
            queryClient.invalidateQueries({ queryKey: ['rem-parametros', periodo] });
        },
        onError: (e) => toast({ title: 'No se pudo guardar', description: e.message, variant: 'destructive' }),
    });

    const guardarAfp = useMutation({
        mutationFn: async () => {
            const originales = Object.fromEntries((catalogos?.afp || []).map(a => [a.id, a.tasaComision]));
            const cambios = Object.entries(afpEdits).filter(([id, v]) => String(v) !== String(originales[id]));
            for (const [id, v] of cambios) {
                const r = await updateAfpApi(sid, id, Number(v));
                if (!r.ok) throw new Error('Error al actualizar AFP');
            }
            return cambios.length;
        },
        onSuccess: (n) => {
            toast({ title: 'Comisiones AFP guardadas', description: `${n} cambio(s).` });
            queryClient.invalidateQueries({ queryKey: ['rem-catalogos'] });
        },
        onError: (e) => toast({ title: 'No se pudo guardar', description: e.message, variant: 'destructive' }),
    });

    const guardarCuentas = useMutation({
        mutationFn: async () => {
            const r = await updateConfigEmpresaApi(sid, { empresaId, ...cuentasForm });
            if (!r.ok) throw new Error((await r.json())?.message || 'Error');
            return r.json();
        },
        onSuccess: () => {
            toast({ title: 'Cuentas contables guardadas' });
            queryClient.invalidateQueries({ queryKey: ['rem-config-empresa', empresaId] });
        },
        onError: (e) => toast({ title: 'No se pudo guardar', description: e.message, variant: 'destructive' }),
    });

    const setField = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
    const setCuenta = (k, v) => setCuentasForm(prev => ({ ...prev, [k]: v }));
    const cuentaOptions = planCuentas.map(c => ({ value: c.codigo, label: `${c.codigo} — ${c.descripcion}` }));

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Calendar className="h-5 w-5 text-purple-400" />
                    <Label className="text-white">Período</Label>
                    <Input type="month" value={periodo} onChange={e => setPeriodo(e.target.value)} className="w-44" />
                </div>
            </div>

            {paramData && !paramData.esDelPeriodo && (
                <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-yellow-300 text-sm">
                    <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>Este período aún no tiene indicadores propios; se muestran los del período anterior como base. Ajusta y guarda para fijarlos en <b>{periodo}</b>.</span>
                </div>
            )}

            <div className="flex items-start gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-300 text-xs">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>Estos valores alimentan directamente el cálculo de liquidaciones. Cárgalos con los valores oficiales del período (UF, UTM, mínimo, topes y tasas) antes de aprobar sueldos.</span>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-purple-500" /></div>
            ) : (
                <div className="bg-white/5 rounded-xl border border-white/10 p-6">
                    <h3 className="text-sm font-bold text-cyan-400 mb-4">Indicadores previsionales — {periodo}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {CAMPOS.map(({ k, label, step }) => (
                            <div key={k}>
                                <Label className="text-xs">{label}</Label>
                                <Input type="number" step={step} value={form[k] ?? ''} onChange={e => setField(k, e.target.value)} />
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-end mt-5">
                        <Button onClick={() => guardarParametros.mutate()} disabled={guardarParametros.isPending} className="bg-gradient-to-r from-purple-500 to-violet-600 text-white">
                            {guardarParametros.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}Guardar indicadores
                        </Button>
                    </div>
                </div>
            )}

            <div className="bg-white/5 rounded-xl border border-white/10 p-6">
                <h3 className="text-sm font-bold text-rose-400 mb-1 flex items-center"><Percent className="h-4 w-4 mr-2" />Comisiones AFP</h3>
                <p className="text-xs text-gray-500 mb-4">Descuento AFP = 10% obligatorio + comisión de administración.</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {(catalogos?.afp || []).map(a => (
                        <div key={a.id}>
                            <Label className="text-xs">{a.nombre}</Label>
                            <div className="flex items-center gap-1">
                                <Input type="number" step="0.01" value={afpEdits[a.id] ?? ''} onChange={e => setAfpEdits(prev => ({ ...prev, [a.id]: e.target.value }))} />
                                <span className="text-gray-500 text-sm">%</span>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="flex justify-end mt-5">
                    <Button onClick={() => guardarAfp.mutate()} disabled={guardarAfp.isPending} className="bg-gradient-to-r from-rose-500 to-pink-600 text-white">
                        {guardarAfp.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}Guardar comisiones
                    </Button>
                </div>
            </div>

            {/* Cuentas contables (centralización) */}
            <div className="bg-white/5 rounded-xl border border-white/10 p-6">
                <h3 className="text-sm font-bold text-indigo-400 mb-1 flex items-center"><BookCopy className="h-4 w-4 mr-2" />Cuentas contables (centralización)</h3>
                <p className="text-xs text-gray-500 mb-4">
                    Cuentas del plan a las que se imputa el asiento de la nómina.{' '}
                    {planCuentas.length ? `${planCuentas.length} cuentas disponibles en el plan.` : 'Esta empresa no tiene plan de cuentas cargado; ingresa los códigos manualmente.'}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {CUENTAS.map(({ k, label }) => (
                        <div key={k}>
                            <Label className="text-xs">{label}</Label>
                            {cuentaOptions.length
                                ? <ThemedSelect value={cuentasForm[k]} onChange={(v) => setCuenta(k, v)} options={cuentaOptions} placeholder="Cuenta…" />
                                : <Input value={cuentasForm[k] ?? ''} onChange={e => setCuenta(k, e.target.value)} placeholder="Código de cuenta" />}
                        </div>
                    ))}
                    <div>
                        <Label className="text-xs">Tasa mutual (%)</Label>
                        <Input type="number" step="0.01" value={cuentasForm.tasaMutual ?? ''} onChange={e => setCuenta('tasaMutual', e.target.value)} />
                    </div>
                </div>
                <div className="flex justify-end mt-5">
                    <Button onClick={() => guardarCuentas.mutate()} disabled={guardarCuentas.isPending} className="bg-gradient-to-r from-indigo-500 to-blue-600 text-white">
                        {guardarCuentas.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}Guardar cuentas
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default ConfiguracionRrhh;
