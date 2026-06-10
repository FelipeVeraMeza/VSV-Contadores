import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, CheckCircle, AlertCircle, Plus, Trash2, Loader2, Pencil, Save, X } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getChartOfAccountsApi } from '@/services/accountingService';
import { fetchWithAuth } from '@/services/apiClient';
import { API_BASE_URL } from '../../../../config.js';

const TIPO_DTE_MAP = {
  33: 'Factura Electrónica', 34: 'Factura Exenta', 61: 'Nota de Crédito',
  56: 'Nota de Débito', 52: 'Guía de Despacho', 39: 'Boleta Electrónica', 110: 'Factura Exportación'
};

const formatCLP = (val) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(val || 0);
const formatText = (str) => str ? str.toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase() : '';
const formatRut = (rut) => {
  if (!rut) return '';
  const clean = String(rut).replace(/[.\-]/g, '');
  if (clean.length < 2) return rut;
  return `${clean.slice(0, -1)}-${clean.slice(-1).toUpperCase()}`;
};

const CUENTAS_DEFAULT = {
  ventas: [
    { cuenta: '1104-01', nombre: 'DEUDORES CLIENTES' },
    { cuenta: '5101-01', nombre: 'VENTAS' },
    { cuenta: '2108-02', nombre: 'IVA DEBITO FISCAL' },
  ],
  compras: [
    { cuenta: '4201-08', nombre: 'GASTOS GENERALES' },
    { cuenta: '1108-02', nombre: 'IVA CREDITO FISCAL' },
    { cuenta: '2116-01', nombre: 'FACTURAS POR PAGAR' },
  ],
  honorarios: [
    { cuenta: '4201-02', nombre: 'HONORARIOS PROFESIONALES' },
    { cuenta: '2105-04', nombre: 'HONORARIOS POR PAGAR' },
  ],
};

const generarLineas = (netoVal, tipo) => {
  const neto = Number(netoVal) || 0;
  const iva = Math.round(neto * 0.19);
  const total = neto + iva; // Siempre calculado para garantizar cuadre
  const base = CUENTAS_DEFAULT[tipo] || CUENTAS_DEFAULT.ventas;

  if (tipo === 'ventas') return [
    { ...base[0], debe: total, haber: 0 },
    { ...base[1], debe: 0, haber: neto },
    { ...base[2], debe: 0, haber: iva },
  ];
  if (tipo === 'compras') return [
    { ...base[0], debe: neto, haber: 0 },
    { ...base[1], debe: iva, haber: 0 },
    { ...base[2], debe: 0, haber: total },
  ];
  return [
    { ...base[0], debe: total, haber: 0 },
    { ...base[1], debe: 0, haber: total },
  ];
};

const COLOR_MAP = {
  ventas:    { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  compras:   { bg: 'bg-red-500/10',     text: 'text-red-400',     border: 'border-red-500/30' },
  honorarios:{ bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/30' },
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

  useEffect(() => {
    if (documento && isOpen) {
      setLineas(generarLineas(documento.monto_neto, tipo));
      setDRut(isCompra ? (documento.rut_proveedor || '') : (documento.rut_cliente || ''));
      setDNombre(isCompra ? (documento.razon_social_proveedor || '') : (documento.razon_social || ''));
      setDTipoDte(documento.tipo_dte || 33);
      setDFolio(String(documento.folio ?? ''));
      setDFecha(documento.fecha_emision ? String(documento.fecha_emision).substring(0, 10) : '');
      setDNeto(String(documento.monto_neto ?? ''));
      setIsEditingDatos(false);
    }
  }, [documento, isOpen, tipo, isCompra]);

  if (!documento) return null;

  const neto = Number(dNeto) || 0;
  const iva = Math.round(neto * 0.19);
  const total = neto + iva;

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
    setLineas(generarLineas(val, tipo));
  };

  const cancelarEdicion = () => {
    setDRut(isCompra ? (documento.rut_proveedor || '') : (documento.rut_cliente || ''));
    setDNombre(isCompra ? (documento.razon_social_proveedor || '') : (documento.razon_social || ''));
    setDTipoDte(documento.tipo_dte || 33);
    setDFolio(String(documento.folio ?? ''));
    setDFecha(documento.fecha_emision ? String(documento.fecha_emision).substring(0, 10) : '');
    setDNeto(String(documento.monto_neto ?? ''));
    setLineas(generarLineas(documento.monto_neto, tipo));
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
    setIsSaving(true);
    try {
      const res = await fetchWithAuth('/accounting/comprobantes', user.sessionId, {
        method: 'POST',
        body: {
          empresaId,
          tipo,
          fecha: dFecha || documento.fecha_emision,
          glosa: `${tipoLabel} Folio #${dFolio} — ${razon || rut}`,
          folio: dFolio,
          rutAsociado: rut,
          lineas: lineas.map(l => ({ cuenta: l.cuenta, debe: l.debe, haber: l.haber })),
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Error al guardar');
      const accion = data.accion === 'actualizado' ? 'Asiento Actualizado' : 'Asiento Guardado';
      toast({ title: `✅ ${accion}`, description: `N° ${data.numero} — ${tipoLabel} folio #${documento.folio}` });
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
      <DialogContent className="sm:max-w-[760px] bg-[#0f172a] border-white/10 text-white shadow-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${colors.bg}`}>
              <FileText className={`h-5 w-5 ${colors.text}`} />
            </div>
            <div>
              <DialogTitle className={`text-lg font-black tracking-tight uppercase ${colors.text}`}>
                Asiento de {tipoLabel}
              </DialogTitle>
              <DialogDescription className="text-gray-400 text-xs mt-0.5">
                Folio #{documento.folio} · {tipoDocLabel}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* DATOS DEL DOCUMENTO */}
        <div className={`bg-black/20 rounded-xl border ${colors.border} p-4 mt-2`}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Datos del Documento</p>
            {!isEditingDatos ? (
              <button onClick={() => setIsEditingDatos(true)}
                className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-blue-400 hover:text-blue-300 transition-colors px-2 py-1 rounded hover:bg-blue-500/10">
                <Pencil className="h-3 w-3" /> Editar
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <button onClick={cancelarEdicion} disabled={isSavingDatos}
                  className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-white/5 disabled:opacity-40">
                  <X className="h-3 w-3" /> Cancelar
                </button>
                <button onClick={handleGuardarDatos} disabled={isSavingDatos}
                  className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-400 hover:text-emerald-300 transition-colors px-2 py-1 rounded hover:bg-emerald-500/10 disabled:opacity-40">
                  {isSavingDatos ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Guardar
                </button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Fecha Emisión</p>
              {isEditingDatos ? (
                <input type="date" value={dFecha} onChange={e => setDFecha(e.target.value)}
                  className="w-full mt-1 bg-slate-900 border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500" />
              ) : (
                <p className="text-sm font-bold text-white mt-0.5">{fecha}</p>
              )}
            </div>
            <div>
              <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Período</p>
              <p className="text-sm font-bold text-blue-400 font-mono mt-0.5">{periodo}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Tipo Documento</p>
              {isEditingDatos ? (
                <select value={dTipoDte} onChange={e => setDTipoDte(Number(e.target.value))}
                  className="w-full mt-1 bg-slate-900 border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500">
                  {Object.entries(TIPO_DTE_MAP).map(([k, v]) => (
                    <option key={k} value={k} className="bg-slate-900">{v}</option>
                  ))}
                </select>
              ) : (
                <p className="text-xs font-bold text-white mt-0.5">{tipoDocLabel}</p>
              )}
            </div>
            <div>
              <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Folio</p>
              {isEditingDatos ? (
                <input type="text" value={dFolio} onChange={e => setDFolio(e.target.value)}
                  className="w-full mt-1 bg-slate-900 border border-white/10 rounded px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-blue-500" />
              ) : (
                <p className="text-sm font-black text-white italic mt-0.5">#{dFolio}</p>
              )}
            </div>
            <div>
              <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">
                RUT {isCompra ? 'Proveedor' : 'Cliente'}
              </p>
              {isEditingDatos ? (
                <input type="text" value={dRut} onChange={e => setDRut(e.target.value)} placeholder="76.123.456-7"
                  className="w-full mt-1 bg-slate-900 border border-white/10 rounded px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-blue-500" />
              ) : (
                <p className="text-xs font-mono text-gray-300 mt-0.5">{rut}</p>
              )}
            </div>
            <div className="col-span-2 md:col-span-3">
              <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Razón Social</p>
              {isEditingDatos ? (
                <input type="text" value={dNombre} onChange={e => setDNombre(e.target.value)} placeholder="Razón social"
                  className="w-full mt-1 bg-slate-900 border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500" />
              ) : (
                <p className="text-xs font-bold text-white mt-0.5 truncate">{razon || 'SIN RAZÓN SOCIAL'}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-white/5">
            <div>
              <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Neto</p>
              {isEditingDatos ? (
                <input type="number" min="0" value={dNeto} onChange={e => onChangeNeto(e.target.value)}
                  className="w-full mt-1 bg-slate-900 border border-white/10 rounded px-2 py-1 text-sm text-white font-mono focus:outline-none focus:border-blue-500" />
              ) : (
                <p className="text-sm font-mono font-bold text-gray-300 mt-0.5">{formatCLP(neto)}</p>
              )}
            </div>
            <div>
              <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">IVA 19%</p>
              <p className="text-sm font-mono font-bold text-gray-300 mt-0.5">{formatCLP(iva)}</p>
              {isEditingDatos && <p className="text-[9px] text-gray-600 mt-0.5">Auto 19%</p>}
            </div>
            <div>
              <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Total</p>
              <p className={`text-lg font-mono font-black mt-0.5 ${colors.text}`}>{formatCLP(total)}</p>
            </div>
          </div>
        </div>

        {/* ASIENTO CONTABLE EDITABLE */}
        <div className="bg-black/20 rounded-xl border border-white/5 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
            <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Asiento Contable — Editable</p>
            <div className="flex items-center gap-3">
              {cuadrado ? (
                <div className="flex items-center gap-1.5 text-emerald-400 text-[10px] font-black uppercase">
                  <CheckCircle className="h-3 w-3" /> Cuadrado
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-red-400 text-[10px] font-black uppercase">
                  <AlertCircle className="h-3 w-3" /> Descuadre: {formatCLP(Math.abs(totalDebe - totalHaber))}
                </div>
              )}
              <button onClick={agregarLinea}
                className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-blue-400 hover:text-blue-300 transition-colors">
                <Plus className="h-3 w-3" /> Línea
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="text-[10px] uppercase tracking-widest font-black text-gray-500 bg-white/[0.02]">
                <tr>
                  <th className="px-3 py-2.5 text-left w-[46%]">Cuenta</th>
                  <th className="px-3 py-2.5 text-right w-[22%]">Debe</th>
                  <th className="px-3 py-2.5 text-right w-[22%]">Haber</th>
                  <th className="px-3 py-2.5 w-[10%]"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {lineas.map((linea, idx) => (
                  <tr key={idx} className="hover:bg-white/[0.02]">
                    <td className="px-3 py-2">
                      <Select value={linea.cuenta} onValueChange={(val) => updateCuenta(idx, val)}>
                        <SelectTrigger className="bg-slate-900 border-white/10 text-xs text-white h-8 w-full">
                          <SelectValue placeholder="Seleccionar..." />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-white/10 text-white max-h-[220px] overflow-y-auto z-50">
                          {plan.map(cta => (
                            <SelectItem key={cta.codigo} value={cta.codigo} className="text-xs">
                              {cta.codigo} — {cta.descripcion}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {linea.nombre && <p className="text-[9px] text-gray-500 mt-0.5 px-1">{linea.nombre}</p>}
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" min="0" value={linea.debe || ''}
                        onChange={(e) => updateMonto(idx, 'debe', e.target.value)}
                        className="w-full bg-slate-900 border border-white/10 rounded px-2 py-1.5 text-xs text-emerald-400 font-mono text-right focus:outline-none focus:border-emerald-500"
                        placeholder="0" />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" min="0" value={linea.haber || ''}
                        onChange={(e) => updateMonto(idx, 'haber', e.target.value)}
                        className="w-full bg-slate-900 border border-white/10 rounded px-2 py-1.5 text-xs text-orange-400 font-mono text-right focus:outline-none focus:border-orange-500"
                        placeholder="0" />
                    </td>
                    <td className="px-3 py-2 text-center">
                      {lineas.length > 2 && (
                        <button onClick={() => eliminarLinea(idx)}
                          className="text-red-400 hover:text-red-300 opacity-50 hover:opacity-100 transition-all">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-white/5 text-[10px] font-black uppercase tracking-widest">
                <tr>
                  <td className="px-3 py-3 text-gray-400">Totales</td>
                  <td className="px-3 py-3 text-right font-mono text-emerald-400">{formatCLP(totalDebe)}</td>
                  <td className="px-3 py-3 text-right font-mono text-orange-400">{formatCLP(totalHaber)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-1">
          <Button variant="ghost" onClick={() => setIsOpen(false)}
            className="text-gray-400 hover:text-white font-bold uppercase text-xs tracking-widest">
            Cerrar
          </Button>
          <Button onClick={handleGuardar} disabled={!cuadrado || lineas.length < 2 || isSaving}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black uppercase text-xs tracking-widest disabled:opacity-40">
            {isSaving ? <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />Guardando...</> : 'Guardar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AsientoDocumentoModal;
