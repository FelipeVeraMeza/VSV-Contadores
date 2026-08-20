import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams , Navigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { LayoutList, BarChart3, Building2, ChevronDown, Search, CheckCircle2, UserPlus, Download, Upload, FileSpreadsheet } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

import { useBunkerData } from './crm/crmData';
import { updateClienteApi, eliminarEmpresaApi, registrarPagoClienteApi } from '@/services/crmService';
import CrmImportModal from './crm/modals/CrmImportModal';
import CrmImportProspectosModal from './crm/modals/CrmImportProspectosModal';
import CrmErrorBoundary from './crm/CrmErrorBoundary';
import CrmTableList from './crm/views/CrmTableList';
import CrmAnalytics from './crm/modals/CrmAnalytics';
import ClientDetailDrawer from './crm/modals/ClientDetailDrawer';
import InteraccionesPanel from './crm/views/InteraccionesPanel';
import CrearClienteModal from './crm/modals/CrearClienteModal';
import CrearEmpresaModal from './crm/modals/CrearEmpresaModal';
import PersonasPanel from './crm/views/PersonasPanel';
import CrmDashboard from './crm/views/CrmDashboard';

import { useAuth } from '@/hooks/useAuth';

const cleanStr = (str) => {
  if (!str) return '';
  return String(str).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
};

const TITULOS = {
  dashboard: 'Dashboard CRM',
  list: 'Clientes',
  prospectos: 'Prospectos',
  interacciones: 'Interacciones',
  analytics: 'Métricas',
};

const isEmptyField = (val) => {
    if (!val) return true;
    const strVal = String(val).trim().toUpperCase();
    return strVal === '' || strVal === 'SIN_DATO' || strVal === 'SIN REGISTRO';
};

// Una empresa fue "creada por un usuario" cuando su creador es un Cliente
// (no el administrador de la organización). Se basa en el ROL del creador.
const esCreadaPorUsuario = (c) => c.usuarioCreadorRol === 'Cliente';

// --- Reglas de negocio definidas con jefatura ---
// Requisito mínimo para ser ACTIVO: tener al menos un servicio contratado activo.
const tieneServicioActivo = (c) =>
    Array.isArray(c.servicios) && c.servicios.some(s => String(s.estado).toLowerCase() === 'activo');
const tuvoServicios = (c) => Array.isArray(c.servicios) && c.servicios.length > 0;

// Clasificación de negocio. La tabla solo tiene DOS pestañas ("Activos" y
// "De baja"), así que este resultado solo puede ser uno de esos dos valores:
// cualquier otro deja al cliente sin pestaña donde aparecer y lo vuelve
// invisible en el CRM. Así se perdieron de vista los clientes con una factura
// impaga — caían en un "Suspendidos" que no existe como pestaña.
//
// La vigencia del servicio y la deuda son cosas distintas: un cliente que debe
// una factura sigue estando en servicio y sigue en Activos. La cobranza se
// gestiona en Recaudaciones, no ocultando al cliente.
//   De baja → dado de baja en su ficha, o tuvo servicios y ninguno sigue activo
//   Activos → el resto de la cartera vigente
const clasificarCliente = (c) => {
    if (c.activo === false) return 'baja';
    if (tuvoServicios(c) && !tieneServicioActivo(c)) return 'baja';
    return 'activos';
};

// Moroso = tiene al menos una factura emitida, vencida y sin pagar. Sale de
// cobro_mensual (dato vivo), no de empresa.estado_pago (texto congelado).
export const esMoroso = (c) => Boolean(c?.cobroVencido) || Number(c?.deudaVencida) > 0;

// Medidor de completitud de la ficha (0-100). Placeholders del alta no cuentan.
//
// Cada campo lleva su nombre para poder decir QUÉ falta. Un "70%" sin más no
// sirve de nada: el usuario ve un número y no sabe si le falta el correo o la
// comuna. Con los nombres, la barra pasa de ser un adorno a una lista de tareas.
const CAMPOS_COMPLETITUD = [
    ['Razón social',            (c) => c.razon_social || c.razonSocial],
    ['Giro',                    (c) => c.giro],
    ['Régimen tributario',      (c) => c.regimen || c.regimen_tributario],
    ['Teléfono',                (c) => c.telefono || c.telefono_corporativo || c.whatsapp],
    ['Correo',                  (c) => c.email_corporativo || c.correo],
    ['Representante legal',     (c) => c.nombre_rep || c.repNombre],
    ['RUT del representante',   (c) => c.rut_rep_encrypted || c.repRut],
    ['Dirección',               (c) => c.direccion],
    ['Comuna',                  (c) => c.comuna],
    ['Ciudad',                  (c) => c.ciudad],
];
const PLACEHOLDERS_FICHA = ['SIN ESPECIFICAR', 'SIN DIRECCIÓN', 'SIN DIRECCION', 'SIN NOMBRE'];
const tieneValorReal = (v) => !isEmptyField(v) && !PLACEHOLDERS_FICHA.includes(String(v).trim().toUpperCase());

const camposFaltantes = (c) => CAMPOS_COMPLETITUD.filter(([, leer]) => !tieneValorReal(leer(c))).map(([n]) => n);

const completitudFicha = (c) => {
    const llenos = CAMPOS_COMPLETITUD.length - camposFaltantes(c).length;
    return Math.round((llenos / CAMPOS_COMPLETITUD.length) * 100);
};

// Vistas válidas y migración de valores antiguos guardados en localStorage
const VISTAS_VALIDAS = ['activos', 'baja', 'usuarios'];
const normalizarVista = (v) => {
    if (v === 'suspendidos') return 'baja'; // suspendido ahora es de baja
    if (['activas', 'inactivas', 'completar', 'todas', 'nuevos'].includes(v)) return 'activos';
    return VISTAS_VALIDAS.includes(v) ? v : 'activos';
};

// Persistencia de filtros del CRM (se recuerdan entre sesiones)
const CRM_FILTERS_KEY = 'crm_filters_v1';
const loadFilters = () => {
    try { return JSON.parse(localStorage.getItem(CRM_FILTERS_KEY) || '{}'); }
    catch { return {}; }
};

const CRM = () => {
  // La navegación de sub-páginas vive en el menú lateral (?sub=...)
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('sub') || 'dashboard';
  const setActiveTab = (id) => setSearchParams({ sub: id });

  // El administrador de la organización ve quién creó cada empresa
  const { user, selectedCompany, setSelectedCompany } = useAuth();
  const esAdminMaster = user?.rol === 'Administrador';
  // Qué universo de empresas se está mirando. '' es la cartera vigente; 'fuera'
  // son las que salieron de la planilla y hasta ahora no aparecían en ninguna
  // pestaña —eran 81— así que un ex cliente que volvía resultaba inencontrable.
  const [carteraModo, setCarteraModo] = useState('');
  const { clients: dbClients, planes, serviciosDisponibles, preciosPlanTramo, cashFlow, services, compliance, risk, chartsSample, loading, refresh } = useBunkerData(carteraModo);
  const _saved = useMemo(loadFilters, []);
  const [clients, setClients] = useState([]);
  const [searchTerm, setSearchTerm] = useState(_saved.searchTerm || '');
  const [statusFilter, setStatusFilter] = useState(_saved.statusFilter || 'Todos');
  const [typeFilter, setTypeFilter] = useState(_saved.typeFilter || 'Todos');
  const [planFilter, setPlanFilter] = useState(_saved.planFilter || 'Todos');
  const [selectedClient, setSelectedClient] = useState(null);
  // Vista de la lista: 'activos' | 'suspendidos' | 'completar' | 'baja' | 'usuarios'
  const [vista, setVista] = useState(normalizarVista(_saved.vista));
  // Filtro por creador (solo Administrador master)
  const [creadorFilter, setCreadorFilter] = useState(_saved.creadorFilter || 'Todos');

  // Recuerda los filtros entre sesiones
  useEffect(() => {
    localStorage.setItem(CRM_FILTERS_KEY, JSON.stringify({ searchTerm, statusFilter, typeFilter, planFilter, vista, creadorFilter }));
  }, [searchTerm, statusFilter, typeFilter, planFilter, vista, creadorFilter]);
  const [showCrearCliente, setShowCrearCliente] = useState(false);
  const [showCrearEmpresa, setShowCrearEmpresa] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showImportProspectos, setShowImportProspectos] = useState(false);
  const [personasReload, setPersonasReload] = useState(0);

  useEffect(() => {
    if (dbClients) setClients(dbClients);
  }, [dbClients]);

  // NOTA: El selector de empresa vive en el header global (GlobalCompanySelector).

  const stats = useMemo(() => {
      if (!clients) return { total: 0, criticos: 0, f29Pendientes: 0, alDia: 0 };
      const clientesEnVista = clients.filter(c => {
          if (vista === 'usuarios') return esCreadaPorUsuario(c);
          // Las creadas por clientes NO se mezclan en las pestañas de estado
          if (esCreadaPorUsuario(c)) return false;
          if (vista === 'todas') return true; // todas las empresas de la organización
          return clasificarCliente(c) === vista;
      });
      // Los KPI salen de los COBROS reales (cobro_mensual), no de empresa.estado_pago:
      // ese campo es un texto de la importación del Excel que nadie actualiza nunca —
      // no existe un solo UPDATE en el backend que lo toque—, así que mostraba
      // "AL DIA" a clientes con deuda y "NO PAGADO" a clientes que ya habían pagado.
      return {
          total: clientesEnVista.length,
          criticos: clientesEnVista.filter(esMoroso).length,
          f29Pendientes: clientesEnVista.filter(c => {
              const f29 = String(c.estado_f29 || c.estadoFormulario || '').trim().toUpperCase();
              return f29 === 'PENDIENTE';
          }).length,
          alDia: clientesEnVista.filter(c => !esMoroso(c)).length,
          deudaTotal: clientesEnVista.reduce((s, c) => s + (Number(c.deudaVencida) || 0), 0),
      };
  }, [clients, vista]);

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
          const giro = c.giro || '';
          const direccion = c.direccion || '';
          const comuna = c.comuna || '';
          const planNombre = c.plan || c.plan_nombre || '';
          // Vista por estado real del cliente. Las creadas por clientes solo
          // salen en su propia pestaña "usuarios".
          const matchActividad =
              vista === 'usuarios' ? esCreadaPorUsuario(c)
            : esCreadaPorUsuario(c) ? false
            : vista === 'todas' ? true
            : clasificarCliente(c) === vista;
          // Filtro por quién lleva el cliente. Antes solo actuaba dentro de la
          // pestaña "Creadas por usuarios", así que en la lista normal el selector
          // no hacía nada aunque estuviera puesto.
          const matchCreador = creadorFilter === 'Todos' || c.usuarioCreador === creadorFilter;

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
              cleanStr(giro).includes(termClean) ||
              cleanStr(direccion).includes(termClean) ||
              cleanStr(comuna).includes(termClean) ||
              (termDigits !== '' && telDigits.includes(termDigits));
          const matchType = typeFilter === 'Todos' || tipo === typeFilter;
          const matchPlan = planFilter === 'Todos' || planNombre === planFilter;
          let matchStatus = true;
          // Mismo criterio que los KPI: la cobranza manda, no el campo estático.
          if (statusFilter === 'Críticos') {
              matchStatus = esMoroso(c);
          } else if (statusFilter === 'F29 Pendientes') {
              matchStatus = f29 === 'PENDIENTE';
          } else if (statusFilter === 'Al Día') {
              matchStatus = !esMoroso(c);
          }
          return matchSearch && matchType && matchPlan && matchStatus && matchActividad && matchCreador;
      });
  }, [clients, searchTerm, statusFilter, typeFilter, planFilter, vista, creadorFilter]);

  // Lista de creadores (para el filtro del Administrador master)
  const creadores = useMemo(() => {
      const set = new Set();
      clients.forEach(c => { if (c.usuarioCreador) set.add(c.usuarioCreador); });
      return Array.from(set).sort();
  }, [clients]);

  // KPI: cuántos clientes hay en cada pestaña (las creadas por usuarios se cuentan aparte)
  const conteos = useMemo(() => {
      const acc = { activos: 0, suspendidos: 0, completar: 0, baja: 0, usuarios: 0 };
      clients.forEach(c => {
          if (esCreadaPorUsuario(c)) { acc.usuarios++; return; }
          acc[clasificarCliente(c)]++;
      });
      return acc;
  }, [clients]);

  // Si se elimina la empresa que está seleccionada en el encabezado, hay que
  // soltarla en el momento. Si no, el selector sigue mostrando una empresa que
  // ya no existe y todos los módulos filtran por un id fantasma: salen vacíos
  // y no hay manera de recuperarse desde la pantalla.
  const soltarSiEsLaSeleccionada = (ids) => {
    const borradas = new Set(Array.isArray(ids) ? ids : [ids]);
    if (selectedCompany?.id && borradas.has(selectedCompany.id)) {
      setSelectedCompany(null);
      localStorage.removeItem('selectedCompany');
    }
  };

  const handleDeleteClient = async (clientToDelete) => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      if (!user.sessionId) throw new Error("Sesión inválida");
      const res = await eliminarEmpresaApi(user.sessionId, clientToDelete.id);
      const payload = await res.json();
      if (!payload.success) throw new Error(payload.message || 'No se pudo eliminar.');
      setClients(prev => prev.filter(c => c.id !== clientToDelete.id));
      soltarSiEsLaSeleccionada(clientToDelete.id);
      setSelectedClient(null);
      toast({ title: "Cliente eliminado", description: payload.message });
      refresh();
    } catch (error) {
      toast({ variant: "destructive", title: "No se pudo eliminar", description: error.message });
    }
  };

  const handleBulkDelete = async (clientsArr) => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (!user.sessionId) return;
    let ok = 0, fail = 0;
    for (const c of clientsArr) {
      try {
        const res = await eliminarEmpresaApi(user.sessionId, c.id);
        const payload = await res.json();
        if (payload.success) ok++; else fail++;
      } catch { fail++; }
    }
    const ids = new Set(clientsArr.map(c => c.id));
    setClients(prev => prev.filter(c => !ids.has(c.id)));
    soltarSiEsLaSeleccionada([...ids]);
    setSelectedClient(null);
    toast({ title: "Eliminación masiva", description: `${ok} eliminados${fail ? `, ${fail} no se pudieron (tienen registros asociados)` : ''}.` });
    refresh();
  };

  // REGISTRAR PAGOS EN LOTE
  //
  // Antes esto escribía `estado_pago` en la ficha, un texto que la lista ni
  // siquiera miraba: se marcaba "pagado" y el cliente seguía apareciendo moroso.
  // Ahora marca los cobros pendientes, que es lo que de verdad significa cobrar.
  //
  // Se confirma con el monto exacto porque es plata: dar por pagado lo que no se
  // pagó hace que se deje de perseguir a quien debe.
  const handleBulkRegistrarPago = async (clientsArr) => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (!user.sessionId) return;

    const deuda = clientsArr.reduce((s, c) => s + (Number(c.deudaTotal) || Number(c.deudaVencida) || 0), 0);
    const conDeuda = clientsArr.filter(c => (Number(c.deudaTotal) || Number(c.deudaVencida) || 0) > 0);

    if (conDeuda.length === 0) {
      toast({ title: 'Nada que registrar', description: 'Ninguno de los seleccionados tiene cobros pendientes.' });
      return;
    }
    if (!window.confirm(
      `Se registrará el pago de ${conDeuda.length} cliente(s) por un total de $${deuda.toLocaleString('es-CL')}.\n\n` +
      `Sus cobros pendientes quedarán como PAGADOS y dejarán de aparecer en la cobranza.\n\n¿Continuar?`
    )) return;

    let ok = 0, marcados = 0, total = 0;
    for (const c of conDeuda) {
      try {
        const r = await registrarPagoClienteApi(user.sessionId, c.id);
        const d = await r.json();
        if (d.success) { ok++; marcados += d.marcados || 0; total += Number(d.total) || 0; }
      } catch { /* sigue con el resto */ }
    }
    toast({
      title: 'Pagos registrados',
      description: `${ok} cliente(s) · ${marcados} cobro(s) por $${total.toLocaleString('es-CL')}.`,
    });
    refresh();
  };

  const handleUpdateClient = async (updatedClient) => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      if (!user.sessionId) throw new Error("Sesión inválida");
      const res = await updateClienteApi(user.sessionId, updatedClient.id, updatedClient);
      if(res.success || res){
          setClients(clients.map(c => c.id === updatedClient.id ? updatedClient : c));
          if(selectedClient?.id === updatedClient.id) setSelectedClient(updatedClient);
          toast({ title: "Cliente actualizado", description: "Los cambios se guardaron correctamente." });
          refresh(); // trae lo que recalculó el servidor (score, estados, servicios)
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo actualizar el cliente." });
    }
  };

  if (loading) return <div className="h-full flex items-center justify-center text-slate-500"><div className="animate-spin w-8 h-8 border-4 border-[#199b4d] border-t-transparent rounded-full"></div></div>;

  return (
    <CrmErrorBoundary>
    <div className="h-full flex flex-col gap-3 lg:gap-5 relative">
      {activeTab !== 'dashboard' && (
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 flex-shrink-0">
          <div>
              <h1 className="text-xl md:text-2xl font-black text-[#1a1c1e] uppercase tracking-tighter">{TITULOS[activeTab] || 'CRM'}</h1>
          </div>

          <div className="flex flex-wrap items-center gap-3 z-50">
              {activeTab === 'list' && (
                <button
                    onClick={() => setShowImport(true)}
                    className="flex items-center gap-2 bg-white hover:bg-slate-50 border border-[#efe8dd] text-slate-600 px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors"
                >
                    <Upload size={14} /> Importar
                </button>
              )}
              {activeTab === 'prospectos' && (
                <button
                    onClick={() => setShowImportProspectos(true)}
                    className="flex items-center gap-2 bg-white hover:bg-slate-50 border border-[#efe8dd] text-slate-600 px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors"
                >
                    <Upload size={14} /> Importar
                </button>
              )}
              <button
                  onClick={() => activeTab === 'prospectos' ? setShowCrearCliente(true) : setShowCrearEmpresa(true)}
                  className="flex items-center gap-2 bg-[#199b4d] hover:bg-[#147a3d] text-white px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm transition-colors"
              >
                  <UserPlus size={14} /> {activeTab === 'prospectos' ? 'Crear Prospecto' : 'Crear Cliente'}
              </button>
          </div>
        </div>
      )}

      {activeTab === 'dashboard' && (
        <div className="flex-1 min-h-0">
          <CrmDashboard clients={clients} onCrear={() => setShowCrearCliente(true)} />
        </div>
      )}

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
                planFilter={planFilter}
                setPlanFilter={setPlanFilter}
                planes={planes}
                vista={vista}
                setVista={setVista}
                conteos={conteos}
                carteraModo={carteraModo}
                setCarteraModo={setCarteraModo}
                creadorFilter={creadorFilter}
                setCreadorFilter={setCreadorFilter}
                creadores={creadores}
                onBulkDelete={handleBulkDelete}
                onBulkRegistrarPago={handleBulkRegistrarPago}
                onCrear={() => setShowCrearEmpresa(true)}
                esAdminMaster={esAdminMaster}
                getCompletitud={completitudFicha}
                getFaltantes={camposFaltantes}
            />

            <AnimatePresence>
                {selectedClient && (
                    <ClientDetailDrawer
                        client={selectedClient}
                        onClose={() => setSelectedClient(null)}
                        onUpdateClient={handleUpdateClient}
                        onDelete={handleDeleteClient}
                        planes={planes}
                        serviciosDisponibles={serviciosDisponibles}
                        preciosPlanTramo={preciosPlanTramo}
                        onRefresh={refresh}
                    />
                )}
            </AnimatePresence>
        </div>
      )}

      {activeTab === 'prospectos' && (
        <div className="flex-1 min-h-0">
          <PersonasPanel reloadKey={personasReload} onCrear={() => setShowCrearCliente(true)} />
        </div>
      )}

      {/* Las tareas se mudaron a su propio módulo, al mismo nivel que CRM y
          Contabilidad: /tareas. Quien llegue con el enlace viejo (?sub=tareas)
          se redirige, para no dejarlo mirando una pantalla en blanco. */}
      {activeTab === 'tareas' && <Navigate to="/tareas" replace />}

      {/* Correo y WhatsApp se mudaron a Comunicaciones por la misma razón:
          hablarle al cliente es su propio trabajo, y allá está junto al correo
          masivo que antes vivía en el facturador. Los enlaces viejos siguen
          funcionando —los hay en marcadores y en pantallas que navegan acá—. */}
      {activeTab === 'whatsapp' && <Navigate to="/comunicaciones?sub=whatsapp" replace />}
      {activeTab === 'correo'   && <Navigate to="/comunicaciones?sub=correo" replace />}

      {activeTab === 'interacciones' && (
        <div className="flex-1 min-h-0">
          <InteraccionesPanel />
        </div>
      )}

      {activeTab === 'analytics' && (
        <div className="flex-1 min-h-0 flex flex-col gap-3">
          {chartsSample && (
            <div className="flex items-center gap-2 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex-shrink-0">
              <FileSpreadsheet size={13} /> Los gráficos muestran <span className="uppercase tracking-widest">datos de ejemplo</span> — aún no hay historial financiero real cargado.
            </div>
          )}
          <CrmAnalytics clients={clients} cashFlow={cashFlow} />
        </div>
      )}

      <AnimatePresence>
        {showCrearCliente && (
          <CrearClienteModal
            onClose={() => setShowCrearCliente(false)}
            onCreated={() => { setPersonasReload(n => n + 1); setActiveTab('prospectos'); }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCrearEmpresa && (
          <CrearEmpresaModal
            planes={planes}
            onClose={() => setShowCrearEmpresa(false)}
            onCreated={() => { refresh(); setActiveTab('list'); }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showImport && (
          <CrmImportModal
            onClose={() => setShowImport(false)}
            onImported={() => refresh()}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showImportProspectos && (
          <CrmImportProspectosModal
            onClose={() => setShowImportProspectos(false)}
            onImported={() => setPersonasReload(n => n + 1)}
          />
        )}
      </AnimatePresence>
    </div>
    </CrmErrorBoundary>
  );
};

export default CRM;