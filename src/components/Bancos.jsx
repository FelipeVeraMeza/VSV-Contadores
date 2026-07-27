import React, { useState } from 'react';
import { Landmark, Upload, Loader2, Building2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ConexionBanco from '@/components/bancos/ConexionBanco';
import MovimientosBancarios from '@/components/bancos/MovimientosBancarios';
import CargaCartolaModal from '@/components/bancos/modals/CargaCartolaModal';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMovimientosBancariosApi } from '@/services/bancoService'; // Asegúrate de tener esta función
import { toast } from '@/components/ui/use-toast';
import { API_BASE_URL } from '../../config';

const Bancos = () => {
  const { selectedCompany, user } = useAuth();
  
  // MAGIA MULTI-TENANT: 
  // Si hay empresa en el CRM, usa ese ID. Si no, usa el tuyo como Admin.
  const empresaActivaId = selectedCompany?.id || user?.empresa_id;
  const nombreVista = selectedCompany ? (selectedCompany.razon_social || selectedCompany.razonSocial) : 'Bóveda Global (Admin)';

  const queryClient = useQueryClient();
  const [isCartolaModalOpen, setIsCartolaModalOpen] = useState(false);

  // Consulta los movimientos basados en la empresa que está activa en el momento
  const { data: movimientos = [], isLoading } = useQuery({
    // La llave ahora tiene un "Global" de respaldo para que React Query entienda el cambio
    queryKey: ['movimientos-bancarios', empresaActivaId || 'Global'],
    queryFn: async () => {
      // Pasamos el ID, si no hay, pasará null/undefined
      const res = await getMovimientosBancariosApi(user?.sessionId, empresaActivaId);
      if (!res.ok) throw new Error("Error al obtener movimientos");
      return res.json();
    },
    // 👇 ¡LA CORRECCIÓN ESTÁ AQUÍ! Solo pedimos que haya una sesión iniciada.
    enabled: !!user?.sessionId, 
  });

  // (Simulación de mutación para el botón de carga)
  const mutation = useMutation({
    mutationFn: async () => { await new Promise(r => setTimeout(r, 1000)) },
    onSuccess: () => queryClient.invalidateQueries(['movimientos-bancarios', empresaActivaId])
  });

  const handleCartolaCargada = async (movimientosLimpios) => {
    try {
        const idEmpresa = selectedCompany?.id || null; 

        console.log("🚀 [FRONTEND] Enviando datos al servidor...");

        // 👇 Usamos API_BASE_URL aquí, así se adapta automáticamente a local o producción
        const response = await fetch(`${API_BASE_URL}/bancos/cartola?empresaId=${idEmpresa}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ movimientos: movimientosLimpios })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "Error al guardar en el servidor");
        }

        // ✅ ¡EL PASO MÁGICO! 
        // Esto le dice a la tabla: "Oye, los datos cambiaron, vuelve a pedirlos a la base de datos ahora mismo"
        queryClient.invalidateQueries(['movimientos-bancarios', empresaActivaId]);

        toast({ 
            title: "¡Bóveda Actualizada!", 
            description: `Se guardaron ${movimientosLimpios.length} movimientos y la tabla se ha refrescado.` 
        });
        
    } catch (error) {
        console.error("❌ Error al subir:", error);
        toast({ 
            variant: "destructive", 
            title: "Error de Subida", 
            description: error.message 
        });
    }
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500">
      <CargaCartolaModal 
        isOpen={isCartolaModalOpen} 
        setIsOpen={setIsCartolaModalOpen} 
        onCartolaCargada={handleCartolaCargada}
        empresaId={empresaActivaId} // El Excel se subirá a esta empresa
        isUploading={mutation.isPending}
      />
      
      {/* CABECERA DINÁMICA */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-8 space-y-4 lg:space-y-0 bg-slate-50 p-6 rounded-3xl border border-[#efe8dd] backdrop-blur-xl">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className={`p-2.5 rounded-xl ${selectedCompany ? 'bg-blue-500/20 text-blue-600' : 'bg-purple-500/20 text-purple-600'}`}>
              {selectedCompany ? <Building2 size={24} /> : <ShieldCheck size={24} />}
            </div>
            <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">
              Tesorería y Bancos
            </h1>
          </div>
          <p className="text-slate-500 text-sm font-medium">
            Viendo cartola de: <span className={selectedCompany ? "text-blue-600 font-bold" : "text-purple-600 font-bold"}>{nombreVista}</span>
          </p>
        </div>
        
        <div className="flex items-center space-x-3">
          <Button 
            variant="outline"
            disabled={mutation.isPending}
            className="border-[#efe8dd] text-slate-700 hover:bg-slate-100 font-bold rounded-xl h-11 px-6 bg-slate-50"
            onClick={() => setIsCartolaModalOpen(true)}
          >
            {mutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            Subir Excel
          </Button>
        </div>
      </div>

      {/* COMPONENTES HIJOS RECIBEN EL ID DINÁMICO */}
      <ConexionBanco empresaId={empresaActivaId} />
      
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
        </div>
      ) : (
        <MovimientosBancarios movimientos={movimientos} />
      )}
    </div>
  );
};

export default Bancos;