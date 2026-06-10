import { useNavigate } from 'react-router-dom';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Building2, User, Edit, DollarSign, Briefcase, FileSpreadsheet, Key, Send, Save, Clock, AlertTriangle, CheckCircle2, Landmark, Receipt, Layers, Plus, Trash2, MessageSquare, Ticket, History, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { EditableField, SecureField } from '../ui/CrmUI';
import { createNotaApi, cambiarPlanApi, addServicioApi, removeServicioApi, toggleTicketApi } from '@/services/crmService';

import { useAuth } from '@/hooks/useAuth';

const getSessionId = () => {
    try { return JSON.parse(localStorage.getItem('user') || '{}').sessionId; }
    catch { return null; }
};

const ClientDetailDrawer = ({ client, onClose, onUpdateClient, planes = [], serviciosDisponibles = [], onRefresh }) => {
    const navigate = useNavigate();
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState(client);
    const [newNote, setNewNote] = useState('');
    const [isSavingNote, setIsSavingNote] = useState(false);

    // Bitácora: pestaña activa (conversaciones / tickets)
    const [bitacoraTab, setBitacoraTab] = useState('conversacion');

    // Administración de plan
    const [selectedPlanId, setSelectedPlanId] = useState('');
    const [planMotivo, setPlanMotivo] = useState('');
    const [isSavingPlan, setIsSavingPlan] = useState(false);
    const [showPlanHistory, setShowPlanHistory] = useState(false);

    // Servicios contratados
    const [newServicioId, setNewServicioId] = useState('');
    const [newServicioPrecio, setNewServicioPrecio] = useState('');
    const [isSavingServicio, setIsSavingServicio] = useState(false);

    // =========================================
    // LÓGICA PARA SELECCIONAR LA EMPRESA ACTIVA
    // =========================================
    const { selectedCompany, setSelectedCompany } = useAuth();
    const isSelected = selectedCompany?.id === client?.id;

    const handleSelectCompany = () => {
        if (setSelectedCompany) {
            setSelectedCompany(client);
            const nombreEmpresa = client.razon_social || client.razonSocial || 'la empresa';
            toast({ title: "Empresa Activa", description: `Has seleccionado a ${nombreEmpresa} para operar en el sistema.` });
        }
    };
    // =========================================

    useEffect(() => {
        setFormData(client);
        setIsEditing(false);
        setNewNote('');
        setBitacoraTab('conversacion');
        setSelectedPlanId(client?.planId || '');
        setPlanMotivo('');
        setNewServicioId('');
        setNewServicioPrecio('');
    }, [client]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = async () => {
        if (onUpdateClient) await onUpdateClient(formData);
        setIsEditing(false);
    };

    const addNote = async () => {
        if(!newNote.trim()) return;
        setIsSavingNote(true);
        try {
            const sessionId = getSessionId();
            const response = await createNotaApi(sessionId, formData.id, newNote, bitacoraTab);
            const payload = await response.json();

            if(payload.success) {
                setFormData(prev => ({
                    ...prev,
                    notas: [payload.nota, ...(prev.notas || [])]
                }));
                setNewNote('');
                toast({ title: bitacoraTab === 'ticket' ? "Ticket creado" : "Conversación registrada", description: "Se guardó correctamente en la bitácora." });
            } else {
                throw new Error(payload.message);
            }
        } catch (error) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        } finally {
            setIsSavingNote(false);
        }
    };

    // Marca un ticket como resuelto / reabierto
    const handleToggleTicket = async (nota) => {
        const nuevoEstado = !nota.resuelto;
        try {
            const response = await toggleTicketApi(getSessionId(), nota.id, nuevoEstado);
            const payload = await response.json();
            if (!payload.success) throw new Error(payload.message);
            setFormData(prev => ({
                ...prev,
                notas: (prev.notas || []).map(n => n.id === nota.id ? { ...n, resuelto: nuevoEstado } : n)
            }));
        } catch (error) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        }
    };

    // Cambia el plan del cliente (registra fecha + historial)
    const handleCambiarPlan = async () => {
        if (!selectedPlanId || selectedPlanId === formData.planId) {
            toast({ title: "Sin cambios", description: "Selecciona un plan distinto al actual.", variant: "destructive" });
            return;
        }
        setIsSavingPlan(true);
        try {
            const response = await cambiarPlanApi(getSessionId(), formData.id, selectedPlanId, planMotivo);
            const payload = await response.json();
            if (!payload.success) throw new Error(payload.message);

            const nuevoNombre = payload.plan;
            const hoy = new Date().toLocaleDateString('es-CL');
            setFormData(prev => ({
                ...prev,
                plan: nuevoNombre,
                plan_nombre: nuevoNombre,
                planId: selectedPlanId,
                fechaCambioPlan: hoy,
                planHistorial: [
                    { planAnterior: prev.plan || prev.plan_nombre || '—', planNuevo: nuevoNombre, autor: 'Tú', motivo: planMotivo, fecha: new Date().toLocaleString('es-CL') },
                    ...(prev.planHistorial || [])
                ]
            }));
            setPlanMotivo('');
            toast({ title: "Plan actualizado", description: `Nuevo plan: ${nuevoNombre}` });
            if (onRefresh) onRefresh();
        } catch (error) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        } finally {
            setIsSavingPlan(false);
        }
    };

    const handleAddServicio = async () => {
        if (!newServicioId) {
            toast({ title: "Selecciona un servicio", variant: "destructive" });
            return;
        }
        setIsSavingServicio(true);
        try {
            const response = await addServicioApi(getSessionId(), formData.id, newServicioId, newServicioPrecio);
            const payload = await response.json();
            if (!payload.success) throw new Error(payload.message);
            setFormData(prev => ({ ...prev, servicios: [...(prev.servicios || []), payload.servicio] }));
            setNewServicioId('');
            setNewServicioPrecio('');
            toast({ title: "Servicio agregado", description: payload.servicio?.nombre });
            if (onRefresh) onRefresh();
        } catch (error) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        } finally {
            setIsSavingServicio(false);
        }
    };

    const handleRemoveServicio = async (servicio) => {
        try {
            const response = await removeServicioApi(getSessionId(), servicio.id);
            const payload = await response.json();
            if (!payload.success) throw new Error(payload.message);
            setFormData(prev => ({
                ...prev,
                servicios: (prev.servicios || []).map(s => s.id === servicio.id ? { ...s, estado: 'Suspendido' } : s)
            }));
            toast({ title: "Servicio dado de baja", description: servicio.nombre });
            if (onRefresh) onRefresh();
        } catch (error) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        }
    };

    const fmt = (val) => {
        const num = Number(val);
        return isNaN(num) ? '$0' : `$${num.toLocaleString('es-CL')}`;
    };

    const type = formData.tipo_cliente || formData.type || 'Empresa';
    const razonSocial = formData.razon_social || formData.razonSocial || 'Sin Razón Social';
    const rut = formData.rut_encrypted || formData.rut || 'Sin RUT';
    const plan = formData.plan_nombre || formData.plan || 'FREE';
    
    const repNombre = formData.nombre_rep || formData.repNombre || 'Sin Registro';
    const repRut = formData.rut_rep_encrypted || formData.repRut || 'Sin Registro';
    const correo = formData.email_corporativo || formData.correo || 'Sin Registro';
    const telRaw = formData.telefono_corporativo || formData.telefono || '';
    const wsRaw = formData.whatsapp || '';
    const whatsapp = wsRaw.length > 5 ? wsRaw : (telRaw.length > 5 ? telRaw : 'Sin Registro');

    const claveWeb = formData.web_password_encrypted || formData.claveWeb || 'SIN CLAVE';
    const claveSII = formData.sii_password_encrypted || formData.claveSII || 'SIN CLAVE';

    const ventas = formData.ventas_mensuales ?? formData.ventas ?? 0;
    const compras = formData.compras_mensuales ?? formData.compras ?? 0;
    const bruto = formData.monto_bruto ?? formData.bruto ?? 0;
    const neto = formData.impuesto_pagar ?? formData.neto ?? 0;
    const facturacionTotal = formData.facturacion_total ?? formData.facturacionTotal ?? 0;
    const impuestoUnico = formData.impuesto_unico ?? formData.impuestoUnico ?? 0;
    const numeroFactura = formData.nro_factura || formData.numeroFactura || 'Vacío';
    
    const contratoRentaDB = formData.contrato_renta ?? formData.contratoRenta ?? false;
    const contratoRenta = (contratoRentaDB === true || contratoRentaDB === 'SI' || contratoRentaDB === 'Sí') ? 'SÍ' : 'NO';
    const formularioRenta = formData.estado_formulario_renta || formData.formularioRenta || 'Vacío';
    const montoRenta = formData.monto_renta ?? formData.montoRenta ?? formData.renta ?? 0;
    const rentaMarzoNeto = formData.renta_marzo_neto ?? formData.rentaMarzoNeto ?? 0;
    const rentaMarzoBruto = formData.renta_marzo_bruto ?? formData.rentaMarzoBruto ?? 0;

    const dtAtrasados = formData.dts_mensuales ?? formData.dtAtrasados ?? 0;
    const dtPendientesFirma = formData.pendientes_firma ?? formData.dtPendientesFirma ?? 0;
    const importante = formData.nota_urgente || formData.importante || '';

    // --- Plan y servicios ---
    const planHistorial = formData.planHistorial || [];
    const fechaCambioPlan = formData.fechaCambioPlan || null;
    const serviciosActivos = (formData.servicios || []).filter(s => s.estado !== 'Suspendido');
    const idsContratados = new Set(serviciosActivos.map(s => s.nombre));
    const serviciosParaAgregar = (serviciosDisponibles || []).filter(s => !idsContratados.has(s.nombre));

    // --- Bitácora por tipo ---
    const todasLasNotas = formData.notas || [];
    const conversaciones = todasLasNotas.filter(n => (n.tipo || 'conversacion') !== 'ticket');
    const tickets = todasLasNotas.filter(n => n.tipo === 'ticket');
    const ticketsAbiertos = tickets.filter(t => !t.resuelto).length;
    const notasVisibles = bitacoraTab === 'ticket' ? tickets : conversaciones;

    return (
        <motion.div 
            initial={{ opacity: 0, x: 50 }} 
            animate={{ opacity: 1, x: 0 }} 
            exit={{ opacity: 0, x: 50 }} 
            className="w-full lg:w-2/5 bg-[#0f172a]/95 backdrop-blur-3xl border border-white/10 rounded-2xl flex flex-col overflow-hidden shadow-2xl h-full"
        >
            {/* CABECERA (Con Atajos Dinámicos) */}
            <div className="p-5 border-b border-white/10 flex flex-col gap-4 bg-gradient-to-r from-blue-900/30 to-transparent shrink-0">
                
                {/* 1. Nombre y Plan */}
                <div className="flex gap-4 items-center">
                    <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                        {type === 'Empresa' ? <Building2 size={24} /> : <User size={24} />}
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-sm md:text-base font-black text-white uppercase tracking-tight leading-tight truncate">
                            {razonSocial}
                        </h2>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                            <span className="text-xs text-gray-400 font-mono bg-black/30 px-2 py-0.5 rounded border border-white/5 truncate">
                                {rut}
                            </span>
                            <span className="text-[10px] font-black px-2 py-0.5 rounded border border-blue-500/30 text-blue-400 bg-blue-500/10 uppercase shrink-0">
                                Plan: {plan}
                            </span>
                        </div>
                    </div>
                </div>
                
                {/* 2. Botones de Acción (Atajos y Controles) */}
                <div className="flex flex-wrap gap-2 items-center justify-end">
                    
                    <AnimatePresence>
                        {isSelected && (
                            <>
                                {/* NUEVO BOTÓN: Ir a Facturación */}
                                <motion.button 
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    onClick={() => navigate('/facturacion')}
                                    className="hidden md:flex items-center gap-1.5 px-3 py-1.5 md:py-2 rounded-xl font-black uppercase tracking-widest text-[9px] md:text-[10px] bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:bg-orange-600 hover:text-white transition-all shadow-lg"
                                >
                                    <Receipt size={14} /> Facturador
                                </motion.button>

                                {/* Botón: Ir a Bancos */}
                                <motion.button 
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    onClick={() => navigate('/bancos')}
                                    className="hidden md:flex items-center gap-1.5 px-3 py-1.5 md:py-2 rounded-xl font-black uppercase tracking-widest text-[9px] md:text-[10px] bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-600 hover:text-white transition-all shadow-lg"
                                >
                                    <Landmark size={14} /> Bancos
                                </motion.button>
                            </>
                        )}
                    </AnimatePresence>

                    {/* Botón: Seleccionar / Empresa Activa */}
                    <button 
                        onClick={handleSelectCompany}
                        className={`flex items-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2 rounded-xl font-black uppercase tracking-widest text-[9px] md:text-[10px] transition-all ${isSelected ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20'}`}
                    >
                        {isSelected ? (
                            <><CheckCircle2 size={14} /> Seleccionada</>
                        ) : (
                            'Activar Empresa'
                        )}
                    </button>

                    {/* Controles de Ventana (Editar y Cerrar) */}
                    <div className="flex gap-1 ml-auto">
                        <button onClick={() => setIsEditing(!isEditing)} className={`p-1.5 md:p-2 rounded-xl border transition-colors ${isEditing ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'bg-white/5 border-transparent text-gray-400 hover:text-white'}`}>
                            <Edit size={16} />
                        </button>
                        <button onClick={onClose} className="p-1.5 md:p-2 rounded-xl bg-white/5 text-gray-400 hover:text-red-400 transition-colors">
                            <X size={16} />
                        </button>
                    </div>
                </div>
            </div>

            {/* CONTENIDO PRINCIPAL SCROLLABLE */}
            <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-4 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                
                {/* ALERTA IMPORTANTE */}
                {importante && importante !== 'SIN_DATO' && !isEditing && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex gap-3 items-center">
                        <AlertTriangle className="text-red-500 shrink-0" size={18} />
                        <p className="text-xs text-red-200 font-bold leading-relaxed">{importante}</p>
                    </div>
                )}

                {/* 1. INFO GENERAL */}
                <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4">
                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <User size={14} /> Contacto y Representante
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                        <EditableField label="Representante Legal" name="repNombre" value={isEditing ? formData.repNombre : repNombre} isEditing={isEditing} onChange={handleInputChange} />
                        <EditableField label="RUT Representante" name="repRut" value={isEditing ? formData.repRut : repRut} isEditing={isEditing} onChange={handleInputChange} />
                        <EditableField label="Correo Electrónico" name="correo" value={isEditing ? formData.correo : correo} isEditing={isEditing} onChange={handleInputChange} />
                        <EditableField label="WhatsApp / Teléfono" name="whatsapp" value={isEditing ? formData.whatsapp : whatsapp} isEditing={isEditing} onChange={handleInputChange} />
                    </div>
                </div>

                {/* 2. CREDENCIALES */}
                <div className="bg-blue-500/5 border border-blue-500/10 rounded-2xl p-4">
                    <h3 className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <Key size={14} /> Accesos y Credenciales
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                        <SecureField label="Clave Portal Web" name="claveWeb" value={isEditing ? formData.claveWeb : claveWeb} isEditing={isEditing} onChange={handleInputChange} />
                        <SecureField label="Clave SII" name="claveSII" value={isEditing ? formData.claveSII : claveSII} isEditing={isEditing} onChange={handleInputChange} />
                    </div>
                </div>

                {/* PLAN Y SERVICIOS CONTRATADOS */}
                <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                            <Layers size={14} /> Plan y Servicios
                        </h3>
                        {planHistorial.length > 0 && (
                            <button
                                onClick={() => setShowPlanHistory(!showPlanHistory)}
                                className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-gray-400 hover:text-white transition-colors"
                            >
                                <History size={12} /> Historial ({planHistorial.length})
                            </button>
                        )}
                    </div>

                    {/* Plan actual + selector */}
                    <div className="flex flex-wrap items-end gap-2 mb-2">
                        <div className="flex flex-col gap-1 flex-1 min-w-[120px]">
                            <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Plan Actual</span>
                            <select
                                value={selectedPlanId}
                                onChange={(e) => setSelectedPlanId(e.target.value)}
                                className="bg-black/40 border border-white/10 rounded-lg p-2 text-xs text-white outline-none focus:border-indigo-500 cursor-pointer"
                            >
                                <option value="">— Selecciona un plan —</option>
                                {planes.map(p => (
                                    <option key={p.id} value={p.id}>{p.nombre}{p.precioBase ? ` ($${p.precioBase.toLocaleString('es-CL')})` : ''}</option>
                                ))}
                            </select>
                        </div>
                        <input
                            type="text"
                            value={planMotivo}
                            onChange={(e) => setPlanMotivo(e.target.value)}
                            placeholder="Motivo (opcional)"
                            className="flex-1 min-w-[120px] bg-black/40 border border-white/10 rounded-lg p-2 text-xs text-white outline-none focus:border-indigo-500 placeholder:text-gray-600"
                        />
                        <Button
                            onClick={handleCambiarPlan}
                            disabled={isSavingPlan || !selectedPlanId || selectedPlanId === formData.planId}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-3 h-9 text-[10px] font-black uppercase tracking-widest"
                        >
                            Cambiar
                        </Button>
                    </div>
                    {fechaCambioPlan && (
                        <p className="text-[9px] text-gray-500 mb-3">Último cambio de plan: <span className="text-gray-300 font-bold">{fechaCambioPlan}</span></p>
                    )}

                    {/* Historial de cambios de plan */}
                    <AnimatePresence>
                        {showPlanHistory && planHistorial.length > 0 && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mb-3">
                                <div className="space-y-2 bg-black/20 rounded-xl p-3 border border-white/5 max-h-40 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
                                    {planHistorial.map((h, i) => (
                                        <div key={i} className="text-[10px] border-b border-white/5 pb-1.5 last:border-0 last:pb-0">
                                            <div className="flex items-center gap-1.5 text-gray-200 font-bold">
                                                <span className="text-gray-500">{h.planAnterior}</span> → <span className="text-indigo-300">{h.planNuevo}</span>
                                            </div>
                                            <div className="text-gray-500 flex flex-wrap gap-x-2">
                                                <span>{h.fecha}</span>
                                                <span>· {h.autor}</span>
                                                {h.motivo && <span className="italic">· {h.motivo}</span>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Servicios contratados */}
                    <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Servicios Contratados</span>
                    <div className="flex flex-wrap gap-2 mt-2 mb-3">
                        {serviciosActivos.length > 0 ? serviciosActivos.map(s => (
                            <span key={s.id} className="group flex items-center gap-1.5 bg-white/5 border border-white/10 text-gray-200 px-2 py-1 rounded-lg text-[10px] font-bold">
                                {s.nombre}
                                {s.precioPactado ? <span className="text-emerald-400">${Number(s.precioPactado).toLocaleString('es-CL')}</span> : null}
                                <button onClick={() => handleRemoveServicio(s)} title="Dar de baja" className="text-gray-500 hover:text-red-400 transition-colors">
                                    <Trash2 size={11} />
                                </button>
                            </span>
                        )) : (
                            <span className="text-[10px] text-gray-500 italic">Sin servicios contratados.</span>
                        )}
                    </div>

                    {/* Agregar servicio */}
                    <div className="flex flex-wrap items-center gap-2">
                        <select
                            value={newServicioId}
                            onChange={(e) => setNewServicioId(e.target.value)}
                            className="flex-1 min-w-[120px] bg-black/40 border border-white/10 rounded-lg p-2 text-xs text-white outline-none focus:border-indigo-500 cursor-pointer"
                        >
                            <option value="">+ Sumar servicio…</option>
                            {serviciosParaAgregar.map(s => (
                                <option key={s.id} value={s.id}>{s.nombre}</option>
                            ))}
                        </select>
                        <input
                            type="text"
                            value={newServicioPrecio}
                            onChange={(e) => setNewServicioPrecio(e.target.value)}
                            placeholder="Precio"
                            className="w-24 bg-black/40 border border-white/10 rounded-lg p-2 text-xs text-white outline-none focus:border-indigo-500 placeholder:text-gray-600"
                        />
                        <Button
                            onClick={handleAddServicio}
                            disabled={isSavingServicio || !newServicioId}
                            className="bg-white/10 hover:bg-white/20 text-white rounded-lg px-3 h-9"
                        >
                            <Plus size={16} />
                        </Button>
                    </div>
                </div>

                {/* 3. OPERACIÓN MENSUAL (FINANZAS) */}
                <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-4">
                    <h3 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <DollarSign size={14} /> Operación Mensual (F29)
                    </h3>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
                        <EditableField label="Neto a Pagar" name="neto" value={isEditing ? formData.neto : fmt(neto)} isEditing={isEditing} onChange={handleInputChange} />
                        <EditableField label="Monto Bruto" name="bruto" value={isEditing ? formData.bruto : fmt(bruto)} isEditing={isEditing} onChange={handleInputChange} />
                        <EditableField label="N° de Factura" name="numeroFactura" value={isEditing ? formData.numeroFactura : numeroFactura} isEditing={isEditing} onChange={handleInputChange} />
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <EditableField label="Ventas" name="ventas" value={isEditing ? formData.ventas : fmt(ventas)} isEditing={isEditing} onChange={handleInputChange} />
                        <EditableField label="Compras" name="compras" value={isEditing ? formData.compras : fmt(compras)} isEditing={isEditing} onChange={handleInputChange} />
                        <EditableField label="Fact. Total" name="facturacionTotal" value={isEditing ? formData.facturacionTotal : fmt(facturacionTotal)} isEditing={isEditing} onChange={handleInputChange} />
                        <EditableField label="Impuesto Único" name="impuestoUnico" value={isEditing ? formData.impuestoUnico : fmt(impuestoUnico)} isEditing={isEditing} onChange={handleInputChange} />
                    </div>
                </div>

                {/* 4. RENTA ANUAL */}
                <div className="bg-purple-500/5 border border-purple-500/10 rounded-2xl p-4">
                    <h3 className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <FileSpreadsheet size={14} /> Renta Anual (AT 2024/2025)
                    </h3>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                        <EditableField label="¿Contrató Renta?" name="contratoRenta" value={isEditing ? formData.contratoRenta : contratoRenta} isEditing={isEditing} onChange={handleInputChange} />
                        <EditableField label="Monto Renta" name="montoRenta" value={isEditing ? formData.montoRenta : fmt(montoRenta)} isEditing={isEditing} onChange={handleInputChange} />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <EditableField label="Estado Formulario" name="formularioRenta" value={isEditing ? formData.formularioRenta : formularioRenta} isEditing={isEditing} onChange={handleInputChange} />
                        <EditableField label="Renta Marzo Neto" name="rentaMarzoNeto" value={isEditing ? formData.rentaMarzoNeto : fmt(rentaMarzoNeto)} isEditing={isEditing} onChange={handleInputChange} />
                        <EditableField label="Renta Marzo Bruto" name="rentaMarzoBruto" value={isEditing ? formData.rentaMarzoBruto : fmt(rentaMarzoBruto)} isEditing={isEditing} onChange={handleInputChange} />
                    </div>
                </div>

                {/* 5. DIRECCIÓN DEL TRABAJO (DT) */}
                <div className="bg-sky-500/5 border border-sky-500/10 rounded-2xl p-4">
                    <h3 className="text-[10px] font-black text-sky-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <Briefcase size={14} /> Dirección del Trabajo (DT)
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-xl flex flex-col justify-center items-center">
                            <span className="text-[9px] text-red-400 font-bold uppercase tracking-widest mb-1">Trámites Atrasados</span>
                            <span className="text-2xl font-black text-white">{dtAtrasados}</span>
                        </div>
                        <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl flex flex-col justify-center items-center">
                            <span className="text-[9px] text-amber-400 font-bold uppercase tracking-widest mb-1">Pendientes de Firma</span>
                            <span className="text-2xl font-black text-white">{dtPendientesFirma}</span>
                        </div>
                    </div>
                </div>

                {/* 6. BITÁCORA: CONVERSACIONES Y TICKETS */}
                <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4">
                    {/* Pestañas */}
                    <div className="flex bg-black/40 p-1 rounded-xl border border-white/10 w-full mb-3">
                        <button
                            onClick={() => setBitacoraTab('conversacion')}
                            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${bitacoraTab === 'conversacion' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                        >
                            <MessageSquare size={13} /> Conversaciones ({conversaciones.length})
                        </button>
                        <button
                            onClick={() => setBitacoraTab('ticket')}
                            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${bitacoraTab === 'ticket' ? 'bg-amber-600 text-white' : 'text-gray-400 hover:text-white'}`}
                        >
                            <Ticket size={13} /> Tickets {ticketsAbiertos > 0 && <span className="bg-red-500/80 text-white px-1.5 rounded-full">{ticketsAbiertos}</span>}
                        </button>
                    </div>

                    {/* Entrada nueva */}
                    <div className="flex gap-2 mb-4">
                        <input
                            type="text"
                            value={newNote}
                            onChange={(e) => setNewNote(e.target.value)}
                            placeholder={bitacoraTab === 'ticket' ? 'Describe el ticket / incidencia...' : 'Escribe una conversación o gestión...'}
                            className="flex-1 bg-black/40 border border-white/10 rounded-xl p-2.5 text-xs text-white outline-none focus:border-blue-500 transition-colors placeholder:text-gray-600"
                            onKeyDown={(e) => e.key === 'Enter' && addNote()}
                        />
                        <Button onClick={addNote} disabled={isSavingNote || !newNote.trim()} className={`${bitacoraTab === 'ticket' ? 'bg-amber-600 hover:bg-amber-500' : 'bg-blue-600 hover:bg-blue-500'} text-white rounded-xl px-4 h-auto`}>
                            <Send size={16} />
                        </Button>
                    </div>

                    {notasVisibles.length > 0 ? (
                        <div className="space-y-3 max-h-48 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/10">
                            {notasVisibles.map((nota, i) => (
                                <div key={nota.id || i} className={`border border-white/5 rounded-xl p-2.5 ${nota.tipo === 'ticket' && nota.resuelto ? 'opacity-50' : ''} ${nota.tipo === 'ticket' ? 'bg-amber-500/5' : 'bg-black/20'}`}>
                                    <div className="flex items-center justify-between gap-2 mb-1">
                                        <div className="flex items-center gap-1.5 text-gray-500 min-w-0">
                                            <Clock size={10} className="shrink-0" />
                                            <span className="text-[9px] font-black tracking-widest truncate">{nota.fecha}</span>
                                            {nota.autor && <span className="text-[9px] text-gray-600 truncate">· {nota.autor}</span>}
                                        </div>
                                        {nota.tipo === 'ticket' && (
                                            <button
                                                onClick={() => handleToggleTicket(nota)}
                                                title={nota.resuelto ? 'Reabrir ticket' : 'Marcar como resuelto'}
                                                className={`flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border transition-colors shrink-0 ${nota.resuelto ? 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10' : 'text-amber-400 border-amber-400/30 bg-amber-400/10 hover:bg-amber-400/20'}`}
                                            >
                                                {nota.resuelto ? <><CheckCircle2 size={10} /> Resuelto</> : <><RotateCcw size={10} /> Abierto</>}
                                            </button>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-200">{nota.texto}</p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-xs text-gray-500 italic text-center py-2">
                            {bitacoraTab === 'ticket' ? 'Sin tickets registrados.' : 'Sin conversaciones registradas aún.'}
                        </p>
                    )}
                </div>

            </div>

            {/* FOOTER BOTÓN GUARDAR */}
            {isEditing && (
                <div className="p-4 border-t border-white/10 bg-[#0f172a] flex gap-3 shrink-0 mt-auto">
                    <Button variant="ghost" onClick={() => { setIsEditing(false); setFormData(client); }} className="flex-1 uppercase font-black text-[10px] tracking-widest text-gray-400 h-10 rounded-xl bg-white/5 hover:bg-white/10 transition-colors">
                        Cancelar
                    </Button>
                    <Button onClick={handleSave} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white uppercase font-black text-[10px] tracking-widest h-10 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-lg shadow-blue-500/20">
                        <Save size={14} /> Guardar Cambios
                    </Button>
                </div>
            )}
        </motion.div>
    );
};

export default ClientDetailDrawer;