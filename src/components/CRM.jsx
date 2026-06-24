import React, { useState, useMemo, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LayoutList, BarChart3, Building2, ChevronDown, Search, CheckCircle2 } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

import { useBunkerData } from './crm/crmData'; 
import { updateClienteApi } from '@/services/crmService';
import CrmTableList from './crm/views/CrmTableList';
import CrmAnalytics from './crm/modals/CrmAnalytics';
import ClientDetailDrawer from './crm/modals/ClientDetailDrawer';
import WhatsappPanel from './crm/views/WhatsappPanel';
import EmailPanel from './crm/views/EmailPanel';
import InteraccionesPanel from './crm/views/InteraccionesPanel';

import { useAuth } from '@/hooks/useAuth';

const cleanStr = (str) => {
  if (!str) return '';
  return String(str).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
};

const isEmptyField = (val) => {
    if (!val) return true;
    const strVal = String(val).trim().toUpperCase();
    return strVal === '' || strVal === 'SIN_DATO' || strVal === 'SIN REGISTRO';
};

const CRM = () => {
  const [activeTab, setActiveTab] = useState('list');
  const { clients: dbClients, planes, serviciosDisponibles, cashFlow, services, compliance, risk, loading, refresh } = useBunkerData();
  const [clients, setClients] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todos'); 
  const [typeFilter, setTypeFilter] = useState('Todos');
  const [selectedClient, setSelectedClient] = useState(null);
  const [vistaActivas, setVistaActivas] = useState(true);

  useEffect(() => {
    if (dbClients) setClients(dbClients);
  }, [dbClients]);

  // NOTA: El selector de empresa vive en el header global (GlobalCompanySelector).

  const stats = useMemo(() => {
      if (!clients) return { total: 0, criticos: 0, f29Pendientes: 0, alDia: 0 };
      const clientesEnVista = clients.filter(c => {
          const rep = c.nombre_rep || c.repNombre;
          const rutRep = c.rut_rep_encrypted || c.repRut;
          const correo = c.email_corporativo || c.correo;
          const tel = c.whatsapp || c.telefono_corporativo || c.telefono;
          const esInactiva = isEmptyField(rep) && isEmptyField(rutRep) && isEmptyField(correo) && isEmptyField(tel);
          return vistaActivas ? !esInactiva : esInactiva;
      });
      return {
          total: clientesEnVista.length,
          criticos: clientesEnVista.filter(c => {
              const pago = String(c.estado_pago || c.pagoServicio || '').trim().toUpperCase();
              const dts = parseInt(c.dts_mensuales || c.dtAtrasados || 0);
              return pago === 'NO PAGADO' || pago === 'SERVICIO SUSPENDIDO' || dts > 0;
          }).length,
          f29Pendientes: clientesEnVista.filter(c => {
              const f29 = String(c.estado_f29 || c.estadoFormulario || '').trim().toUpperCase();
              return f29 === 'PENDIENTE';
          }).length,
          alDia: clientesEnVista.filter(c => {
              const pago = String(c.estado_pago || c.pagoServicio || '').trim().toUpperCase();
              const f29 = String(c.estado_f29 || c.estadoFormulario || '').trim().toUpperCase();
              return (pago === 'AL DIA' || pago === 'PAGADO') && (f29 === 'DECLARADO' || f29 === 'NO DECLARAR');
          }).length
      };
  }, [clients, vistaActivas]);

  const filteredClients = useMemo(() => {
      return clients.filter(c => {
          const razonSocial = String(c.razon_social || c.razonSocial || '').toLowerCase();
          const rut = String(c.rut_encrypted || c.rut || '').toLowerCase();
          const tipo = String(c.tipo_cliente || c.type || '');
          const pago = String(c.estado_pago || c.pagoServicio || '').trim().toUpperCase();
          const f29 = String(c.estado_f29 || c.estadoFormulario || '').trim().toUpperCase();
          const dts = parseInt(c.dts_mensuales || c.dtAtrasados || 0);
          const rep = c.nombre_rep || c.repNombre;
          const rutRep = c.rut_rep_encrypted || c.repRut;
          const correo = c.email_corporativo || c.correo;
          const tel = c.whatsapp || c.telefono_corporativo || c.telefono;
          const esInactiva = isEmptyField(rep) && isEmptyField(rutRep) && isEmptyField(correo) && isEmptyField(tel);
          const matchActividad = vistaActivas ? !esInactiva : esInactiva;

          const term = searchTerm.trim().toLowerCase();
          const termClean = cleanStr(term);
          // Solo dígitos del término, para comparar teléfonos sin importar formato (+56, espacios, guiones)
          const termDigits = term.replace(/\D/g, '');
          const telDigits = String(tel || '').replace(/\D/g, '');

          const matchSearch =
              term === '' ||
              cleanStr(razonSocial).includes(termClean) ||
              rut.includes(term) ||
              cleanStr(correo).includes(termClean) ||
              cleanStr(rep).includes(termClean) ||
              (termDigits !== '' && telDigits.includes(termDigits));
          const matchType = typeFilter === 'Todos' || tipo === typeFilter;
          let matchStatus = true;
          if (statusFilter === 'Críticos') {
              matchStatus = pago === 'NO PAGADO' || pago === 'SERVICIO SUSPENDIDO' || dts > 0;
          } else if (statusFilter === 'F29 Pendientes') {
              matchStatus = f29 === 'PENDIENTE';
          } else if (statusFilter === 'Al Día') {
              matchStatus = (pago === 'AL DIA' || pago === 'PAGADO') && (f29 === 'DECLARADO' || f29 === 'NO DECLARAR');
          }
          return matchSearch && matchType && matchStatus && matchActividad;
      });
  }, [clients, searchTerm, statusFilter, typeFilter, vistaActivas]);

  const handleUpdateClient = async (updatedClient) => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      if (!user.sessionId) throw new Error("Sesión inválida");
      const res = await updateClienteApi(user.sessionId, updatedClient.id, updatedClient);
      if(res.success || res){
          setClients(clients.map(c => c.id === updatedClient.id ? updatedClient : c));
          if(selectedClient?.id === updatedClient.id) setSelectedClient(updatedClient);
          toast({ title: "Cliente actualizado", description: "Los cambios se guardaron correctamente." });
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo actualizar el cliente." });
    }
  };

  if (loading) return <div className="h-full flex items-center justify-center text-white"><div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div></div>;

  return (
    <div className="h-full flex flex-col gap-3 lg:gap-5 relative">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 flex-shrink-0">
        <div>
            <h1 className="text-xl md:text-3xl font-black text-white uppercase tracking-tighter">Panel de Gestión CRM</h1>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 z-50">
            <div className="flex flex-wrap bg-[#0f172a]/80 border border-white/10 rounded-xl p-1">
                <button onClick={() => setActiveTab('list')} className={`px-3 lg:px-5 py-2.5 rounded-xl text-[10px] font-black uppercase ${activeTab === 'list' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>Clientes</button>
                <button onClick={() => setActiveTab('whatsapp')} className={`px-3 lg:px-5 py-2.5 rounded-xl text-[10px] font-black uppercase ${activeTab === 'whatsapp' ? 'bg-emerald-600 text-white' : 'text-gray-400'}`}>WhatsApp</button>
                <button onClick={() => setActiveTab('correo')} className={`px-3 lg:px-5 py-2.5 rounded-xl text-[10px] font-black uppercase ${activeTab === 'correo' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>Correo</button>
                <button onClick={() => setActiveTab('interacciones')} className={`px-3 lg:px-5 py-2.5 rounded-xl text-[10px] font-black uppercase ${activeTab === 'interacciones' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>Interacciones</button>
                <button onClick={() => setActiveTab('analytics')} className={`px-3 lg:px-5 py-2.5 rounded-xl text-[10px] font-black uppercase ${activeTab === 'analytics' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>Métricas</button>
            </div>
        </div>
      </div>

      {activeTab === 'list' && (
        <div className="flex gap-4 lg:gap-6 relative items-stretch flex-1 min-h-[600px]">
            <CrmTableList 
                filteredClients={filteredClients} 
                stats={stats} 
                onClientSelect={setSelectedClient} 
                selectedClientId={selectedClient?.id}
                searchTerm={searchTerm} 
                setSearchTerm={setSearchTerm}
                statusFilter={statusFilter} 
                setStatusFilter={setStatusFilter}
                typeFilter={typeFilter} 
                setTypeFilter={setTypeFilter}
                vistaActivas={vistaActivas}
                setVistaActivas={setVistaActivas}
            />

            <AnimatePresence>
                {selectedClient && (
                    <ClientDetailDrawer
                        client={selectedClient}
                        onClose={() => setSelectedClient(null)}
                        onUpdateClient={handleUpdateClient}
                        planes={planes}
                        serviciosDisponibles={serviciosDisponibles}
                        onRefresh={refresh}
                    />
                )}
            </AnimatePresence>
        </div>
      )}

      {activeTab === 'whatsapp' && (
        <div className="flex-1 min-h-0">
          <WhatsappPanel />
        </div>
      )}

      {activeTab === 'correo' && (
        <div className="flex-1 min-h-0">
          <EmailPanel />
        </div>
      )}

      {activeTab === 'interacciones' && (
        <div className="flex-1 min-h-0">
          <InteraccionesPanel />
        </div>
      )}

      {activeTab === 'analytics' && (
        <CrmAnalytics clients={clients} cashFlow={cashFlow} />
      )}
    </div>
  );
};

export default CRM;