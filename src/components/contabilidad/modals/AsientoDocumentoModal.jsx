import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, CheckCircle, AlertCircle, Plus, Trash2, Loader2, Pencil, Save, X, Link2 } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getChartOfAccountsApi, getDocumentosAfectablesApi } from '@/services/accountingService';
import { fetchWithAuth } from '@/services/apiClient';
import {
  TIPO_DTE_LABEL as TIPO_DTE_MAP, generarLineasAsiento, construirGlosa,
  calcularMontos, esNota, esNotaCredito,
    soloImputables,
} from '@/lib/documento';
import { cleanRut } from '@/lib/rut';
import { API_BASE_URL } from '../../../../config.js';

const formatCLP = (val) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(val || 0);
const formatText = (str) => str ? str.toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase() : '';
const formatRut = (rut) => cleanRut(rut || '');

// El asiento sale de `generarLineasAsiento`, compartido con MovimientosContables.
// Antes este modal tenía su propia versión que ignoraba el tipo de DTE: una nota
// de crédito se contabilizaba igual que una factura, sumando ventas e IVA débito
// en vez de rebajarlos.
const generarLineas = (neto, tipo, tipoDte, ivaDeclarado) =>
  generarLineasAsiento({ monto_neto: neto, monto_iva: ivaDeclarado, tipo_dte: tipoDte }, tipo);

const COLOR_MAP = {
  ventas:    { bg: 'bg-emerald-500/10', text: 'text-emerald-600', border: 'border-emerald-500/30' },
  compras:   { bg: 'bg-red-500/10',     text: 'text-red-500',     border: 'border-red-500/30' },
  honorarios:{ bg: 'bg-amber-500/10',   text: 'text-amber-600',   border: 'border-amber-500/30' },
};

const AsientoDocumentoModal = ({ isOpen, setIsOpen, documento, empresaId, onGuardado }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [lineas, setLineas] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  // Edición de los datos del documento
  const [isEditingDatos, setIsEditingDatos] = useState(false);
  const [isSavingDatos, setIsSavingDatos]   = useState(false);
  const [dRut, setDRut]         = useState('');
  const [dNombre, setDNombre]   = useState('');
  const [dTipoDte, setDTipoDte] = useState(33);
  const [dFolio, setDFolio]     = useState('');
  const [dFecha, setDFecha]     = useState(''); // YYYY-MM-DD
  const [dNeto, setDNeto]       = useState('');

  // Documento afectado por una nota de crédito/débito
  const [refDocId, setRefDocId] = useState('');

  const tipo = documento?.tipoMovimiento || 'ventas';
  const isCompra = tipo === 'compras';
  const colors = COLOR_MAP[tipo] || COLOR_MAP.ventas;
  const tipoLabel = tipo === 'ventas' ? 'Venta' : tipo === 'compras' ? 'Compra' : 'Honorario';

  const { data: planData } = useQuery({
    queryKey: ['chart-of-accounts', empresaId],
    queryFn: async () => {
      const res = await getChartOfAccountsApi(user.sessionId, empresaId);
      if (!res.ok) throw new Error();
      return (await res.json()).plan || [];
    },
    enabled: isOpen && !!user?.sessionId && !!empresaId,
  });
  const plan = planData || [];

  const esNotaDoc = esNota(dTipoDte);

  // Candidatos a documento afectado: mismo RUT, tipo afectable y emitidos hasta
  // la fecha de la nota.
  const { data: afectablesData, isFetching: cargandoAfectables } = useQuery({
    queryKey: ['documentos-afectables', empresaId, tipo, dRut, dFecha],
    queryFn: async () => {
      const res = await getDocumentosAfectablesApi(user.sessionId, {
        empresaId, clase: tipo, rut: dRut, fecha: dFecha,
      });
      if (!res.ok) return [];
      return (await res.json()).documentos || [];
    },
    enabled: isOpen && esNotaDoc && !!user?.sessionId,
  });
  const afectables = afectablesData || [];
  const refDoc = afectables.find(d => String(d.id) === String(refDocId)) || null;

  useEffect(() => {
    if (documento && isOpen) {
      setLineas(generarLineas(documento.monto_neto, tipo, documento.tipo_dte, documento.monto_iva));
      setDRut(isCompra ? (documento.rut_proveedor || '') : (documento.rut_cliente || ''));
      setDNombre(isCompra ? (documento.razon_social_proveedor || '') : (documento.razon_social || ''));
      setDTipoDte(documento.tipo_dte || 33);
      setDFolio(String(documento.folio ?? ''));
      setDFecha(documento.fecha_emision ? String(documento.fecha_emision).substring(0, 10) : '');
      setDNeto(String(documento.monto_neto ?? ''));
      setRefDocId('');
      setIsEditingDatos(false);
    }
  }, [documento, isOpen, tipo, isCompra]);

  // Preselecciona el documento afectado cuando hay uno solo del mismo monto.
  // Con varios candidatos no se elige: adivinar sería inventar contabilidad.
  useEffect(() => {
    if (!esNotaDoc || refDocId || afectables.length === 0) return;
    const totalNota = calcularMontos({ monto_neto: dNeto, monto_iva: documento?.monto_iva, tipo_dte: dTipoDte }).total;
    const exactos = afectables.filter(d => Number(d.monto_total) === totalNota);
    if (exactos.length === 1) setRefDocId(String(exactos[0].id));
  }, [esNotaDoc, afectables, refDocId, dNeto, dTipoDte, documento]);

  if (!documento) return null;

  // Mientras el neto no se edite se respeta el IVA que trae el documento; al
  // editarlo se recalcula al 19% (salvo exentas, que no llevan IVA).
  const netoEditado = Number(dNeto) !== Number(documento.monto_neto);
  const { neto, iva, total } = calcularMontos({
    monto_neto: dNeto,
    monto_iva: netoEditado ? null : documento.monto_iva,
    tipo_dte: dTipoDte,
  });

  const rut = formatRut(dRut);
  const razon = formatText(dNombre);
  const fecha = dFecha
    ? new Date(dFecha + 'T00:00:00').toLocaleDateString('es-CL', { timeZone: 'UTC' })
    : 'N/A';
  const periodo = dFecha ? dFecha.substring(0, 7) : 'N/A';
  const tipoDocLabel = TIPO_DTE_MAP[dTipoDte] || `TIPO ${dTipoDte}`;

  const totalDebe = lineas.reduce((s, l) => s + (Number(l.debe) || 0), 0);
  const totalHaber = lineas.reduce((s, l) => s + (Number(l.haber) || 0), 0);
  const cuadrado = Math.abs(totalDebe - totalHaber) < 1;

  const updateCuenta = (idx, codigo) => {
    const cta = plan.find(c => c.codigo === codigo);
    setLineas(prev => prev.map((l, i) => i !== idx ? l : { ...l, cuenta: codigo, nombre: cta?.descripcion || codigo }));
  };
  const updateMonto = (idx, field, value) => {
    setLineas(prev => prev.map((l, i) => i !== idx ? l : { ...l, [field]: Number(value) || 0 }));
  };
  const agregarLinea = () => setLineas(prev => [...prev, { cuenta: '', nombre: '', debe: 0, haber: 0 }]);
  const eliminarLinea = (idx) => setLineas(prev => prev.filter((_, i) => i !== idx));

  // Al cambiar el neto, recalcula IVA/total y regenera el asiento
  const onChangeNeto = (val) => {
    setDNeto(val);
    setLineas(generarLineas(val, tipo, dTipoDte, null));
  };

  // Cambiar el tipo de documento cambia el asiento: una nota de crédito
  // revierte el movimiento en vez de sumarlo.
  const onChangeTipoDte = (val) => {
    setDTipoDte(val);
    setRefDocId('');
    setLineas(generarLineas(dNeto, tipo, val, netoEditado ? null : documento.monto_iva));
  };

  const cancelarEdicion = () => {
    setDRut(isCompra ? (documento.rut_proveedor || '') : (documento.rut_cliente || ''));
    setDNombre(isCompra ? (documento.razon_social_proveedor || '') : (documento.razon_social || ''));
    setDTipoDte(documento.tipo_dte || 33);
    setDFolio(String(documento.folio ?? ''));
    setDFecha(documento.fecha_emision ? String(documento.fecha_emision).substring(0, 10) : '');
    setDNeto(String(documento.monto_neto ?? ''));
    setLineas(generarLineas(documento.monto_neto, tipo, documento.tipo_dte, documento.monto_iva));
    setIsEditingDatos(false);
  };

  const handleGuardarDatos = async () => {
    if (!documento.id) {
      toast({ variant: 'destructive', title: 'No se puede editar', description: 'El documento no tiene identificador.' });
      return;
    }
    if (!String(dFolio).trim()) {
      toast({ variant: 'destructive', title: 'Folio requerido' });
      return;
    }
    setIsSavingDatos(true);
    try {
      const res = await fetchWithAuth(`/dte-consulta/movimiento/${documento.id}`, user.sessionId, {
        method: 'PUT',
        body: {
          tipo_movimiento: tipo, empresa_id: empresaId,
          rut: dRut, nombre: dNombre, tipo_documento: dTipoDte, folio: dFolio, fecha: dFecha,
          monto_neto: neto, monto_iva: iva, monto_total: total,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al actualizar');
      toast({ title: '✅ Documento actualizado', description: `Folio #${dFolio}` });
      setIsEditingDatos(false);
      queryClient.invalidateQueries(['comprobantes', empresaId]);
      onGuardado?.();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setIsSavingDatos(false);
    }
  };

  const handleGuardar = async () => {
    if (!cuadrado) {
      toast({ variant: 'destructive', title: 'Asiento Descuadrado', description: `Diferencia: ${formatCLP(Math.abs(totalDebe - totalHaber))}` });
      return;
    }
    if (esNotaDoc && !refDoc) {
      toast({
        variant: 'destructive',
        title: 'Falta el documento afectado',
        description: `Indicá a qué documento pertenece esta ${esNotaCredito(dTipoDte) ? 'nota de crédito' : 'nota de débito'}.`,
      });
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetchWithAuth('/accounting/comprobantes', user.sessionId, {
        method: 'POST',
        body: {
          empresaId,
          clase: tipo,
          tipoDte: dTipoDte,
          fecha: dFecha || documento.fecha_emision,
          glosa: construirGlosa({
            clase: tipo, tipoDte: dTipoDte, folio: dFolio, razonSocial: razon, rut,
            refTipoDte: refDoc?.tipo_dte, refFolio: refDoc?.folio,
          }),
          folio: dFolio,
          rutAsociado: rut,
          lineas: lineas.map(l => ({ cuenta: l.cuenta, debe: l.debe, haber: l.haber })),
          refFolio: refDoc?.folio ?? null,
          refTipoDte: refDoc?.tipo_dte ?? null,
          refRazon: refDoc?.razon_social ?? null,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Error al guardar');
      const accion = data.accion === 'actualizado' ? 'Asiento Actualizado' : 'Asiento Guardado';
      toast({
        title: `✅ ${accion}`,
        description: refDoc
          ? `N° ${data.numero} — ${tipoDocLabel} #${dFolio}, afecta a #${refDoc.folio}`
          : `N° ${data.numero} — ${tipoLabel} folio #${dFolio}`,
      });
      queryClient.invalidateQueries(['comprobantes', empresaId]);
      onGuardado?.();
      setIsOpen(false);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[760px] bg-white border-[#efe8dd] text-slate-700 shadow-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${colors.bg}`}>
              <FileText className={`h-5 w-5 ${colors.text}`} />
            </div>
            <div>
              <DialogTitle className={`text-lg font-black tracking-tight uppercase ${colors.text}`}>
                Asiento de {tipoLabel}
              </DialogTitle>
              <DialogDescription className="text-slate-500 text-xs mt-0.5">
                Folio #{documento.folio} · {tipoDocLabel}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* DATOS DEL DOCUMENTO */}
        <div className={`bg-slate-50 rounded-xl border ${colors.border} p-4 mt-2`}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Datos del Documento</p>
            {!isEditingDatos ? (
              <button onClick={() => setIsEditingDatos(true)}
                className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-700 transition-colors px-2 py-1 rounded hover:bg-blue-500/10">
                <Pencil className="h-3 w-3" /> Editar
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <button onClick={cancelarEdicion} disabled={isSavingDatos}
                  className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-900 transition-colors px-2 py-1 rounded hover:bg-slate-100 disabled:opacity-40">
                  <X className="h-3 w-3" /> Cancelar
                </button>
                <button onClick={handleGuardarDatos} disabled={isSavingDatos}
                  className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-600 hover:text-emerald-700 transition-colors px-2 py-1 rounded hover:bg-emerald-500/10 disabled:opacity-40">
                  {isSavingDatos ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Guardar
                </button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Fecha Emisión</p>
              {isEditingDatos ? (
                <input type="date" value={dFecha} onChange={e => setDFecha(e.target.value)}
                  className="w-full mt-1 bg-white border border-[#efe8dd] rounded px-2 py-1 text-xs text-slate-900 focus:outline-none focus:border-emerald-500" />
              ) : (
                <p className="text-sm font-bold text-slate-900 mt-0.5">{fecha}</p>
              )}
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Período</p>
              <p className="text-sm font-bold text-blue-600 font-mono mt-0.5">{periodo}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Tipo Documento</p>
              {isEditingDatos ? (
                <select value={dTipoDte} onChange={e => onChangeTipoDte(Number(e.target.value))}
                  className="w-full mt-1 bg-white border border-[#efe8dd] rounded px-2 py-1 text-xs text-slate-900 focus:outline-none focus:border-emerald-500">
                  {Object.entries(TIPO_DTE_MAP).map(([k, v]) => (
                    <option key={k} value={k} className="bg-white">{v}</option>
                  ))}
                </select>
              ) : (
                <p className="text-xs font-bold text-slate-900 mt-0.5">{tipoDocLabel}</p>
              )}
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Folio</p>
              {isEditingDatos ? (
                <input type="text" value={dFolio} onChange={e => setDFolio(e.target.value)}
                  className="w-full mt-1 bg-white border border-[#efe8dd] rounded px-2 py-1 text-xs text-slate-900 font-mono focus:outline-none focus:border-emerald-500" />
              ) : (
                <p className="text-sm font-black text-slate-900 italic mt-0.5">#{dFolio}</p>
              )}
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                RUT {isCompra ? 'Proveedor' : 'Cliente'}
              </p>
              {isEditingDatos ? (
                <input type="text" value={dRut} onChange={e => setDRut(e.target.value)} placeholder="76.123.456-7"
                  className="w-full mt-1 bg-white border border-[#efe8dd] rounded px-2 py-1 text-xs text-slate-900 font-mono focus:outline-none focus:border-emerald-500" />
              ) : (
                <p className="text-xs font-mono text-slate-600 mt-0.5">{rut}</p>
              )}
            </div>
            <div className="col-span-2 md:col-span-3">
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Razón Social</p>
              {isEditingDatos ? (
                <input type="text" value={dNombre} onChange={e => setDNombre(e.target.value)} placeholder="Razón social"
                  className="w-full mt-1 bg-white border border-[#efe8dd] rounded px-2 py-1 text-xs text-slate-900 focus:outline-none focus:border-emerald-500" />
              ) : (
                <p className="text-xs font-bold text-slate-900 mt-0.5 truncate">{razon || 'SIN RAZÓN SOCIAL'}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-[#efe8dd]">
            <div>
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Neto</p>
              {isEditingDatos ? (
                <input type="number" min="0" value={dNeto} onChange={e => onChangeNeto(e.target.value)}
                  className="w-full mt-1 bg-white border border-[#efe8dd] rounded px-2 py-1 text-sm text-slate-900 font-mono focus:outline-none focus:border-emerald-500" />
              ) : (
                <p className="text-sm font-mono font-bold text-slate-600 mt-0.5">{formatCLP(neto)}</p>
              )}
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">IVA 19%</p>
              <p className="text-sm font-mono font-bold text-slate-600 mt-0.5">{formatCLP(iva)}</p>
              {isEditingDatos && <p className="text-[9px] text-slate-400 mt-0.5">Auto 19%</p>}
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Total</p>
              <p className={`text-lg font-mono font-black mt-0.5 ${colors.text}`}>{formatCLP(total)}</p>
            </div>
          </div>

          {/* DOCUMENTO AFECTADO — obligatorio en notas de crédito/débito */}
          {esNotaDoc && (
            <div className={`mt-4 pt-4 border-t border-[#efe8dd]`}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                  ¿A qué documento pertenece esta {esNotaCredito(dTipoDte) ? 'nota de crédito' : 'nota de débito'}?
                </p>
                {refDoc ? (
                  <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-600">
                    <Link2 className="h-3 w-3" /> Vinculada
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-amber-600">
                    <AlertCircle className="h-3 w-3" /> Requerido
                  </span>
                )}
              </div>
              <select
                value={refDocId}
                onChange={e => setRefDocId(e.target.value)}
                disabled={cargandoAfectables}
                className={`w-full bg-white border rounded px-2 py-2 text-xs text-slate-900 focus:outline-none disabled:opacity-50 ${
                  refDoc ? 'border-emerald-500/40 focus:border-emerald-500' : 'border-amber-500/40 focus:border-amber-500'
                }`}
              >
                <option value="" className="bg-white">
                  {cargandoAfectables ? 'Buscando documentos…' : 'Seleccionar el documento afectado…'}
                </option>
                {afectables.map(d => (
                  <option key={d.id} value={d.id} className="bg-white">
                    {(TIPO_DTE_MAP[d.tipo_dte] || `Tipo ${d.tipo_dte}`)} #{d.folio}
                    {' · '}{formatCLP(Number(d.monto_total))}
                    {d.fecha_emision ? ` · ${String(d.fecha_emision).substring(0, 10)}` : ''}
                  </option>
                ))}
              </select>
              {!cargandoAfectables && afectables.length === 0 && (
                <p className="text-[10px] text-amber-600/80 mt-1.5">
                  No se encontraron documentos de {rut || 'este RUT'} anteriores a esta nota.
                </p>
              )}
              {refDoc && (
                <p className="text-[10px] text-slate-500 mt-1.5">
                  Rebaja {(TIPO_DTE_MAP[refDoc.tipo_dte] || 'documento').toLowerCase()} #{refDoc.folio}
                  {' de '}{formatCLP(Number(refDoc.monto_total))}
                  {Number(refDoc.monto_total) !== total && (
                    <span className="text-amber-600"> — el monto no calza con el de la nota ({formatCLP(total)})</span>
                  )}
                </p>
              )}
            </div>
          )}
        </div>

        {/* ASIENTO CONTABLE EDITABLE */}
        <div className="bg-slate-50 rounded-xl border border-[#efe8dd] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#efe8dd] flex items-center justify-between">
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Asiento Contable — Editable</p>
            <div className="flex items-center gap-3">
              {cuadrado ? (
                <div className="flex items-center gap-1.5 text-emerald-600 text-[10px] font-black uppercase">
                  <CheckCircle className="h-3 w-3" /> Cuadrado
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-red-500 text-[10px] font-black uppercase">
                  <AlertCircle className="h-3 w-3" /> Descuadre: {formatCLP(Math.abs(totalDebe - totalHaber))}
                </div>
              )}
              <button onClick={agregarLinea}
                className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-700 transition-colors">
                <Plus className="h-3 w-3" /> Línea
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="text-[10px] uppercase tracking-widest font-black text-slate-400 bg-white">
                <tr>
                  <th className="px-3 py-2.5 text-left w-[46%]">Cuenta</th>
                  <th className="px-3 py-2.5 text-right w-[22%]">Debe</th>
                  <th className="px-3 py-2.5 text-right w-[22%]">Haber</th>
                  <th className="px-3 py-2.5 w-[10%]"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {lineas.map((linea, idx) => (
                  <tr key={idx} className="hover:bg-white">
                    <td className="px-3 py-2">
                      <Select value={linea.cuenta} onValueChange={(val) => updateCuenta(idx, val)}>
                        <SelectTrigger className="bg-white border-[#efe8dd] text-xs text-slate-900 h-8 w-full">
                          <SelectValue placeholder="Seleccionar..." />
                        </SelectTrigger>
                        <SelectContent className="bg-white border-[#efe8dd] text-slate-700 max-h-[220px] overflow-y-auto">
                          {soloImputables(plan).map(cta => (
                            <SelectItem key={cta.codigo} value={cta.codigo} className="text-xs">
                              {cta.codigo} — {cta.descripcion}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {linea.nombre && <p className="text-[9px] text-slate-400 mt-0.5 px-1">{linea.nombre}</p>}
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" min="0" value={linea.debe || ''}
                        onChange={(e) => updateMonto(idx, 'debe', e.target.value)}
                        className="w-full bg-white border border-[#efe8dd] rounded px-2 py-1.5 text-xs text-emerald-600 font-mono text-right focus:outline-none focus:border-emerald-500"
                        placeholder="0" />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" min="0" value={linea.haber || ''}
                        onChange={(e) => updateMonto(idx, 'haber', e.target.value)}
                        className="w-full bg-white border border-[#efe8dd] rounded px-2 py-1.5 text-xs text-orange-600 font-mono text-right focus:outline-none focus:border-orange-500"
                        placeholder="0" />
                    </td>
                    <td className="px-3 py-2 text-center">
                      {lineas.length > 2 && (
                        <button onClick={() => eliminarLinea(idx)}
                          className="text-red-500 hover:text-red-600 opacity-50 hover:opacity-100 transition-all">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 text-[10px] font-black uppercase tracking-widest">
                <tr>
                  <td className="px-3 py-3 text-slate-500">Totales</td>
                  <td className="px-3 py-3 text-right font-mono text-emerald-600">{formatCLP(totalDebe)}</td>
                  <td className="px-3 py-3 text-right font-mono text-orange-600">{formatCLP(totalHaber)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-1">
          <Button variant="ghost" onClick={() => setIsOpen(false)}
            className="text-slate-500 hover:text-slate-900 font-bold uppercase text-xs tracking-widest">
            Cerrar
          </Button>
          <Button onClick={handleGuardar} disabled={!cuadrado || lineas.length < 2 || isSaving || (esNotaDoc && !refDoc)}
            className="bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-slate-900 font-black uppercase text-xs tracking-widest disabled:opacity-40">
            {isSaving ? <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />Contabilizando...</> : 'Contabilizar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AsientoDocumentoModal;
