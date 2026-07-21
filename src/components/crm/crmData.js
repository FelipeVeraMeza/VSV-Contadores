import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth.jsx';
import { getCrmDataApi } from '../../services/crmService.js';

// Bus de refresco: el hook se usa en varios lugares a la vez (CRM y el selector de
// empresa del header) y cada uno tiene su propia copia de los datos. Al notificar por
// este evento, TODAS las vistas recargan; si no, los cambios no se ven hasta cerrar sesión.
const CRM_REFRESH_EVENT = 'crm:refresh';
export const notifyCrmChanged = () => window.dispatchEvent(new Event(CRM_REFRESH_EVENT));

// ==============================================================
// DATOS DE RESPALDO (MOCKS)
// Se mostrarán si la base de datos aún no tiene historial financiero
// ==============================================================
const FALLBACK_CASH_FLOW = [
  { name: 'SEP', facturado: 1.8, recaudado: 1.7, dts: 45 }, 
  { name: 'OCT', facturado: 2.1, recaudado: 1.9, dts: 52 },
  { name: 'NOV', facturado: 2.5, recaudado: 2.2, dts: 49 }, 
  { name: 'DIC', facturado: 3.4, recaudado: 3.1, dts: 80 },
  { name: 'ENE', facturado: 2.8, recaudado: 2.4, dts: 65 }, 
  { name: 'FEB', facturado: 2.4, recaudado: 1.8, dts: 60 },
];

const FALLBACK_SERVICES = [
  { name: 'Contabilidad', value: 45, color: '#3b82f6' }, 
  { name: 'RRHH', value: 25, color: '#8b5cf6' },
  { name: 'Renta', value: 20, color: '#10b981' }, 
  { name: 'Auditoría', value: 10, color: '#f59e0b' },
];

const FALLBACK_COMPLIANCE = [
  { name: 'Declarado OK', value: 65, color: '#10b981' }, 
  { name: 'Pendiente Info', value: 20, color: '#f59e0b' },
  { name: 'Sin Movimiento', value: 15, color: '#64748b' },
];

const FALLBACK_RISK = [
  { name: 'Suspendidos', monto: 2.1 }, 
  { name: 'No Pagados', monto: 0.8 }, 
  { name: 'Al Día', monto: 0 },
];

// ==============================================================
// HOOK PRINCIPAL DEL BUNKER
// ==============================================================
export const useBunkerData = () => {
  const { user, selectedCompany } = useAuth();
  
  const [clients, setClients] = useState([]);
  const [planes, setPlanes] = useState([]);
  const [serviciosDisponibles, setServiciosDisponibles] = useState([]);
  const [preciosPlanTramo, setPreciosPlanTramo] = useState([]);
  const [cashFlow, setCashFlow] = useState([]);
  const [services, setServices] = useState([]);
  const [compliance, setCompliance] = useState([]);
  const [risk, setRisk] = useState([]);
  const [chartsSample, setChartsSample] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    if (!user?.sessionId) {
      setClients([]);
      setCashFlow(FALLBACK_CASH_FLOW);
      setServices(FALLBACK_SERVICES);
      setCompliance(FALLBACK_COMPLIANCE);
      setRisk(FALLBACK_RISK);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const empresaId = selectedCompany?.id ?? selectedCompany?.empresaId ?? null;
      const response = await getCrmDataApi(user.sessionId, empresaId);
      const payload = await response.json();

      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.message || 'No se pudo cargar CRM');
      }

      // Seteamos los clientes reales que vengan de la base de datos
      setClients(payload?.clients || []);
      setPlanes(payload?.planes || []);
      setServiciosDisponibles(payload?.serviciosDisponibles || []);
      setPreciosPlanTramo(payload?.preciosPlanTramo || []);
      
      // MAGIA AQUÍ: Si el backend no envía datos para los gráficos (porque la DB está vacía), 
      // usamos los datos de respaldo para que la pantalla no se rompa ni quede en blanco.
      const hayGraficosReales = payload?.cashFlow?.length > 0;
      setCashFlow(hayGraficosReales ? payload.cashFlow : FALLBACK_CASH_FLOW);
      setServices(payload?.services?.length > 0 ? payload.services : FALLBACK_SERVICES);
      setCompliance(payload?.compliance?.length > 0 ? payload.compliance : FALLBACK_COMPLIANCE);
      setRisk(payload?.risk?.length > 0 ? payload.risk : FALLBACK_RISK);
      setChartsSample(!hayGraficosReales);

    } catch (error) {
      console.error("Error en el Búnker:", error.message);
      
      // Si hay error en la API, al menos mostramos los gráficos de prueba
      setCashFlow(FALLBACK_CASH_FLOW);
      setServices(FALLBACK_SERVICES);
      setCompliance(FALLBACK_COMPLIANCE);
      setRisk(FALLBACK_RISK);
      setChartsSample(true);
    } finally {
      setLoading(false);
    }
  }, [user?.sessionId, selectedCompany?.id, selectedCompany?.empresaId]);

  // Carga inicial y cuando cambia la sesión o la empresa seleccionada
  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Recarga cuando cualquier vista avisa que hubo cambios (crear/editar/eliminar)
  useEffect(() => {
    const handler = () => loadAll();
    window.addEventListener(CRM_REFRESH_EVENT, handler);
    return () => window.removeEventListener(CRM_REFRESH_EVENT, handler);
  }, [loadAll]);

  // refresh() notifica a TODAS las vistas, no solo a la que llama
  return { clients, planes, serviciosDisponibles, preciosPlanTramo, cashFlow, services, compliance, risk, chartsSample, loading, refresh: notifyCrmChanged };
};