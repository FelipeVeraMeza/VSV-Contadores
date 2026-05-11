import { useState, memo } from 'react';
import { motion } from 'framer-motion';
import { Plus, CheckCircle2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ConexionBancoModal from './modals/ConexionBancoModal';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getConnectedBanksApi } from '@/services/bancoService';
import { toast } from '@/components/ui/use-toast';
import { API_BASE_URL } from '../../../config'; // <-- Asegúrate de que esta ruta sea la correcta en tu proyecto

const bancosDisponibles = [
    { id: 'santander', nombre: 'Santander', logo: 'https://logospng.org/download/santander/logo-santander-2048.png' },
    { id: 'bci', nombre: 'BCI', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Bci_Logotype.svg/2560px-Bci_Logotype.svg.png' },
    { id: 'chile', nombre: 'Banco de Chile', logo: 'https://companieslogo.com/img/orig/BCH-1e8f26ec.png?t=1720244490' },
    { id: 'estado', nombre: 'BancoEstado', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/Banco_Estado_Chile_logo.svg/2560px-Banco_Estado_Chile_logo.svg.png' },
    { id: 'scotiabank', nombre: 'Scotiabank', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Scotiabank_Logo.svg/2560px-Scotiabank_Logo.svg.png' },
    { id: 'itau', nombre: 'Itaú', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f6/Itau_logo.svg/2560px-Itau_logo.svg.png' }
];

const ConexionBanco = ({ empresaId }) => {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const [selectedBanco, setSelectedBanco] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false); // Nuevo estado de carga

    const { data: conectadosResponse = [] } = useQuery({
        queryKey: ['bancos-conectados', empresaId || 'Global'],
        queryFn: () => getConnectedBanksApi(user?.sessionId, empresaId),
        enabled: !!user?.sessionId
    });

    const bancosConectados = Array.isArray(conectadosResponse) ? conectadosResponse : (conectadosResponse.data || []);

    const handleConnectClick = (banco) => {
        setSelectedBanco(banco);
        setIsModalOpen(true);
    };

    // 🚀 Aquí está la magia: Despertamos al robot y le pasamos todo
    const handleConnectSubmit = async (bancoId, rut, clave) => {
        setIsConnecting(true);
        try {
            console.log(`[FRONTEND] Solicitando robot para ${bancoId}...`);
            
            const response = await fetch(`${API_BASE_URL}/bancos/connect?empresaId=${empresaId || 'null'}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // Le pasamos al backend qué banco elegimos
                body: JSON.stringify({ banco: bancoId, rut, clave }) 
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Error al conectar con el banco");
            }

            toast({ title: "¡Conexión Exitosa!", description: data.message });
            setIsModalOpen(false);

            // Refrescamos la tabla principal y los bancos conectados al instante
            queryClient.invalidateQueries(['movimientos-bancarios', empresaId || 'Global']);
            queryClient.invalidateQueries(['bancos-conectados', empresaId || 'Global']);

        } catch (error) {
            console.error("Error al conectar:", error);
            toast({ variant: "destructive", title: "Fallo de Robot", description: error.message });
        } finally {
            setIsConnecting(false);
        }
    };

    return (
        <>
            <ConexionBancoModal 
                isOpen={isModalOpen} 
                setIsOpen={setIsModalOpen} 
                banco={selectedBanco} 
                onConnect={handleConnectSubmit} // <-- Pasamos la función real
                empresaRUT={"12345678-9"} // Cambia esto si tienes el RUT real a mano
                isConnecting={isConnecting} // <-- Bloquea el botón mientras extrae
            />

            <div className="mb-8">
                <div className="flex items-center gap-2 mb-2">
                    <ShieldCheck className="h-5 w-5 text-blue-400" />
                    <h2 className="text-lg font-bold text-white tracking-tight">Sincronización Automática</h2>
                </div>
                <p className="text-sm text-zinc-400">
                    Vincule las cuentas bancarias de la empresa para descargar la cartola automáticamente usando nuestro robot encriptado.
                </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
                {bancosDisponibles.map((banco, index) => {
                    const isConnected = bancosConectados.some(b => b.banco_id === banco.id || b === banco.id);

                    return (
                        <motion.div
                            key={banco.id}
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, delay: index * 0.05 }}
                            className="group relative flex flex-col items-center justify-between p-5 rounded-2xl bg-white/[0.02] border border-white/10 hover:border-white/20 hover:bg-white/[0.04] transition-all overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

                            <div className="h-14 w-14 mb-4 rounded-xl bg-white flex items-center justify-center p-2.5 shadow-lg shadow-black/20 ring-1 ring-black/5">
                                <img
                                    src={banco.logo}
                                    alt={`Logo ${banco.nombre}`}
                                    className="max-h-full max-w-full object-contain"
                                    onError={(e) => {
                                        e.target.onerror = null;
                                        e.target.src = `https://ui-avatars.com/api/?name=${banco.nombre}&background=0D8ABC&color=fff&bold=true`;
                                    }}
                                />
                            </div>

                            <span className="text-sm font-medium text-zinc-200 mb-4">{banco.nombre}</span>

                            <div className="w-full flex justify-center mt-auto">
                                {isConnected ? (
                                    <div className="flex items-center justify-center gap-1.5 w-full py-1.5 px-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold tracking-tight shadow-sm">
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                        Conectado
                                    </div>
                                ) : (
                                    <Button 
                                        size="sm" 
                                        variant="ghost" 
                                        className="w-full h-8 bg-zinc-800/50 text-zinc-300 hover:text-white hover:bg-zinc-700 border border-white/5 text-xs font-medium transition-all" 
                                        onClick={() => handleConnectClick(banco)}
                                        disabled={isConnecting}
                                    >
                                        <Plus className="h-3.5 w-3.5 mr-1" /> Conectar
                                    </Button>
                                )}
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </>
    );
};

export default memo(ConexionBanco);