import { useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, CheckCircle2, ShieldCheck, ChevronDown, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ConexionBancoModal from './modals/ConexionBancoModal';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getConnectedBanksApi } from '@/services/bancoService';
import { toast } from '@/components/ui/use-toast';
import { API_BASE_URL } from '../../../config.js'; 

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
    const [isConnecting, setIsConnecting] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);

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

    const handleConnectSubmit = async (bancoId, rut, clave) => {
        setIsConnecting(true);
        try {
            const response = await fetch(`${API_BASE_URL}/bancos/connect?empresaId=${empresaId || 'null'}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ banco: bancoId, rut, clave }) 
            });

            const data = await response.json();

            if (!response.ok) throw new Error(data.message || "Error al conectar con el banco");

            toast({ title: "¡Conexión Exitosa!", description: data.message });
            setIsModalOpen(false);

            queryClient.invalidateQueries(['movimientos-bancarios', empresaId || 'Global']);
            queryClient.invalidateQueries(['bancos-conectados', empresaId || 'Global']);

        } catch (error) {
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
                onConnect={handleConnectSubmit} 
                isConnecting={isConnecting} 
            />

            <div className="mb-6 bg-slate-50 rounded-xl border border-[#efe8dd] shadow-lg flex flex-col">
                
                {/* BOTÓN DESPLEGABLE */}
                <button 
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="w-full flex items-center justify-between px-6 py-4 bg-transparent hover:bg-slate-100 transition-colors focus:outline-none rounded-xl"
                >
                    <div className="flex items-center gap-4">
                        <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-600 border border-blue-500/20">
                            <ShieldCheck className="h-5 w-5" />
                        </div>
                        <div className="text-left flex flex-col">
                            <h2 className="text-base font-semibold text-slate-900 tracking-wide">Sincronización Automática</h2>
                            <p className="text-xs text-slate-900/50 mt-0.5">Vincule cuentas bancarias para descargar cartolas automáticamente.</p>
                        </div>
                    </div>
                    <ChevronDown className={`h-5 w-5 text-slate-700/50 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                </button>

                {/* CONTENIDO DESPLEGABLE */}
                <AnimatePresence initial={false}>
                    {isExpanded && (
                        <motion.div
                            key="bancos-accordion"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3, ease: "easeInOut" }}
                            className="overflow-hidden" 
                        >
                            <div className="p-6 border-t border-[#efe8dd] bg-slate-50">
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                                    {bancosDisponibles.map((banco, index) => {
                                        const isConnected = bancosConectados.some(b => b.banco_id === banco.id || b === banco.id);

                                        return (
                                            <motion.div
                                                key={banco.id}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ duration: 0.2, delay: index * 0.05 }}
                                                // CLAVE AQUÍ: Se eliminó h-full, se añadió min-h-[160px] y justify-between
                                                className="relative flex flex-col items-center justify-between p-4 rounded-xl bg-slate-50 border border-[#efe8dd] hover:border-blue-500/50 hover:bg-slate-100 transition-all duration-300 group min-h-[160px]"
                                            >
                                                <div className="flex flex-col items-center w-full">
                                                    {/* Contenedor del Logo */}
                                                    <div className="h-12 w-12 mb-3 bg-white/90 rounded-lg flex items-center justify-center p-2 shadow-sm group-hover:scale-105 transition-transform duration-300 relative overflow-hidden">
                                                        <Building2 className="absolute text-slate-600 h-6 w-6 z-0" />
                                                        <img
                                                            src={banco.logo}
                                                            alt={banco.nombre}
                                                            className="h-full w-full object-contain relative z-10"
                                                            onError={(e) => {
                                                                e.target.style.display = 'none'; 
                                                            }}
                                                        />
                                                    </div>

                                                    <span className="text-xs font-semibold text-slate-900/80 mb-4 text-center line-clamp-2">
                                                        {banco.nombre}
                                                    </span>
                                                </div>

                                                {/* Contenedor Inferior Fijo */}
                                                <div className="w-full">
                                                    {isConnected ? (
                                                        <div className="flex items-center justify-center gap-1 w-full py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-md text-emerald-600 text-[10px] font-bold uppercase tracking-wider">
                                                            <CheckCircle2 className="h-3.5 w-3.5" />
                                                            Conectado
                                                        </div>
                                                    ) : (
                                                        <Button 
                                                            variant="ghost" 
                                                            size="sm"
                                                            className="w-full h-8 bg-slate-50 hover:bg-blue-600 hover:text-white text-slate-700/80 text-[11px] font-semibold transition-all rounded-md" 
                                                            onClick={() => handleConnectClick(banco)}
                                                            disabled={isConnecting}
                                                        >
                                                            <Plus className="h-3 w-3 mr-1" /> Conectar
                                                        </Button>
                                                    )}
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </>
    );
};

export default memo(ConexionBanco);