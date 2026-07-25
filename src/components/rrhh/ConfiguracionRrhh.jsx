import React, { useState, useEffect, useMemo } from 'react';
import { Percent, Save, Loader2, AlertTriangle, Calendar, BookCopy, HeartPulse, ListChecks, Building2, ShieldCheck, Search, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getParametrosApi, upsertParametrosApi, getCatalogosApi, updateAfpApi,
    getConfigEmpresaApi, updateConfigEmpresaApi, getPlanCuentasApi } from '@/services/rrhhService';
import { ThemedSelect } from '@/components/ui/ThemedSelect';
import EmpresaPicker from '@/components/rrhh/EmpresaPicker';

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

// Card contenedora
const Card = ({ icon: Icon, color, titulo, desc, children }) => (
    <div className="bg-white/[0.02] rounded-2xl border border-white/10 p-6">
        <h3 className={`text-sm font-bold ${color} mb-1 flex items-center`}><Icon className="h-4 w-4 mr-2" />{titulo}</h3>
        {desc && <p className="text-xs text-gray-500 mb-4">{desc}</p>}
        {children}
    </div>
);

// Pide una empresa cuando la sección la necesita.
const PideEmpresa = ({ texto }) => (
    <div className="flex flex-col items-center gap-3 py-10">
        <EmpresaPicker />
        <p className="text-xs text-gray-500">{texto}</p>
    </div>
);

const SeccionConfig = ({ empresaId, seccion = 'parametros' }) => {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const sid = user?.sessionId;
    const [periodo, setPeriodo] = useState(mesActual());
    const [form, setForm] = useState({});
    const [afpEdits, setAfpEdits] = useState({});
    const [cfgForm, setCfgForm] = useState({});
    const [qConcepto, setQConcepto] = useState('');
    const [natFiltro, setNatFiltro] = useState('');

    const necesitaEmpresa = ['mapeo', 'mutual', 'empresa'].includes(seccion);

    const { data: config } = useQuery({
        queryKey: ['rem-config-empresa', empresaId],
        queryFn: async () => { const r = await getConfigEmpresaApi(sid, empresaId); return r.ok ? r.json() : null; },
        enabled: !!sid && !!empresaId && necesitaEmpresa,
    });
    const { data: planCuentas = [] } = useQuery({
        queryKey: ['rem-plan-cuentas', empresaId],
        queryFn: async () => { const r = await getPlanCuentasApi(sid, empresaId); return r.ok ? r.json() : []; },
        enabled: !!sid && !!empresaId && seccion === 'mapeo',
    });
    const { data: paramData, isLoading: loadingParam } = useQuery({
        queryKey: ['rem-parametros', periodo],
        queryFn: async () => { const r = await getParametrosApi(sid, periodo); return r.ok ? r.json() : null; },
        enabled: !!sid && seccion === 'parametros',
    });
    const { data: catalogos } = useQuery({
        queryKey: ['rem-catalogos'],
        queryFn: async () => { const r = await getCatalogosApi(sid); return r.ok ? r.json() : null; },
        enabled: !!sid && ['afp', 'isapres', 'conceptos'].includes(seccion),
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
        setCfgForm(f);
    }, [config]);

    const setField = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
    const setCfg = (k, v) => setCfgForm(prev => ({ ...prev, [k]: v }));
    const cuentaOptions = planCuentas.map(c => ({ value: c.codigo, label: `${c.codigo} — ${c.descripcion}` }));

    const guardarParametros = useMutation({
        mutationFn: async () => { const r = await upsertParametrosApi(sid, { periodo, ...form }); if (!r.ok) throw new Error((await r.json())?.message || 'Error'); return r.json(); },
        onSuccess: () => { toast({ title: 'Indicadores guardados', description: `Período ${periodo}.` }); queryClient.invalidateQueries({ queryKey: ['rem-parametros', periodo] }); },
        onError: (e) => toast({ title: 'No se pudo guardar', description: e.message, variant: 'destructive' }),
    });
    const guardarAfp = useMutation({
        mutationFn: async () => {
            const originales = Object.fromEntries((catalogos?.afp || []).map(a => [a.id, a.tasaComision]));
            const cambios = Object.entries(afpEdits).filter(([id, v]) => String(v) !== String(originales[id]));
            for (const [id, v] of cambios) { const r = await updateAfpApi(sid, id, Number(v)); if (!r.ok) throw new Error('Error al actualizar AFP'); }
            return cambios.length;
        },
        onSuccess: (n) => { toast({ title: 'Comisiones AFP guardadas', description: `${n} cambio(s).` }); queryClient.invalidateQueries({ queryKey: ['rem-catalogos'] }); },
        onError: (e) => toast({ title: 'No se pudo guardar', description: e.message, variant: 'destructive' }),
    });
    // Guarda solo los campos indicados de la config de empresa (merge seguro en backend).
    const guardarConfig = useMutation({
        mutationFn: async (campos) => {
            const payload = { empresaId };
            for (const k of campos) payload[k] = cfgForm[k];
            const r = await updateConfigEmpresaApi(sid, payload);
            if (!r.ok) throw new Error((await r.json())?.message || 'Error');
            return r.json();
        },
        onSuccess: () => { toast({ title: 'Configuración guardada' }); queryClient.invalidateQueries({ queryKey: ['rem-config-empresa', empresaId] }); },
        onError: (e) => toast({ title: 'No se pudo guardar', description: e.message, variant: 'destructive' }),
    });

    // ── Catálogos derivados ─────────────────────────────────────────────────
    const isapres = useMemo(() => (catalogos?.salud || []).filter(s => s.tipo === 'ISAPRE'), [catalogos]);
    const conceptos = useMemo(() => {
        const q = qConcepto.trim().toLowerCase();
        return (catalogos?.conceptos || []).filter(c =>
            (!natFiltro || c.naturaleza === natFiltro) &&
            (!q || `${c.codigo} ${c.descripcion}`.toLowerCase().includes(q)));
    }, [catalogos, qConcepto, natFiltro]);

    // ── Render por sección ──────────────────────────────────────────────────
    if (seccion === 'parametros') {
        return (
            <div className="space-y-5">
                <div className="flex items-center gap-3">
                    <Calendar className="h-5 w-5 text-purple-400" />
                    <Label className="text-white">Período</Label>
                    <Input type="month" value={periodo} onChange={e => setPeriodo(e.target.value)} className="w-44 bg-white/[0.04] border-white/10" />
                </div>
                {paramData && !paramData.esDelPeriodo && (
                    <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-yellow-300 text-sm">
                        <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span>Este período aún no tiene indicadores propios; se muestran los del anterior como base. Ajusta y guarda para fijarlos en <b>{periodo}</b>.</span>
                    </div>
                )}
                <div className="flex items-start gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-300 text-xs">
                    <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>Estos valores alimentan el cálculo de liquidaciones. Cárgalos con los valores oficiales del período antes de aprobar sueldos.</span>
                </div>
                {loadingParam ? <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-purple-500" /></div> : (
                    <Card icon={Calendar} color="text-cyan-400" titulo={`Indicadores previsionales — ${periodo}`}>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {CAMPOS.map(({ k, label, step }) => (
                                <div key={k}><Label className="text-xs">{label}</Label>
                                    <Input type="number" step={step} value={form[k] ?? ''} onChange={e => setField(k, e.target.value)} className="bg-white/[0.04] border-white/10" /></div>
                            ))}
                        </div>
                        <div className="flex justify-end mt-5">
                            <Button onClick={() => guardarParametros.mutate()} disabled={guardarParametros.isPending} className="bg-gradient-to-r from-purple-500 to-violet-600 text-white">
                                {guardarParametros.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}Guardar indicadores
                            </Button>
                        </div>
                    </Card>
                )}
            </div>
        );
    }

    if (seccion === 'afp') {
        return (
            <Card icon={Percent} color="text-rose-400" titulo="Comisiones AFP" desc="Descuento AFP = 10% obligatorio + comisión de administración.">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {(catalogos?.afp || []).map(a => (
                        <div key={a.id}><Label className="text-xs">{a.nombre}</Label>
                            <div className="flex items-center gap-1">
                                <Input type="number" step="0.01" value={afpEdits[a.id] ?? ''} onChange={e => setAfpEdits(prev => ({ ...prev, [a.id]: e.target.value }))} className="bg-white/[0.04] border-white/10" />
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
            </Card>
        );
    }

    if (seccion === 'isapres') {
        return (
            <Card icon={HeartPulse} color="text-pink-400" titulo="Isapres" desc="Catálogo de instituciones de salud disponibles al crear un trabajador.">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {isapres.map(s => (
                        <div key={s.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 text-sm text-gray-200">
                            <HeartPulse className="h-3.5 w-3.5 text-pink-400 flex-shrink-0" />{s.nombre}
                        </div>
                    ))}
                </div>
                <p className="text-[11px] text-gray-600 mt-4">La edición del catálogo de isapres estará disponible próximamente.</p>
            </Card>
        );
    }

    if (seccion === 'conceptos') {
        return (
            <Card icon={ListChecks} color="text-violet-400" titulo="Conceptos (Haberes y Descuentos)" desc="Catálogo de conceptos con su tratamiento tributario (imponible / tributable / gratificación).">
                <div className="flex flex-col sm:flex-row gap-2 mb-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                        <input value={qConcepto} onChange={e => setQConcepto(e.target.value)} placeholder="Buscar por código o descripción…"
                            className="w-full bg-white/[0.04] border border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/40" />
                    </div>
                    <div className="w-full sm:w-44">
                        <ThemedSelect value={natFiltro} onChange={(v) => setNatFiltro(v === '__all__' ? '' : v)} placeholder="Naturaleza"
                            options={[{ value: '__all__', label: 'Todos' }, { value: 'HABER', label: 'Haberes' }, { value: 'DESCUENTO', label: 'Descuentos' }]} />
                    </div>
                </div>
                <div className="rounded-xl border border-white/10 overflow-hidden">
                    <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
                        <table className="w-full text-sm">
                            <thead className="sticky top-0">
                                <tr className="bg-[#161425] text-gray-500">
                                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider">Código</th>
                                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider">Descripción</th>
                                    <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider">Naturaleza</th>
                                    <th className="px-4 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider">Imp.</th>
                                    <th className="px-4 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider">Trib.</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.06]">
                                {conceptos.map(c => (
                                    <tr key={c.id} className="hover:bg-white/[0.03]">
                                        <td className="px-4 py-2 font-mono text-xs text-gray-400">{c.codigo}</td>
                                        <td className="px-4 py-2 text-gray-200">{c.descripcion}{c.obsoleto && <span className="ml-2 text-[9px] uppercase text-amber-500/70">obsoleto</span>}</td>
                                        <td className="px-4 py-2"><span className={`inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-md ${c.naturaleza === 'DESCUENTO' ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>{c.naturaleza === 'DESCUENTO' ? 'Descuento' : 'Haber'}</span></td>
                                        <td className="px-4 py-2 text-center">{c.imponible ? '✓' : '—'}</td>
                                        <td className="px-4 py-2 text-center">{c.tributable ? '✓' : '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
                <p className="text-[11px] text-gray-600 mt-4">La edición de flags y la creación de conceptos personalizados estarán disponibles próximamente.</p>
            </Card>
        );
    }

    // Secciones por empresa: mutual, mapeo, empresa
    if (necesitaEmpresa && !empresaId) {
        return <Card icon={Building2} color="text-indigo-400" titulo="Configuración por empresa" desc="Esta sección se configura por empresa."><PideEmpresa texto="Elige una empresa para configurar esta sección." /></Card>;
    }

    if (seccion === 'mutual') {
        return (
            <Card icon={ShieldCheck} color="text-amber-400" titulo="Mutual / Seguro de accidentes" desc="Organismo administrador y tasa de cotización (base + adicional) del seguro de la Ley 16.744.">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><Label className="text-xs">Mutual / organismo</Label>
                        <Input value={cfgForm.mutual ?? ''} onChange={e => setCfg('mutual', e.target.value)} placeholder="Ej: ACHS, Mutual de Seguridad, IST…" className="bg-white/[0.04] border-white/10" /></div>
                    <div><Label className="text-xs">Tasa mutual (%)</Label>
                        <Input type="number" step="0.01" value={cfgForm.tasaMutual ?? ''} onChange={e => setCfg('tasaMutual', e.target.value)} className="bg-white/[0.04] border-white/10" /></div>
                </div>
                <div className="flex justify-end mt-5">
                    <Button onClick={() => guardarConfig.mutate(['mutual', 'tasaMutual'])} disabled={guardarConfig.isPending} className="bg-gradient-to-r from-amber-500 to-orange-600 text-white">
                        {guardarConfig.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}Guardar mutual
                    </Button>
                </div>
            </Card>
        );
    }

    if (seccion === 'empresa') {
        return (
            <Card icon={Building2} color="text-cyan-400" titulo="Configuración de la empresa" desc="Parámetros de nómina por defecto para esta empresa.">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><Label className="text-xs">Moneda</Label>
                        <ThemedSelect value={cfgForm.moneda ?? 'CLP'} onChange={(v) => setCfg('moneda', v)} options={[{ value: 'CLP', label: 'Peso chileno (CLP)' }, { value: 'USD', label: 'Dólar (USD)' }, { value: 'UF', label: 'UF' }]} /></div>
                    <div><Label className="text-xs">Gratificación por defecto</Label>
                        <ThemedSelect value={cfgForm.gratificacionDefault ?? 'tope_475'} onChange={(v) => setCfg('gratificacionDefault', v)}
                            options={[{ value: 'no', label: 'No aplica' }, { value: 'tope_475', label: 'Tope 4,75 IMM' }, { value: 'porcentaje', label: 'Porcentaje (25%)' }]} /></div>
                </div>
                <div className="flex justify-end mt-5">
                    <Button onClick={() => guardarConfig.mutate(['moneda', 'gratificacionDefault'])} disabled={guardarConfig.isPending} className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white">
                        {guardarConfig.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}Guardar configuración
                    </Button>
                </div>
            </Card>
        );
    }

    // seccion === 'mapeo'
    return (
        <Card icon={BookCopy} color="text-indigo-400" titulo="Mapeo contable (centralización)" desc="Cuentas del plan a las que se imputa el asiento de la nómina de esta empresa.">
            <p className="text-xs text-gray-500 mb-3">{planCuentas.length ? `${planCuentas.length} cuentas disponibles en el plan.` : 'Esta empresa no tiene plan de cuentas cargado; ingresa los códigos manualmente.'}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {CUENTAS.map(({ k, label }) => (
                    <div key={k}><Label className="text-xs">{label}</Label>
                        {cuentaOptions.length
                            ? <ThemedSelect value={cfgForm[k]} onChange={(v) => setCfg(k, v)} options={cuentaOptions} placeholder="Cuenta…" />
                            : <Input value={cfgForm[k] ?? ''} onChange={e => setCfg(k, e.target.value)} placeholder="Código de cuenta" className="bg-white/[0.04] border-white/10" />}
                    </div>
                ))}
            </div>
            <div className="flex justify-end mt-5">
                <Button onClick={() => guardarConfig.mutate(CUENTAS.map(c => c.k))} disabled={guardarConfig.isPending} className="bg-gradient-to-r from-indigo-500 to-blue-600 text-white">
                    {guardarConfig.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}Guardar cuentas
                </Button>
            </div>
        </Card>
    );
};

// Pestañas de la página de Configuración (una sola página, secciones internas).
const TABS = [
    { id: 'parametros', label: 'Parámetros previsionales', icon: Settings },
    { id: 'afp', label: 'AFP', icon: Percent },
    { id: 'isapres', label: 'Isapres', icon: HeartPulse },
    { id: 'mutual', label: 'Mutual', icon: ShieldCheck },
    { id: 'conceptos', label: 'Conceptos', icon: ListChecks },
    { id: 'mapeo', label: 'Mapeo contable', icon: BookCopy },
    { id: 'empresa', label: 'Empresa', icon: Building2 },
];

// Si se pasa `seccion`, renderiza solo esa sección (deep-link). Si no, muestra
// la página completa con la barra de pestañas.
const ConfiguracionRrhh = ({ empresaId, seccion }) => {
    const [tab, setTab] = useState('parametros');
    if (seccion) return <SeccionConfig empresaId={empresaId} seccion={seccion} />;
    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-white/[0.03] border border-white/10 w-fit max-w-full overflow-x-auto">
                {TABS.map(t => {
                    const Icon = t.icon;
                    const activo = tab === t.id;
                    return (
                        <button key={t.id} onClick={() => setTab(t.id)}
                            className={`inline-flex items-center gap-2 px-3.5 h-9 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${activo ? 'bg-gradient-to-r from-purple-500 to-violet-600 text-white shadow' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                            <Icon className="h-4 w-4" />{t.label}
                        </button>
                    );
                })}
            </div>
            <SeccionConfig empresaId={empresaId} seccion={tab} />
        </div>
    );
};

export default ConfiguracionRrhh;
