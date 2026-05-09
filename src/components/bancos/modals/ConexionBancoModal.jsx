import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { User, Lock, AlertTriangle, Loader2 } from 'lucide-react';

const ConexionBancoModal = ({ isOpen, setIsOpen, banco, onConnect, empresaRUT, isConnecting }) => {
    const [rut, setRut] = useState('');
    const [clave, setClave] = useState('');

    const normalizeRUT = (rut) => {
      if (!rut) return '';
      return rut.replace(/[^0-9kK]/g, '').toLowerCase();
    }

    const handleLogin = () => {
        if (!rut || !clave) {
            toast({ variant: "destructive", title: "Error", description: "RUT y Clave son requeridos." });
            return;
        }

        if (normalizeRUT(rut) !== normalizeRUT(empresaRUT)) {
            toast({
                variant: "destructive",
                title: "RUT no coincide",
                description: "El RUT ingresado no corresponde al de la empresa seleccionada. Por seguridad, solo puedes conectar cuentas del titular."
            });
            return;
        }

        toast({ title: `🤖 Conectando a ${banco.nombre}...`, description: "Iniciando protocolo de seguridad en segundo plano."});
        onConnect(banco.id, rut, clave);
    };

    if (!banco) return null;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !isConnecting && setIsOpen(open)}>
            <DialogContent className="sm:max-w-[425px] bg-black/50 backdrop-blur-xl border-white/20 text-white">
                <DialogHeader className="text-center">
                    <div className="h-16 w-16 mx-auto mb-4 bg-white rounded-2xl flex items-center justify-center p-3 shadow-lg">
                        <img src={banco.logo} alt={`Logo ${banco.nombre}`} className="max-h-full max-w-full object-contain" />
                    </div>
                    <DialogTitle className="text-2xl">Conectar con {banco.nombre}</DialogTitle>
                    <DialogDescription>Ingresa tus credenciales para sincronizar movimientos.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="rut-banco">RUT del Titular</Label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                            <Input id="rut-banco" value={rut} onChange={(e) => setRut(e.target.value)} disabled={isConnecting} className="pl-10 text-black" placeholder="RUT de la empresa" />
                        </div>
                         <p className="text-xs text-gray-400 pt-1">Debe coincidir con el RUT de la empresa: {empresaRUT}</p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="clave-banco">Clave de Acceso</Label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                            <Input id="clave-banco" type="password" value={clave} onChange={(e) => setClave(e.target.value)} disabled={isConnecting} className="pl-10 text-black" placeholder="••••••••" />
                        </div>
                    </div>
                     <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 flex items-start space-x-3 text-sm">
                        <AlertTriangle className="h-6 w-6 text-blue-400 mt-1 flex-shrink-0" />
                        <p className="text-blue-300">
                           Tu seguridad es nuestra prioridad. La conexión se realiza de forma segura y tus credenciales nunca son almacenadas.
                        </p>
                    </div>
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsOpen(false)} disabled={isConnecting} className="border-white/20 text-white hover:bg-white/10">Cancelar</Button>
                    <Button onClick={handleLogin} disabled={isConnecting} className="bg-gradient-to-r from-blue-500 to-purple-600 text-white border-none">
                        {isConnecting ? <><Loader2 className="animate-spin h-4 w-4 mr-2" /> Extrayendo Cartola...</> : 'Conectar de forma segura'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default ConexionBancoModal;