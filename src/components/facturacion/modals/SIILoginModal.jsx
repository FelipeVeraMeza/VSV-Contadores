import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { Building2, Lock, Loader2 } from 'lucide-react';

const SIILoginModal = ({ isOpen, setIsOpen, onConnect }) => {
    const [rut, setRut] = useState('');
    const [clave, setClave] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = async () => {
        if (!rut || !clave) {
            toast({ variant: "destructive", title: "Error", description: "RUT y Clave son requeridos." });
            return;
        }
        setIsLoading(true);
        const success = await onConnect(rut, clave);
        setIsLoading(false);
        if (success) {
            setIsOpen(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="sm:max-w-[425px] bg-slate-50 backdrop-blur-xl border-[#efe8dd] text-slate-700">
                <DialogHeader>
                    <DialogTitle className="text-2xl">Autenticación SII</DialogTitle>
                    <DialogDescription>Ingresa las credenciales de la empresa para conectar con el Servicio de Impuestos Internos.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="rut-sii">RUT Empresa</Label>
                        <div className="relative">
                            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                            <Input id="rut-sii" value={rut} onChange={(e) => setRut(e.target.value)} className="pl-10" placeholder="76.123.456-7" />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="clave-sii">Clave Tributaria</Label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                            <Input id="clave-sii" type="password" value={clave} onChange={(e) => setClave(e.target.value)} className="pl-10" placeholder="••••••••" />
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsOpen(false)} className="border-[#efe8dd] text-slate-700 hover:bg-slate-100" disabled={isLoading}>Cancelar</Button>
                    <Button onClick={handleLogin} disabled={isLoading} className="bg-gradient-to-r from-emerald-500 to-green-600 text-white">
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {isLoading ? 'Conectando...' : 'Conectar'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default SIILoginModal;