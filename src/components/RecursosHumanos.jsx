import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { Users, FileWarning } from 'lucide-react';
import RrhhDashboard from '@/components/rrhh/RrhhDashboard';
import GestionEmpleados from '@/components/rrhh/GestionEmpleados';
import GestionLiquidaciones from '@/components/rrhh/GestionLiquidaciones';
import CentralizacionRrhh from '@/components/rrhh/CentralizacionRrhh';
import HaberesDescuentosRrhh from '@/components/rrhh/HaberesDescuentosRrhh';
import LicenciasMedicasRrhh from '@/components/rrhh/LicenciasMedicasRrhh';
import VacacionesRrhh from '@/components/rrhh/VacacionesRrhh';
import FiniquitosRrhh from '@/components/rrhh/FiniquitosRrhh';
import AsistenciaRrhh from '@/components/rrhh/AsistenciaRrhh';
import DocumentosRrhh from '@/components/rrhh/DocumentosRrhh';
import CertificadosRrhh from '@/components/rrhh/CertificadosRrhh';
import ReportesRrhh from '@/components/rrhh/ReportesRrhh';
import ConfiguracionRrhh from '@/components/rrhh/ConfiguracionRrhh';
import NuevoEmpleadoModal from '@/components/rrhh/modals/NuevoEmpleadoModal';
import NuevaLiquidacionModal from '@/components/rrhh/modals/NuevaLiquidacionModal';
import { useAuth } from '@/hooks/useAuth';
import { seccionDeSub } from '@/config/rrhhNav';

const SUBPAGINAS = {
  dashboard:      { titulo: 'Dashboard',             subtitulo: 'Resumen del período y accesos rápidos' },
  // Trabajadores
  trabajadores:   { titulo: 'Trabajadores',          subtitulo: 'Fichas del personal' },
  cargas:         { titulo: 'Cargas familiares',     subtitulo: 'Cargas declaradas por trabajador' },
  contratos:      { titulo: 'Contratos',             subtitulo: 'Contratos y anexos del personal' },
  cargos:         { titulo: 'Cargos y Departamentos',subtitulo: 'Estructura organizacional' },
  'doc-trabajador':{ titulo: 'Documentos del trabajador', subtitulo: 'Archivos de la ficha' },
  historial:      { titulo: 'Historial',             subtitulo: 'Auditoría de cambios de ficha' },
  // Remuneraciones
  haberes:        { titulo: 'Haberes y Descuentos',  subtitulo: 'Conceptos fijos (recurrentes) por trabajador' },
  novedades:      { titulo: 'Novedades del período', subtitulo: 'Haberes y descuentos variables del mes' },
  liquidaciones:  { titulo: 'Liquidaciones',         subtitulo: 'Cálculo y aprobación de sueldos' },
  centralizacion: { titulo: 'Centralización',        subtitulo: 'Asiento contable de la nómina del período' },
  // Gestión laboral
  vacaciones:     { titulo: 'Vacaciones',            subtitulo: 'Saldo y registro de días de feriado legal' },
  licencias:      { titulo: 'Licencias Médicas',     subtitulo: 'Días no trabajados que ajustan la liquidación' },
  finiquitos:     { titulo: 'Finiquitos',            subtitulo: 'Cálculo de término de la relación laboral' },
  asistencia:     { titulo: 'Control de Asistencia', subtitulo: 'Registro de jornada por período' },
  // Documentos
  'doc-laborales':   { titulo: 'Documentos laborales',   subtitulo: 'Contratos, anexos y comunicaciones' },
  'doc-libro':       { titulo: 'Libro de Remuneraciones',subtitulo: 'Detalle del período por trabajador' },
  'doc-previred':    { titulo: 'PREVIRED',               subtitulo: 'Archivo de cotizaciones previsionales' },
  'doc-lre':         { titulo: 'Libro DT (LRE)',         subtitulo: 'Libro de Remuneraciones Electrónico' },
  'doc-nomina':      { titulo: 'Nómina Bancaria',        subtitulo: 'Archivo de pago para el banco' },
  'doc-certificados':{ titulo: 'Certificados',           subtitulo: 'Antigüedad laboral y renta' },
  'doc-envios':      { titulo: 'Envíos',                 subtitulo: 'Envío de documentos por correo' },
  // Reportes
  reportes:       { titulo: 'Reportes',              subtitulo: 'Libro de remuneraciones y archivos' },
  estadisticas:   { titulo: 'Estadísticas',          subtitulo: 'Indicadores y tendencias de nómina' },
  exportaciones:  { titulo: 'Exportaciones',         subtitulo: 'Descargas masivas de datos' },
  // Configuración
  'cfg-empresa':     { titulo: 'Empresa',                 subtitulo: 'Parámetros de nómina por empresa' },
  'cfg-parametros':  { titulo: 'Parámetros previsionales',subtitulo: 'Indicadores del período (UF, UTM, topes, tasas)' },
  'cfg-afp':         { titulo: 'AFP',                     subtitulo: 'Comisiones de administración por AFP' },
  'cfg-salud':       { titulo: 'Salud',                   subtitulo: 'Catálogo de isapres' },
  'cfg-mutual':      { titulo: 'Mutual',                  subtitulo: 'Organismo y tasa del seguro de accidentes' },
  'cfg-conceptos':   { titulo: 'Conceptos',               subtitulo: 'Catálogo de haberes y descuentos' },
  'cfg-contabilidad':{ titulo: 'Contabilidad',            subtitulo: 'Mapeo de cuentas para la centralización' },
  'cfg-plantillas':  { titulo: 'Plantillas',              subtitulo: 'Plantillas de documentos y correos' },
};

const Proximamente = ({ titulo }) => (
  <div className="flex flex-col items-center justify-center py-24 text-slate-400">
    <FileWarning className="h-14 w-14 mb-4 opacity-20" />
    <h3 className="text-lg font-semibold text-slate-900">{titulo}</h3>
    <p className="text-sm">Esta sección estará disponible próximamente.</p>
  </div>
);

const RecursosHumanos = () => {
  const { selectedCompany } = useAuth();
  const empresaId = selectedCompany?.id;
  const [searchParams, setSearchParams] = useSearchParams();
  const sub = searchParams.get('sub') || 'dashboard';
  const [isEmpleadoModalOpen, setIsEmpleadoModalOpen] = useState(false);
  const [isLiquidacionModalOpen, setIsLiquidacionModalOpen] = useState(false);

  const meta = SUBPAGINAS[sub] || SUBPAGINAS.dashboard;
  const seccion = seccionDeSub(sub);
  const conPestanas = seccion.items.length > 1;

  const renderSub = () => {
    switch (sub) {
      // Trabajadores
      case 'trabajadores':   return <GestionEmpleados empresaId={empresaId} onNew={() => setIsEmpleadoModalOpen(true)} />;
      case 'cargas':         return <Proximamente titulo="Cargas familiares" />;
      case 'contratos':      return <Proximamente titulo="Contratos" />;
      case 'cargos':         return <Proximamente titulo="Cargos y Departamentos" />;
      case 'doc-trabajador': return <Proximamente titulo="Documentos del trabajador" />;
      case 'historial':      return <Proximamente titulo="Historial de cambios" />;
      // Remuneraciones
      case 'haberes':        return <HaberesDescuentosRrhh empresaId={empresaId} modo="fijos" />;
      case 'novedades':      return <HaberesDescuentosRrhh empresaId={empresaId} modo="mes" />;
      case 'liquidaciones':  return <GestionLiquidaciones empresaId={empresaId} onAddLiquidation={() => setIsLiquidacionModalOpen(true)} />;
      case 'centralizacion': return <CentralizacionRrhh empresaId={empresaId} />;
      // Gestión laboral
      case 'vacaciones':     return <VacacionesRrhh empresaId={empresaId} />;
      case 'licencias':      return <LicenciasMedicasRrhh empresaId={empresaId} />;
      case 'finiquitos':     return <FiniquitosRrhh empresaId={empresaId} />;
      case 'asistencia':     return <AsistenciaRrhh empresaId={empresaId} />;
      // Documentos
      case 'doc-laborales':   return <Proximamente titulo="Documentos laborales" />;
      case 'doc-libro':       return <DocumentosRrhh empresaId={empresaId} tipo="libro" />;
      case 'doc-previred':    return <DocumentosRrhh empresaId={empresaId} tipo="previred" />;
      case 'doc-lre':         return <DocumentosRrhh empresaId={empresaId} tipo="lre" />;
      case 'doc-nomina':      return <DocumentosRrhh empresaId={empresaId} tipo="nomina" />;
      case 'doc-certificados':return <CertificadosRrhh empresaId={empresaId} />;
      case 'doc-envios':      return <Proximamente titulo="Envíos de documentos" />;
      // Reportes
      case 'reportes':       return <ReportesRrhh empresaId={empresaId} />;
      case 'estadisticas':   return <Proximamente titulo="Estadísticas" />;
      case 'exportaciones':  return <Proximamente titulo="Exportaciones" />;
      // Configuración (una sección por ítem)
      case 'cfg-empresa':      return <ConfiguracionRrhh empresaId={empresaId} seccion="empresa" />;
      case 'cfg-parametros':   return <ConfiguracionRrhh empresaId={empresaId} seccion="parametros" />;
      case 'cfg-afp':          return <ConfiguracionRrhh empresaId={empresaId} seccion="afp" />;
      case 'cfg-salud':        return <ConfiguracionRrhh empresaId={empresaId} seccion="isapres" />;
      case 'cfg-mutual':       return <ConfiguracionRrhh empresaId={empresaId} seccion="mutual" />;
      case 'cfg-conceptos':    return <ConfiguracionRrhh empresaId={empresaId} seccion="conceptos" />;
      case 'cfg-contabilidad': return <ConfiguracionRrhh empresaId={empresaId} seccion="mapeo" />;
      case 'cfg-plantillas':   return <Proximamente titulo="Plantillas" />;
      case 'dashboard':
      default:               return <RrhhDashboard empresaId={empresaId} />;
    }
  };

  return (
    <div className="space-y-6">
      <NuevoEmpleadoModal isOpen={isEmpleadoModalOpen} setIsOpen={setIsEmpleadoModalOpen} onAddEmpleado={() => {}} empresaId={empresaId} />
      <NuevaLiquidacionModal isOpen={isLiquidacionModalOpen} setIsOpen={setIsLiquidacionModalOpen} empresaId={empresaId} />

      {/* Encabezado contextual */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shadow-lg shadow-purple-900/30 flex-shrink-0">
          <Users className="h-6 w-6 text-white" />
        </div>
        <div>
          <p className="text-purple-600/80 text-[10px] font-semibold uppercase tracking-[0.25em]">Recursos Humanos</p>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight leading-tight">{seccion.label}</h1>
          <p className="text-slate-400 text-xs mt-0.5">{meta.subtitulo}</p>
        </div>
      </div>

      {/* Pestañas de la sección (sus sub-páginas van aquí, no en el menú) */}
      {conPestanas && (
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white border border-[#efe8dd] overflow-x-auto custom-scrollbar">
          {seccion.items.map(it => {
            const activo = it.id === sub;
            return (
              <button key={it.id} onClick={() => setSearchParams({ sub: it.id })}
                className={`px-3.5 h-9 rounded-lg text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0 ${activo ? 'bg-gradient-to-r from-purple-500 to-violet-600 text-white shadow' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}>
                {it.label}
              </button>
            );
          })}
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={sub}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {renderSub()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default RecursosHumanos;
