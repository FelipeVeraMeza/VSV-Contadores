import React, { useState, useMemo, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LayoutList, BarChart3, Building2, ChevronDown, Search, CheckCircle2 } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

import { useBunkerData } from './crm/crmData'; 
import { updateClienteApi } from '@/services/crmService';
import CrmTableList from './crm/views/CrmTableList';
import CrmAnalytics from './crm/modals/CrmAnalytics'; 
import ClientDetailDrawer from './crm/modals/ClientDetailDrawer';

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
  const { clients: dbClients, cashFlow, services, compliance, risk, loading } = useBunkerData();
  const [clients, setClients] = useState([]);
  const { selectedCompany, setSelectedCompany } = useAuth();
  
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [selectorSearch, setSelectorSearch] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todos'); 
  const [typeFilter, setTypeFilter] = useState('Todos');
  const [selectedClient, setSelectedClient] = useState(null);
  const [vistaActivas, setVistaActivas] = useState(true);

  useEffect(() => {
    if (dbClients) setClients(dbClients);
  }, [dbClients]);

  // NOTA: He eliminado el useEffect que cargaba del localStorage automáticamente.
  // Ahora el CRM inicia limpio, mostrando "EMPRESA PRINCIPAL".

  const activeCompanyName = selectedCompany?.razon_social || selectedCompany?.razonSocial || null;

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
          const matchSearch = cleanStr(razonSocial).includes(cleanStr(searchTerm.toLowerCase())) || rut.includes(searchTerm.toLowerCase());
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
    <div className="h-full flex flex-col gap-6 relative">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 flex-shrink-0">
        <div>
            <h1 className="text-xl md:text-3xl font-black text-white uppercase tracking-tighter">Panel de Gestión CRM</h1>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 z-50">
            <div className="relative">
                <button 
                    onClick={() => setIsSelectorOpen(!isSelectorOpen)}
                    className={`flex items-center justify-between gap-2 bg-[#0f172a]/90 border border-white/10 text-white text-sm font-bold px-4 py-2.5 rounded-xl w-64 md:w-[350px] shadow-lg ${!activeCompanyName ? 'border-dashed border-blue-500' : ''}`}
                >
                    <div className="flex items-center gap-2 truncate">
                        <Building2 size={16} className={activeCompanyName ? "text-emerald-400" : "text-gray-500"} />
                        {activeCompanyName || 'EMPRESA PRINCIPAL'}
                    </div>
                    <ChevronDown size={16} />
                </button>

                {isSelectorOpen && (
                    <div className="absolute top-full right-0 mt-2 w-[400px] bg-[#0f172a] border border-white/10 rounded-xl shadow-2xl p-2 z-50">
                        <input 
                            autoFocus
                            placeholder="Buscar empresa..."
                            value={selectorSearch}
                            onChange={(e) => setSelectorSearch(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-xs text-white"
                        />
                        <div className="max-h-60 overflow-y-auto mt-2">
                             <button onClick={() => { 
                                    setSelectedCompany(null); 
                                    localStorage.removeItem('selectedCompany');
                                    setIsSelectorOpen(false);
                                }} className="w-full text-left px-4 py-2 text-xs text-blue-400 hover:bg-white/5 rounded-lg border-b border-white/5">
                                    EMPRESA PRINCIPAL
                                </button>
                             {clients
                                .filter(c => cleanStr(c.razon_social || c.razonSocial).includes(cleanStr(selectorSearch)))
                                .map(c => (
                                <button key={c.id} onClick={() => { 
                                    setSelectedCompany(c);
                                    localStorage.setItem('selectedCompany', JSON.stringify(c));
                                    setIsSelectorOpen(false);
                                }} className="w-full text-left px-4 py-2 text-xs text-gray-300 hover:bg-white/5 rounded-lg">
                                    {c.razon_social || c.razonSocial}
                                </button>
                             ))}
                        </div>
                    </div>
                )}
            </div>

            <div className="flex bg-[#0f172a]/80 border border-white/10 rounded-xl p-1">
                <button onClick={() => setActiveTab('list')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase ${activeTab === 'list' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>Clientes</button>
                <button onClick={() => setActiveTab('analytics')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase ${activeTab === 'analytics' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>Métricas</button>
            </div>
        </div>
      </div>

      {activeTab === 'list' && (
        <div className="flex gap-6 relative items-start h-full">
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
                    />
                )}
            </AnimatePresence>
        </div>
      )}

      {activeTab === 'analytics' && (
        <CrmAnalytics cashFlow={cashFlow} services={services} compliance={compliance} risk={risk} />
      )}
    </div>
  );
};

export default CRM;