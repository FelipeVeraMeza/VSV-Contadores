import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { User, Briefcase, HeartPulse, CreditCard, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTrabajadorApi, getCatalogosApi, updateTrabajadorApi } from '@/services/rrhhService';
import { ThemedSelect } from '@/components/ui/ThemedSelect';

// ISO 'YYYY-MM-DDT..' → 'YYYY-MM-DD' para <input type="date">
const aFecha = (v) => (v ? String(v).slice(0, 10) : '');
const num = (v) => (v === '' || v == null ? '' : v);

// Campos editables que se envían al backend (mismo set de EDITABLES del controlador).
const CAMPOS = [
    'nombres', 'apellidoPaterno', 'apellidoMaterno', 'fechaNacimiento', 'estadoCivil',
    'direccion', 'comuna', 'telefono', 'email', 'discapacidad',
    'saludId', 'planIsapreMonto', 'planIsapreMoneda', 'afpId', 'fechaIngreso', 'fechaTermino',
    'tipoContrato', 'estadoContrato', 'departamento', 'cargo',
    'semanaCorrida', 'tipoSueldoBase', 'sueldoBase', 'gratificacionTipo', 'gratificacionPct',
    'asignacionFamiliarTramo', 'cargasNormales', 'cargasMaternales', 'cargasInvalidas',
    'jubilado', 'afectoSeguroAccidentes', 'seguroCesantia', 'apvIndividual', 'apvColectivo',
    'tipoPago', 'banco', 'tipoCuenta', 'numeroCuenta',
];

const EditarEmpleadoModal = ({ isOpen, setIsOpen, trabajadorId, empresaId }) => {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const sid = user?.sessionId;
    const [form, setForm] = useState(null);

    const { data: ficha, isLoading } = useQuery({
        queryKey: ['trabajador', trabajadorId],
        queryFn: async () => { const r = await getTrabajadorApi(sid, trabajadorId); return r.ok ? r.json() : null; },
        enabled: isOpen && !!sid && !!trabajadorId,
    });
    const { data: catalogos } = useQuery({
        queryKey: ['rem-catalogos'],
        queryFn: async () => { const r = await getCatalogosApi(sid); return r.ok ? r.json() : null; },
        enabled: isOpen && !!sid,
        staleTime: 1000 * 60 * 30,
    });

    useEffect(() => {
        if (!ficha) return;
        setForm({
            rut: ficha.rut || '',
            nombres: ficha.nombres || '', apellidoPaterno: ficha.apellidoPaterno || '', apellidoMaterno: ficha.apellidoMaterno || '',
            fechaNacimiento: aFecha(ficha.fechaNacimiento), estadoCivil: ficha.estadoCivil || '',
            direccion: ficha.direccion || '', comuna: ficha.comuna || '', telefono: ficha.telefono || '', email: ficha.email || '',
            discapacidad: !!ficha.discapacidad,
            saludId: ficha.saludId || '', planIsapreMonto: num(ficha.planIsapreMonto), planIsapreMoneda: ficha.planIsapreMoneda || 'UF',
            afpId: ficha.afpId || '',
            fechaIngreso: aFecha(ficha.fechaIngreso), fechaTermino: aFecha(ficha.fechaTermino),
            tipoContrato: ficha.tipoContrato || '', estadoContrato: ficha.estadoContrato || 'activo',
            departamento: ficha.departamento || '', cargo: ficha.cargo || '',
            semanaCorrida: !!ficha.semanaCorrida,
            tipoSueldoBase: ficha.tipoSueldoBase || 'mes', sueldoBase: num(ficha.sueldoBase),
            gratificacionTipo: ficha.gratificacionTipo || 'no', gratificacionPct: num(ficha.gratificacionPct),
            asignacionFamiliarTramo: ficha.asignacionFamiliarTramo || '',
            cargasNormales: num(ficha.cargasNormales), cargasMaternales: num(ficha.cargasMaternales), cargasInvalidas: num(ficha.cargasInvalidas),
            jubilado: !!ficha.jubilado, afectoSeguroAccidentes: !!ficha.afectoSeguroAccidentes, seguroCesantia: !!ficha.seguroCesantia,
            apvIndividual: !!ficha.apvIndividual, apvColectivo: !!ficha.apvColectivo,
            tipoPago: ficha.tipoPago || '', banco: ficha.banco || '', tipoCuenta: ficha.tipoCuenta || '', numeroCuenta: ficha.numeroCuenta || '',
        });
    }, [ficha]);

    const set = (name, value) => setForm(prev => ({ ...prev, [name]: value }));
    const onChange = (e) => {
        const { name, value, type, checked } = e.target;
        set(name, type === 'checkbox' ? checked : value);
    };

    const guardar = useMutation({
        mutationFn: async () => {
            const payload = {};
            for (const k of CAMPOS) payload[k] = form[k] === '' ? null : form[k];
            const r = await updateTrabajadorApi(sid, trabajadorId, payload);
            const data = await r.json();
            if (!r.ok) throw new Error(data?.message || 'Error al guardar');
            return data;
        },
        onSuccess: (data) => {
            toast({ title: 'Ficha actualizada', description: data?.cambios ? `${data.cambios} cambio(s) guardado(s).` : 'Sin cambios.' });
            queryClient.invalidateQueries({ queryKey: ['trabajadores', empresaId] });
            queryClient.invalidateQueries({ queryKey: ['trabajador', trabajadorId] });
            setIsOpen(false);
        },
        onError: (e) => toast({ title: 'No se pudo guardar', description: e.message, variant: 'destructive' }),
    });

    const afpList = catalogos?.afp || [];
    const saludList = catalogos?.salud || [];

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="sm:max-w-4xl bg-slate-50 backdrop-blur-xl border-[#efe8dd] text-slate-700 max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-2xl">Editar Ficha del Trabajador</DialogTitle>
                    <DialogDescription>{form ? `${form.nombres} ${form.apellidoPaterno || ''} · ${form.rut}` : 'Cargando ficha...'}</DialogDescription>
                </DialogHeader>

                {isLoading || !form ? (
                    <div className="flex justify-center py-20"><Loader2 className="h-10 w-10 animate-spin text-purple-500" /></div>
                ) : (
                    <div className="space-y-6 py-2">
                        {/* Personales */}
                        <section>
                            <h3 className="text-sm font-bold text-cyan-600 flex items-center mb-3"><User className="mr-2 h-4 w-4" />Datos Personales</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div><Label>Nombres</Label><Input name="nombres" value={form.nombres} onChange={onChange} /></div>
                                <div><Label>Apellido Paterno</Label><Input name="apellidoPaterno" value={form.apellidoPaterno} onChange={onChange} /></div>
                                <div><Label>Apellido Materno</Label><Input name="apellidoMaterno" value={form.apellidoMaterno} onChange={onChange} /></div>
                                <div><Label>Fecha Nacimiento</Label><Input type="date" name="fechaNacimiento" value={form.fechaNacimiento} onChange={onChange} /></div>
                                <div><Label>Estado Civil</Label>
                                    <Select name="estadoCivil" value={form.estadoCivil} onChange={onChange} opts={[['', 'Seleccionar...'], ['soltero', 'Soltero(a)'], ['casado', 'Casado(a)'], ['divorciado', 'Divorciado(a)'], ['viudo', 'Viudo(a)'], ['conviviente', 'Conviviente Civil'], ['separado', 'Separado(a)']]} />
                                </div>
                                <div><Label>Comuna</Label><Input name="comuna" value={form.comuna} onChange={onChange} /></div>
                                <div className="md:col-span-2"><Label>Dirección</Label><Input name="direccion" value={form.direccion} onChange={onChange} /></div>
                                <div><Label>Teléfono</Label><Input name="telefono" value={form.telefono} onChange={onChange} /></div>
                                <div><Label>Email</Label><Input type="email" name="email" value={form.email} onChange={onChange} /></div>
                                <Check label="Persona con discapacidad" name="discapacidad" checked={form.discapacidad} onChange={onChange} />
                            </div>
                        </section>

                        {/* Laborales */}
                        <section>
                            <h3 className="text-sm font-bold text-purple-600 flex items-center mb-3"><Briefcase className="mr-2 h-4 w-4" />Datos Laborales</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div><Label>Cargo</Label><Input name="cargo" value={form.cargo} onChange={onChange} /></div>
                                <div><Label>Departamento</Label><Input name="departamento" value={form.departamento} onChange={onChange} /></div>
                                <div><Label>Estado del Contrato</Label>
                                    <Select name="estadoContrato" value={form.estadoContrato} onChange={onChange} opts={[['activo', 'Activo'], ['inactivo', 'Inactivo']]} />
                                </div>
                                <div><Label>Fecha Ingreso</Label><Input type="date" name="fechaIngreso" value={form.fechaIngreso} onChange={onChange} /></div>
                                <div><Label>Fecha Término</Label><Input type="date" name="fechaTermino" value={form.fechaTermino} onChange={onChange} /></div>
                                <div><Label>Tipo de Contrato</Label>
                                    <Select name="tipoContrato" value={form.tipoContrato} onChange={onChange} opts={[['', 'Seleccionar...'], ['indefinido', 'Indefinido'], ['plazo_fijo', 'Plazo Fijo'], ['por_obra', 'Obra o Faena']]} />
                                </div>
                                <div><Label>Tipo Sueldo Base</Label>
                                    <Select name="tipoSueldoBase" value={form.tipoSueldoBase} onChange={onChange} opts={[['mes', 'Mes'], ['mes_comision', 'Mes + comisión'], ['empresarial', 'Empresarial'], ['horas', 'Horas'], ['horas_horas', 'Horas + horas'], ['dias', 'Días']]} />
                                </div>
                                <div><Label>Sueldo Base (CLP)</Label><Input type="number" name="sueldoBase" value={form.sueldoBase} onChange={onChange} /></div>
                                <div><Label>Gratificación</Label>
                                    <Select name="gratificacionTipo" value={form.gratificacionTipo} onChange={onChange} opts={[['no', 'No'], ['porcentaje', 'Porcentaje'], ['tope_475', 'Tope 4,75 IMM']]} />
                                </div>
                                {form.gratificacionTipo === 'porcentaje' && (
                                    <div><Label>Gratificación %</Label><Input type="number" step="0.01" name="gratificacionPct" value={form.gratificacionPct} onChange={onChange} /></div>
                                )}
                                <Check label="Beneficio semana corrida" name="semanaCorrida" checked={form.semanaCorrida} onChange={onChange} />
                            </div>
                        </section>

                        {/* Previsionales */}
                        <section>
                            <h3 className="text-sm font-bold text-rose-400 flex items-center mb-3"><HeartPulse className="mr-2 h-4 w-4" />Datos Previsionales</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div><Label>AFP</Label>
                                    <Select name="afpId" value={form.afpId} onChange={onChange} opts={[['', 'Seleccionar...'], ...afpList.map(a => [a.id, a.nombre])]} />
                                </div>
                                <div><Label>Institución de Salud</Label>
                                    <Select name="saludId" value={form.saludId} onChange={onChange} opts={[['', 'Seleccionar...'], ...saludList.map(s => [s.id, s.nombre])]} />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div><Label>Plan salud</Label><Input type="number" step="0.01" name="planIsapreMonto" value={form.planIsapreMonto} onChange={onChange} /></div>
                                    <div><Label>Moneda</Label><Select name="planIsapreMoneda" value={form.planIsapreMoneda} onChange={onChange} opts={[['UF', 'UF'], ['CLP', 'CLP']]} /></div>
                                </div>
                                <div><Label>Tramo Asig. Familiar</Label>
                                    <Select name="asignacionFamiliarTramo" value={form.asignacionFamiliarTramo} onChange={onChange} opts={[['', 'No'], ['A', 'A'], ['B', 'B'], ['C', 'C'], ['D', 'D']]} />
                                </div>
                                <div><Label>Cargas normales</Label><Input type="number" min="0" name="cargasNormales" value={form.cargasNormales} onChange={onChange} /></div>
                                <div><Label>Cargas maternales</Label><Input type="number" min="0" name="cargasMaternales" value={form.cargasMaternales} onChange={onChange} /></div>
                                <div><Label>Cargas inválidas</Label><Input type="number" min="0" name="cargasInvalidas" value={form.cargasInvalidas} onChange={onChange} /></div>
                                <Check label="Seguro de cesantía" name="seguroCesantia" checked={form.seguroCesantia} onChange={onChange} />
                                <Check label="Afecto a seguro de accidentes" name="afectoSeguroAccidentes" checked={form.afectoSeguroAccidentes} onChange={onChange} />
                                <Check label="Jubilado" name="jubilado" checked={form.jubilado} onChange={onChange} />
                                <Check label="APV individual" name="apvIndividual" checked={form.apvIndividual} onChange={onChange} />
                                <Check label="APV colectivo" name="apvColectivo" checked={form.apvColectivo} onChange={onChange} />
                            </div>
                        </section>

                        {/* Pago */}
                        <section>
                            <h3 className="text-sm font-bold text-emerald-600 flex items-center mb-3"><CreditCard className="mr-2 h-4 w-4" />Datos de Pago</h3>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                <div><Label>Tipo de Pago</Label>
                                    <Select name="tipoPago" value={form.tipoPago} onChange={onChange} opts={[['', 'Seleccionar...'], ['efectivo', 'Efectivo'], ['transferencia', 'Transferencia'], ['cheque', 'Cheque'], ['otro', 'Otro']]} />
                                </div>
                                <div><Label>Banco</Label><Input name="banco" value={form.banco} onChange={onChange} /></div>
                                <div><Label>Tipo de Cuenta</Label><Input name="tipoCuenta" value={form.tipoCuenta} onChange={onChange} /></div>
                                <div><Label>N° de Cuenta</Label><Input name="numeroCuenta" value={form.numeroCuenta} onChange={onChange} /></div>
                            </div>
                        </section>
                    </div>
                )}

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsOpen(false)} className="border-[#efe8dd] text-slate-700 hover:bg-slate-100">Cancelar</Button>
                    <Button type="button" onClick={() => guardar.mutate()} disabled={!form || guardar.isPending} className="bg-gradient-to-r from-purple-500 to-violet-600 text-white">
                        {guardar.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Guardando...</> : 'Guardar Cambios'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

// Select reutilizable (Radix, tema oscuro). Una opción con value '' se usa como placeholder.
const Select = ({ name, value, onChange, opts }) => {
    const placeholder = opts.find(([v]) => v === '' || v == null);
    const items = opts.filter(([v]) => v !== '' && v != null).map(([v, l]) => ({ value: v, label: l }));
    return (
        <ThemedSelect
            value={value}
            onChange={(v) => onChange({ target: { name, value: v } })}
            options={items}
            placeholder={placeholder ? placeholder[1] : 'Seleccionar…'}
        />
    );
};

const Check = ({ label, name, checked, onChange }) => (
    <label className={`flex items-center gap-2.5 text-sm cursor-pointer rounded-lg border px-3 h-10 transition ${checked ? 'border-purple-500/40 bg-purple-500/10 text-purple-700' : 'border-[#efe8dd] bg-white text-slate-600 hover:bg-slate-100'}`}>
        <input type="checkbox" name={name} checked={checked} onChange={onChange} className="h-4 w-4 rounded accent-purple-500 [color-scheme:light]" />
        <span className="leading-tight">{label}</span>
    </label>
);

export default EditarEmpleadoModal;
