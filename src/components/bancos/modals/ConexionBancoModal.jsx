import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { User, Lock, AlertTriangle, Loader2 } from 'lucide-react';

const ConexionBancoModal = ({ isOpen, setIsOpen, banco, onConnect, isConnecting }) => {
    const [rut, setRut] = useState('');
    const [clave, setClave] = useState('');

    const handleLogin = () => {
        if (!rut || !clave) {
            toast({ variant: "destructive", title: "Error", description: "RUT y Clave son requeridos." });
            return;
        }

        // 🛡️ LÓGICA INTELIGENTE DE SEGURIDAD (Actualizada)
        // Ya no bloqueamos si el RUT es diferente. El usuario es libre de usar 
        // las credenciales del apoderado, socio, o quien maneje las finanzas.

        toast({ title: `🤖 Conectando a ${banco.nombre}...`, description: "Iniciando protocolo de seguridad en segundo plano."});
        onConnect(banco.id, rut, clave);
    };

    if (!banco) return null;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !isConnecting && setIsOpen(open)}>
            <DialogContent className="sm:max-w-[425px] bg-slate-50 backdrop-blur-xl border-[#efe8dd] text-slate-700">
                <DialogHeader className="text-center">
                    <div className="h-16 w-16 mx-auto mb-4 bg-white rounded-2xl flex items-center justify-center p-3 shadow-lg">
                        <img src={banco.logo} alt={`Logo ${banco.nombre}`} className="max-h-full max-w-full object-contain" />
                    </div>
                    <DialogTitle className="text-2xl">Conectar con {banco.nombre}</DialogTitle>
                    <DialogDescription>Ingresa las credenciales de quien maneja la cuenta.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="rut-banco">RUT de Acceso al Banco</Label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                            <Input 
                                id="rut-banco" 
                                value={rut} 
                                onChange={(e) => setRut(e.target.value)} 
                                disabled={isConnecting} 
                                className="pl-10 text-slate-700" 
                                placeholder="Ej: 12345678-9" 
                            />
                        </div>
                        <p className="text-xs text-slate-500 pt-1">Ingrese el RUT de la persona o empresa autorizada para operar el banco.</p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="clave-banco">Clave de Acceso</Label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                            <Input 
                                id="clave-banco" 
                                type="password" 
                                value={clave} 
                                onChange={(e) => setClave(e.target.value)} 
                                disabled={isConnecting} 
                                className="pl-10 text-slate-700" 
                                placeholder="••••••••" 
                            />
                        </div>
                    </div>
                     <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 flex items-start space-x-3 text-sm">
                        <AlertTriangle className="h-6 w-6 text-blue-600 mt-1 flex-shrink-0" />
                        <p className="text-blue-700">
                            Tu seguridad es nuestra prioridad. La conexión se realiza de forma encriptada y tus credenciales no se guardan en nuestro servidor.
                        </p>
                    </div>
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsOpen(false)} disabled={isConnecting} className="border-[#efe8dd] text-slate-700 hover:bg-slate-100">Cancelar</Button>
                    <Button onClick={handleLogin} disabled={isConnecting} className="bg-gradient-to-r from-emerald-500 to-green-600 text-white border-none hover:opacity-90">
                        {isConnecting ? <><Loader2 className="animate-spin h-4 w-4 mr-2" /> Sincronizando...</> : 'Conectar de forma segura'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default ConexionBancoModal;