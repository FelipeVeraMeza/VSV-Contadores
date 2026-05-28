import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowUpRight, ArrowDownRight, Eye, Plus, Loader2, FileCheck,
  CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Award
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { obtenerHistorialBunker, obtenerComprasBunker } from '@/services/dteConsultasService';
import NuevoMovimientoModal from '@/components/contabilidad/modals/NuevoMovimientoModal';
import AsientoDocumentoModal from '@/components/contabilidad/modals/AsientoDocumentoModal';

const TIPO_DTE_MAP = {
  33: 'FAC. ELECTRÓNICA', 34: 'FAC. EXENTA', 61: 'NOTA DE CRÉDITO',
  56: 'NOTA DE DÉBITO', 52: 'GUÍA DE DESPACHO', 39: 'BOLETA', 110: 'FAC. EXPORTACIÓN'
};

const MESES = [
  { value: '01', label: 'ENERO' }, { value: '02', label: 'FEBRERO' },
  { value: '03', label: 'MARZO' }, { value: '04', label: 'ABRIL' },
  { value: '05', label: 'MAYO' }, { value: '06', label: 'JUNIO' },
  { value: '07', label: 'JULIO' }, { value: '08', label: 'AGOSTO' },
  { value: '09', label: 'SEPTIEMBRE' }, { value: '10', label: 'OCTUBRE' },
  { value: '11', label: 'NOVIEMBRE' }, { value: '12', label: 'DICIEMBRE' }
];
const ANIOS = ['2024', '2025', '2026', '2027'];
const ITEMS_PER_PAGE = 12;

const formatText = (str) => {
  if (!str) return '';
  return str.toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
};
const formatCLP = (val) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(val || 0);

const COLOR_MAP = {
  ventas: {
    active: 'bg-emerald-500/10 text-emerald-400 border-b-2 border-emerald-500',
    badge: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
    total: 'text-emerald-400',
    row: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  },
  compras: {
    active: 'bg-red-500/10 text-red-400 border-b-2 border-red-500',
    badge: 'bg-red-500/10 text-red-400 border border-red-500/20',
    total: 'text-red-400',
    row: 'bg-red-500/10 text-red-400 border-red-500/20',
  },
  honorarios: {
    active: 'bg-amber-500/10 text-amber-400 border-b-2 border-amber-500',
    badge: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
    total: 'text-amber-400',
    row: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  },
};

const MovimientosContables = ({ empresaId }) => {
  const [activeTab, setActiveTab] = useState('ventas');
  const [isLoading, setIsLoading] = useState(false);
  const [rawVentas, setRawVentas] = useState([]);
  const [rawCompras, setRawCompras] = useState([]);
  const [honorarios] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [isNuevoModalOpen, setIsNuevoModalOpen] = useState(false);
  const [isAsientoModalOpen, setIsAsientoModalOpen] = useState(false);
  const [selectedDocumento, setSelectedDocumento] = useState(null);

  const now = new Date();
  const [mes, setMes] = useState((now.getMonth() + 1).toString().padStart(2, '0'));
  const [anio, setAnio] = useState(now.getFullYear().toString());

  const cargarDatos = useCallback(async () => {
    setIsLoading(true);
    try {
      const targetId = empresaId || 'ALL';
      const [resV, resC] = await Promise.all([
        obtenerHistorialBunker(targetId),
        obtenerComprasBunker(targetId),
      ]);
      setRawVentas(resV.ok ? (resV.documentos || []) : []);
      setRawCompras(resC.ok ? (resC.documentos || []) : []);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo cargar los movimientos.' });
    } finally {
      setIsLoading(false);
    }
  }, [empresaId]);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);
  useEffect(() => { setCurrentPage(1); }, [activeTab, mes, anio]);

  const periodo = `${anio}-${mes}`;
  const ventas = useMemo(() => rawVentas.filter(d => d.fecha_emision?.startsWith(periodo)), [rawVentas, periodo]);
  const compras = useMemo(() => rawCompras.filter(d => d.fecha_emision?.startsWith(periodo)), [rawCompras, periodo]);

  const docActivos = activeTab === 'ventas' ? ventas : activeTab === 'compras' ? compras : honorarios;
  const totalPages = Math.ceil(docActivos.length / ITEMS_PER_PAGE) || 1;
  const currentData = docActivos.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const totales = useMemo(() => docActivos.reduce((acc, doc) => {
    const neto = Number(doc.monto_neto) || 0;
    const iva = Number(doc.monto_iva) || Math.round(neto * 0.19);
    const total = Number(doc.monto_total) || (neto + iva);
    return { count: acc.count + 1, total: acc.total + total, neto: acc.neto + neto, iva: acc.iva + iva };
  }, { count: 0, total: 0, neto: 0, iva: 0 }), [docActivos]);

  const handleVerAsiento = (doc) => {
    setSelectedDocumento({ ...doc, tipoMovimiento: activeTab });
    setIsAsientoModalOpen(true);
  };

  const colors = COLOR_MAP[activeTab];

  const TABS = [
    { id: 'ventas', label: 'Ventas', icon: ArrowUpRight, count: ventas.length },
    { id: 'compras', label: 'Compras', icon: ArrowDownRight, count: compras.length },
    { id: 'honorarios', label: 'Honorarios', icon: Award, count: honorarios.length },
  ];

  return (
    <div className="space-y-5">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center bg-black/40 border border-white/10 rounded-xl px-1 py-1">
          <div className="flex items-center pl-3 pr-1">
            <CalendarDays className="h-4 w-4 text-blue-400" />
          </div>
          <select value={mes} onChange={(e) => setMes(e.target.value)}
            className="bg-transparent text-white text-xs font-black uppercase tracking-widest px-2 py-2 focus:outline-none appearance-none cursor-pointer hover:text-blue-400 transition-colors">
            {MESES.map(m => <option key={m.value} value={m.value} className="bg-slate-900 text-white">{m.label}</option>)}
          </select>
          <span className="text-white/20 font-light mx-1">/</span>
          <select value={anio} onChange={(e) => setAnio(e.target.value)}
            className="bg-transparent text-white text-xs font-black uppercase tracking-widest px-2 py-2 focus:outline-none appearance-none cursor-pointer hover:text-blue-400 transition-colors">
            {ANIOS.map(a => <option key={a} value={a} className="bg-slate-900 text-white">{a}</option>)}
          </select>
          <div className="pr-3 pl-1 pointer-events-none">
            <ChevronDown className="h-4 w-4 text-gray-500" />
          </div>
        </div>

        <Button onClick={() => setIsNuevoModalOpen(true)}
          className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black uppercase text-[10px] tracking-widest">
          <Plus className="h-4 w-4 mr-2" />
          Nueva {activeTab === 'ventas' ? 'Venta' : activeTab === 'compras' ? 'Compra' : 'Honorario'}
        </Button>
      </div>

      {/* SUB-TABS */}
      <div className="flex border-b border-white/5">
        {TABS.map(({ id, label, icon: Icon, count }) => {
          const isActive = activeTab === id;
          const cm = COLOR_MAP[id];
          return (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-6 py-3.5 font-black uppercase text-[10px] tracking-widest transition-all ${isActive ? cm.active : 'text-gray-500 hover:text-white hover:bg-white/5'}`}>
              <Icon className="h-3.5 w-3.5" />
              {label}
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-black ${isActive ? cm.badge : 'bg-white/5 text-gray-600'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* RESUMEN */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Documentos', value: String(totales.count) },
          { label: 'Neto', value: formatCLP(totales.neto) },
          { label: 'IVA 19%', value: formatCLP(totales.iva) },
          { label: 'Total', value: formatCLP(totales.total) },
        ].map((item) => (
          <div key={item.label} className="bg-black/20 rounded-xl border border-white/5 p-4">
            <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-1">{item.label}</p>
            <p className="font-black text-white font-mono text-sm tracking-tighter">{item.value}</p>
          </div>
        ))}
      </div>

      {/* TABLA */}
      <div className="bg-[#0f172a]/80 rounded-xl border border-white/5 overflow-hidden backdrop-blur-md shadow-2xl">
        {isLoading ? (
          <div className="p-16 flex flex-col items-center justify-center">
            <Loader2 className="h-10 w-10 text-blue-500 animate-spin mb-4" />
            <span className="text-blue-400 font-black text-xs uppercase tracking-widest animate-pulse">Cargando movimientos...</span>
          </div>
        ) : docActivos.length === 0 ? (
          <div className="p-16 text-center flex flex-col items-center justify-center">
            <div className="bg-white/5 p-5 rounded-full mb-4 border border-white/10">
              <FileCheck className="h-8 w-8 text-gray-500" />
            </div>
            <h4 className="text-white font-black tracking-wide uppercase text-sm">Sin movimientos</h4>
            <p className="text-gray-500 text-[10px] mt-2 uppercase tracking-widest font-black">
              No hay {activeTab} registradas para este período.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-300 min-w-[900px]">
                <thead className="bg-white/5 border-b border-white/10 text-[10px] uppercase tracking-widest font-black text-gray-400">
                  <tr>
                    <th className="px-5 py-4">Fecha Emisión</th>
                    <th className="px-5 py-4">Período</th>
                    <th className="px-5 py-4">Tipo Documento</th>
                    <th className="px-5 py-4">Folio</th>
                    <th className="px-5 py-4">RUT {activeTab === 'compras' ? 'Proveedor' : 'Cliente'}</th>
                    <th className="px-5 py-4">Razón Social</th>
                    <th className="px-5 py-4 text-right">Monto</th>
                    <th className="px-5 py-4 text-center">Asiento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  <AnimatePresence>
                    {currentData.map((doc, idx) => {
                      const neto = Number(doc.monto_neto) || 0;
                      const iva = Number(doc.monto_iva) || Math.round(neto * 0.19);
                      const total = Number(doc.monto_total) || (neto + iva);
                      const rut = activeTab === 'compras' ? doc.rut_proveedor : doc.rut_cliente;
                      const razon = formatText(activeTab === 'compras' ? doc.razon_social_proveedor : doc.razon_social);
                      const fecha = doc.fecha_emision
                        ? new Date(doc.fecha_emision).toLocaleDateString('es-CL', { timeZone: 'UTC' })
                        : 'N/A';
                      const per = doc.fecha_emision ? doc.fecha_emision.substring(0, 7) : 'N/A';

                      return (
                        <motion.tr
                          key={doc.id || idx}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: idx * 0.02 }}
                          className="hover:bg-white/[0.03] transition-colors group cursor-pointer"
                          onClick={() => handleVerAsiento(doc)}
                        >
                          <td className="px-5 py-3.5 text-xs text-gray-400 font-bold whitespace-nowrap">{fecha}</td>
                          <td className="px-5 py-3.5 text-xs font-mono text-blue-400 font-bold">{per}</td>
                          <td className="px-5 py-3.5">
                            <span className={`px-2 py-1 rounded text-[9px] font-black uppercase border ${colors.row}`}>
                              {TIPO_DTE_MAP[doc.tipo_dte] || `TIPO ${doc.tipo_dte}`}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 font-black text-white italic text-sm">#{doc.folio}</td>
                          <td className="px-5 py-3.5 font-mono text-xs text-gray-400">{rut}</td>
                          <td className="px-5 py-3.5 max-w-[180px]">
                            <span className="text-xs text-gray-200 font-bold truncate block" title={razon}>
                              {razon || 'SIN RAZÓN SOCIAL'}
                            </span>
                          </td>
                          <td className={`px-5 py-3.5 text-right font-black font-mono tracking-tighter ${colors.total}`}>
                            {formatCLP(total)}
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleVerAsiento(doc); }}
                              className="p-1.5 text-blue-400 hover:bg-blue-500/20 rounded transition-colors opacity-0 group-hover:opacity-100"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between px-5 py-4 bg-black/20 border-t border-white/10">
              <div className="text-[10px] text-gray-500 font-black uppercase tracking-widest">
                {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, docActivos.length)} de {docActivos.length}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                  className="h-8 bg-black/40 border-white/10 text-gray-400 hover:text-white disabled:opacity-20 font-black text-xs uppercase">
                  <ChevronLeft size={14} className="mr-1" /> ANT
                </Button>
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-2">{currentPage} / {totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                  className="h-8 bg-black/40 border-white/10 text-gray-400 hover:text-white disabled:opacity-20 font-black text-xs uppercase">
                  SIG <ChevronRight size={14} className="ml-1" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      <NuevoMovimientoModal
        isOpen={isNuevoModalOpen}
        setIsOpen={setIsNuevoModalOpen}
        tipo={activeTab}
        empresaId={empresaId}
        onGuardado={cargarDatos}
      />
      <AsientoDocumentoModal
        isOpen={isAsientoModalOpen}
        setIsOpen={setIsAsientoModalOpen}
        documento={selectedDocumento}
        empresaId={empresaId}
      />
    </div>
  );
};

export default MovimientosContables;
