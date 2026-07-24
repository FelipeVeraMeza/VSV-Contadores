import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { User, Briefcase, HeartPulse, Loader2 } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCatalogosApi, createTrabajadorApi } from '@/services/rrhhService';
import { ThemedSelect } from '@/components/ui/ThemedSelect';

const ESTADO_INICIAL = {
    nombre: '', rut: '', fechaNacimiento: '', direccion: '', comuna: '', telefono: '', email: '',
    estadoCivil: '', cargasFamiliares: 0,
    fechaInicio: '', cargo: '', tipoContrato: '', sueldoBase: 0,
    previsionSalud: 'fonasa', isapreId: '', planIsapreUF: '', afp: '', apv: 0,
};

const NuevoEmpleadoModal = ({ isOpen, setIsOpen, onAddEmpleado, empresaId }) => {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState(ESTADO_INICIAL);

    // Catálogos reales (AFP + isapres) desde la BD.
    const { data: catalogos } = useQuery({
        queryKey: ['rem-catalogos'],
        queryFn: async () => {
            const res = await getCatalogosApi(user?.sessionId);
            if (!res.ok) throw new Error('Error catálogos');
            return res.json();
        },
        enabled: isOpen && !!user?.sessionId,
        staleTime: 1000 * 60 * 30,
    });

    const afpList = catalogos?.afp || [];
    const fonasa = useMemo(() => (catalogos?.salud || []).find(s => s.tipo === 'FONASA'), [catalogos]);
    const isapres = useMemo(() => (catalogos?.salud || []).filter(s => s.tipo === 'ISAPRE'), [catalogos]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };
    const handleRadioChange = (name, value) => setFormData(prev => ({ ...prev, [name]: value }));

    const reset = () => { setFormData(ESTADO_INICIAL); setStep(1); };

    const crear = useMutation({
        mutationFn: async () => {
            const saludId = formData.previsionSalud === 'isapre' ? (formData.isapreId || null) : (fonasa?.id || null);
            const payload = {
                empresaId,
                nombres: formData.nombre,
                rut: formData.rut,
                fechaNacimiento: formData.fechaNacimiento || null,
                estadoCivil: formData.estadoCivil || null,
                direccion: formData.direccion || null,
                comuna: formData.comuna || null,
                telefono: formData.telefono || null,
                email: formData.email || null,
                cargasNormales: Number(formData.cargasFamiliares) || 0,
                fechaIngreso: formData.fechaInicio || null,
                cargo: formData.cargo || null,
                tipoContrato: formData.tipoContrato || null,
                sueldoBase: Number(formData.sueldoBase) || 0,
                saludId,
                planIsapreMonto: formData.previsionSalud === 'isapre' ? (Number(formData.planIsapreUF) || null) : null,
                afpId: formData.afp || null,
                apvIndividual: Number(formData.apv) > 0,
            };
            const res = await createTrabajadorApi(user?.sessionId, payload);
            const data = await res.json();
            if (!res.ok) throw new Error(data?.message || 'Error al guardar');
            return data;
        },
        onSuccess: (data) => {
            toast({ title: "Trabajador registrado", description: `${formData.nombre} fue agregado.` });
            queryClient.invalidateQueries({ queryKey: ['trabajadores', empresaId] });
            onAddEmpleado?.(data?.trabajador);
            reset();
            setIsOpen(false);
        },
        onError: (err) => toast({ title: "No se pudo guardar", description: err.message, variant: "destructive" }),
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!formData.nombre.trim()) { toast({ title: "Falta el nombre", variant: "destructive" }); setStep(1); return; }
        if (!formData.rut.trim()) { toast({ title: "Falta el RUT", variant: "destructive" }); setStep(1); return; }
        crear.mutate();
    };

    const renderStep = () => {
        switch (step) {
            case 1:
                return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <h3 className="col-span-full text-lg font-semibold text-white flex items-center"><User className="mr-2 h-5 w-5 text-cyan-400" />Datos Personales</h3>
                        <div className="space-y-1"><Label>Nombre Completo</Label><Input name="nombre" value={formData.nombre} onChange={handleChange} /></div>
                        <div className="space-y-1"><Label>RUT</Label><Input name="rut" value={formData.rut} onChange={handleChange} placeholder="12345678-9" /></div>
                        <div className="space-y-1"><Label>Fecha de Nacimiento</Label><Input name="fechaNacimiento" type="date" value={formData.fechaNacimiento} onChange={handleChange} /></div>
                        <div className="space-y-1"><Label>Estado Civil</Label>
                            <ThemedSelect value={formData.estadoCivil} onChange={(v) => handleRadioChange('estadoCivil', v)} placeholder="Seleccionar…"
                                options={[
                                    { value: 'soltero', label: 'Soltero(a)' }, { value: 'casado', label: 'Casado(a)' },
                                    { value: 'divorciado', label: 'Divorciado(a)' }, { value: 'viudo', label: 'Viudo(a)' },
                                    { value: 'conviviente', label: 'Conviviente Civil' }, { value: 'separado', label: 'Separado(a)' },
                                ]} />
                        </div>
                        <div className="space-y-1 col-span-full"><Label>Dirección</Label><Input name="direccion" value={formData.direccion} onChange={handleChange} /></div>
                        <div className="space-y-1"><Label>Comuna</Label><Input name="comuna" value={formData.comuna} onChange={handleChange} /></div>
                        <div className="space-y-1"><Label>Teléfono</Label><Input name="telefono" value={formData.telefono} onChange={handleChange} /></div>
                        <div className="space-y-1"><Label>Email</Label><Input name="email" type="email" value={formData.email} onChange={handleChange} /></div>
                        <div className="space-y-1"><Label>Cargas Familiares</Label><Input name="cargasFamiliares" type="number" min="0" value={formData.cargasFamiliares} onChange={handleChange} /></div>
                    </div>
                );
            case 2:
                return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <h3 className="col-span-full text-lg font-semibold text-white flex items-center"><Briefcase className="mr-2 h-5 w-5 text-purple-400" />Datos Laborales</h3>
                        <div className="space-y-1"><Label>Fecha Inicio Contrato</Label><Input name="fechaInicio" type="date" value={formData.fechaInicio} onChange={handleChange} /></div>
                        <div className="space-y-1"><Label>Cargo</Label><Input name="cargo" value={formData.cargo} onChange={handleChange} /></div>
                        <div className="space-y-1"><Label>Tipo de Contrato</Label>
                            <ThemedSelect value={formData.tipoContrato} onChange={(v) => handleRadioChange('tipoContrato', v)} placeholder="Seleccionar…"
                                options={[{ value: 'indefinido', label: 'Indefinido' }, { value: 'plazo_fijo', label: 'Plazo Fijo' }, { value: 'por_obra', label: 'Obra o Faena' }]} />
                        </div>
                        <div className="space-y-1 col-span-full"><Label>Sueldo Base (CLP)</Label><Input name="sueldoBase" type="number" min="0" value={formData.sueldoBase} onChange={handleChange} /></div>
                    </div>
                );
            case 3:
                return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <h3 className="col-span-full text-lg font-semibold text-white flex items-center"><HeartPulse className="mr-2 h-5 w-5 text-rose-400" />Datos Previsionales</h3>
                        <div className="space-y-3">
                            <Label>Previsión de Salud</Label>
                            <RadioGroup name="previsionSalud" value={formData.previsionSalud} onValueChange={(v) => handleRadioChange('previsionSalud', v)} className="flex space-x-4">
                                <div className="flex items-center space-x-2"><RadioGroupItem value="fonasa" id="fonasa" /><Label htmlFor="fonasa">FONASA</Label></div>
                                <div className="flex items-center space-x-2"><RadioGroupItem value="isapre" id="isapre" /><Label htmlFor="isapre">Isapre</Label></div>
                            </RadioGroup>
                            {formData.previsionSalud === 'isapre' && (
                                <>
                                    <div className="space-y-1"><Label>Isapre</Label>
                                        <ThemedSelect value={formData.isapreId} onChange={(v) => handleRadioChange('isapreId', v)} placeholder="Seleccionar Isapre…"
                                            options={isapres.map(s => ({ value: s.id, label: s.nombre }))} />
                                    </div>
                                    <div className="space-y-1"><Label>Plan Isapre (UF)</Label><Input name="planIsapreUF" type="number" step="0.01" value={formData.planIsapreUF} onChange={handleChange} /></div>
                                </>
                            )}
                        </div>
                        <div className="space-y-1"><Label>AFP</Label>
                            <ThemedSelect value={formData.afp} onChange={(v) => handleRadioChange('afp', v)} placeholder="Seleccionar AFP…"
                                options={afpList.map(a => ({ value: a.id, label: a.nombre }))} />
                        </div>
                        <div className="space-y-1"><Label>APV mensual (CLP)</Label><Input name="apv" type="number" min="0" value={formData.apv} onChange={handleChange} /></div>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(v) => { if (!v) reset(); setIsOpen(v); }}>
            <DialogContent className="sm:max-w-3xl bg-black/50 backdrop-blur-xl border-white/20 text-white max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-2xl">Registrar Nuevo Trabajador</DialogTitle>
                    <DialogDescription>Ingresa los datos del nuevo miembro del equipo. Paso {step} de 3.</DialogDescription>
                </DialogHeader>

                <div className="flex items-center justify-center my-4">
                    <div className="w-full h-2 bg-white/10 rounded-full">
                        <div className="h-2 bg-gradient-to-r from-cyan-500 to-purple-500 rounded-full transition-all duration-500" style={{ width: `${(step / 3) * 100}%` }}></div>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="py-4 min-h-[300px]">
                    {renderStep()}
                </form>

                <DialogFooter className="justify-between">
                    {step > 1 ? (
                        <Button type="button" variant="outline" onClick={() => setStep(s => s - 1)}>Anterior</Button>
                    ) : <div></div>}

                    {step < 3 ? (
                        <Button type="button" onClick={() => setStep(s => s + 1)} className="bg-gradient-to-r from-blue-500 to-purple-600 text-white">Siguiente</Button>
                    ) : (
                        <Button type="submit" onClick={handleSubmit} disabled={crear.isPending} className="bg-gradient-to-r from-green-500 to-emerald-600 text-white">
                            {crear.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Guardando...</> : 'Guardar Trabajador'}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default NuevoEmpleadoModal;
