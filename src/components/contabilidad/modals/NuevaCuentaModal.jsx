import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { fetchWithAuth } from '@/services/apiClient';

const TIPOS_CUENTA = [
    { value: 'GRUPO',     label: 'Grupo' },
    { value: 'SUBGRUPO',  label: 'Subgrupo' },
    { value: 'MAYOR',     label: 'Mayor' },
    { value: 'SUBCUENTA', label: 'Subcuenta' },
];

const NuevaCuentaModal = ({ isOpen, setIsOpen, onGuardado, cuenta, empresaId }) => {
    const { user } = useAuth();
    const [codigo,      setCodigo]      = useState('');
    const [descripcion, setDescripcion] = useState('');
    const [tipo_cuenta, setTipoCuenta]  = useState('SUBCUENTA');
    const [isSaving, setIsSaving]       = useState(false);
    const isEditing = !!cuenta;

    useEffect(() => {
        if (isOpen) {
            setCodigo(     cuenta?.codigo      || '');
            setDescripcion(cuenta?.descripcion || '');
            setTipoCuenta( cuenta?.tipo_cuenta || 'SUBCUENTA');
        }
    }, [cuenta, isOpen]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!descripcion.trim() || (!isEditing && !codigo.trim())) {
            toast({ variant: 'destructive', title: 'Error', description: 'Código y descripción son obligatorios.' });
            return;
        }
        setIsSaving(true);
        try {
            let res;
            if (isEditing) {
                res = await fetchWithAuth(`/accounting/plan-cuentas/${cuenta.id}`, user.sessionId, {
                    method: 'PUT',
                    body: { descripcion: descripcion.trim(), tipo_cuenta },
                });
            } else {
                res = await fetchWithAuth('/accounting/plan-cuentas', user.sessionId, {
                    method: 'POST',
                    body: { empresaId: empresaId || null, codigo: codigo.trim(), descripcion: descripcion.trim(), tipo_cuenta },
                });
            }
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Error al guardar');
            toast({ title: isEditing ? '✅ Cuenta Actualizada' : '✅ Cuenta Creada', description: data.cuenta?.descripcion });
            onGuardado?.();
            setIsOpen(false);
        } catch (err) {
            toast({ variant: 'destructive', title: 'Error', description: err.message });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="sm:max-w-[460px] bg-white border-[#efe8dd] text-slate-700 shadow-2xl">
                <DialogHeader>
                    <DialogTitle className="text-lg font-black uppercase tracking-tight text-blue-600">
                        {isEditing ? 'Editar Cuenta' : 'Nueva Cuenta Contable'}
                    </DialogTitle>
                    <DialogDescription className="text-slate-500 text-xs">
                        {isEditing ? `Modificando: ${cuenta.codigo}` : 'Agrega una cuenta al plan contable'}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 mt-2">
                    {/* Código — solo en creación */}
                    {!isEditing && (
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Código de Cuenta</label>
                            <input
                                value={codigo}
                                onChange={e => setCodigo(e.target.value)}
                                placeholder="Ej: 1104-02"
                                className="w-full bg-white border border-[#efe8dd] rounded-lg px-3 py-2 text-sm text-slate-900 font-mono focus:outline-none focus:border-emerald-500"
                            />
                        </div>
                    )}

                    {/* Descripción */}
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Descripción</label>
                        <input
                            value={descripcion}
                            onChange={e => setDescripcion(e.target.value)}
                            placeholder="Ej: BANCO SANTANDER"
                            className="w-full bg-white border border-[#efe8dd] rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500"
                        />
                    </div>

                    {/* Tipo de cuenta */}
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Tipo de Cuenta</label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {TIPOS_CUENTA.map(t => (
                                <button key={t.value} type="button" onClick={() => setTipoCuenta(t.value)}
                                    className={`py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                        tipo_cuenta === t.value
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-slate-50 text-slate-400 hover:text-slate-900 border border-[#efe8dd]'
                                    }`}>
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </form>

                <DialogFooter className="mt-2">
                    <Button variant="ghost" onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-slate-900">
                        Cancelar
                    </Button>
                    <Button onClick={handleSubmit} disabled={isSaving}
                        className="bg-emerald-600 hover:bg-emerald-500 text-slate-900 font-black uppercase text-xs tracking-widest disabled:opacity-40">
                        {isSaving ? <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />Guardando...</> : isEditing ? 'Actualizar' : 'Crear Cuenta'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default NuevaCuentaModal;
