import { useNavigate } from 'react-router-dom';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Building2, User, Edit, DollarSign, Briefcase, FileSpreadsheet, Key, Send, Save, Clock, AlertTriangle, CheckCircle2, Landmark, Receipt, Layers, Plus, Trash2, MessageSquare, Ticket, History, RotateCcw, Search, Flag, CalendarClock, Phone, Mail, Copy, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { EditableField, SecureField, SelectField } from '../ui/CrmUI';
import LogoUploader from '@/components/ui/LogoUploader';
import { createNotaApi, editarNotaApi, eliminarNotaApi, cambiarPlanApi, addServicioApi, removeServicioApi, reactivarServicioApi, toggleTicketApi } from '@/services/crmService';

import { useAuth } from '@/hooks/useAuth';

const getSessionId = () => {
    try { return JSON.parse(localStorage.getItem('user') || '{}').sessionId; }
    catch { return null; }
};
const getUserNombre = () => {
    try { return JSON.parse(localStorage.getItem('user') || '{}').nombre || 'Tú'; }
    catch { return 'Tú'; }
};
// Formatea un número con separador de miles (es-CL); devuelve '' si no hay dígitos
const formatMiles = (val) => {
    const digits = String(val ?? '').replace(/\D/g, '');
    return digits ? Number(digits).toLocaleString('es-CL') : '';
};

// Valores permitidos por el CHECK de la BD (no enviar otros o falla la restricción)
const OPCIONES_PAGO = ['AL DIA', 'NO PAGADO', 'SERVICIO SUSPENDIDO'];
const OPCIONES_F29 = ['DECLARADO', 'PENDIENTE', 'NO DECLARAR'];
// Incluye el valor actual si no está en la lista canónica (para no perderlo ni forzar cambio)
const conActual = (opts, actual) => (actual && !opts.includes(actual)) ? [actual, ...opts] : opts;

// Dígito verificador (módulo 11)
const validarRutDV = (rut) => {
    const limpio = String(rut || '').toUpperCase().replace(/[^0-9K]/g, '');
    if (limpio.length < 2) return false;
    const body = limpio.slice(0, -1);
    const dv = limpio.slice(-1);
    let suma = 0, mul = 2;
    for (let i = body.length - 1; i >= 0; i--) {
        suma += parseInt(body[i], 10) * mul;
        mul = mul < 7 ? mul + 1 : 2;
    }
    const resto = 11 - (suma % 11);
    const esperado = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);
    return dv === esperado;
};
const validarCorreo = (c) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(c || '').trim());

const ClientDetailDrawer = ({ client, onClose, onUpdateClient, onDelete, planes = [], serviciosDisponibles = [], preciosPlanTramo = [], onRefresh }) => {
    const navigate = useNavigate();
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState(client);
    const [newNote, setNewNote] = useState('');
    const [isSavingNote, setIsSavingNote] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // Bitácora: pestaña activa (conversaciones / tickets)
    const [bitacoraTab, setBitacoraTab] = useState('conversacion');
    const [bitacoraSearch, setBitacoraSearch] = useState('');
    // Metadatos de ticket para nueva entrada
    const [ticketPrioridad, setTicketPrioridad] = useState('Media');
    const [ticketResponsable, setTicketResponsable] = useState('');
    const [ticketVencimiento, setTicketVencimiento] = useState('');
    // Edición de nota existente
    const [editingNoteId, setEditingNoteId] = useState(null);
    const [editNoteText, setEditNoteText] = useState('');

    // Administración de plan
    const [selectedPlanId, setSelectedPlanId] = useState('');
    const [planMotivo, setPlanMotivo] = useState('');
    const [isSavingPlan, setIsSavingPlan] = useState(false);
    const [showPlanHistory, setShowPlanHistory] = useState(false);
    const [confirmPlan, setConfirmPlan] = useState(false);

    // Servicios contratados
    const [newServicioId, setNewServicioId] = useState('');
    const [newServicioPrecio, setNewServicioPrecio] = useState('');
    const [newServicioPeriod, setNewServicioPeriod] = useState('mensual');
    const [newServicioPrimera, setNewServicioPrimera] = useState('');
    const [isSavingServicio, setIsSavingServicio] = useState(false);

    // =========================================
    // LÓGICA PARA SELECCIONAR LA EMPRESA ACTIVA
    // =========================================
    const { selectedCompany, setSelectedCompany } = useAuth();
    const isSelected = selectedCompany?.id === client?.id;

    // OJO: esto NO activa ni reactiva al cliente. Elige la empresa con la que va
    // a trabajar el resto de la aplicación (contabilidad, facturación, bancos).
    //
    // El botón decía "Activar Empresa" y estaba a cuatro centímetros de la
    // etiqueta "Estado del servicio: ACTIVO". Cualquiera entendía que servía para
    // reactivar un cliente dado de baja, que es una acción completamente
    // distinta y que sí existe, en el lápiz de edición.
    const handleSelectCompany = () => {
        if (setSelectedCompany) {
            setSelectedCompany(client);
            const nombreEmpresa = client.razon_social || client.razonSocial || 'la empresa';
            toast({
                title: 'Empresa seleccionada',
                description: `El resto del sistema —contabilidad, facturación y bancos— trabajará con ${nombreEmpresa}.`,
            });
        }
    };
    // =========================================

    const handleDelete = async () => {
        if (!onDelete) return;
        setIsDeleting(true);
        try {
            await onDelete(client);
            // el cierre lo maneja el padre al refrescar la lista
        } finally {
            setIsDeleting(false);
            setConfirmDelete(false);
        }
    };

    useEffect(() => {
        setFormData(client);
        setIsEditing(false);
        setConfirmDelete(false);
        setNewNote('');
        setBitacoraTab('conversacion');
        setBitacoraSearch('');
        setEditingNoteId(null);
        setTicketPrioridad('Media');
        setTicketResponsable('');
        setTicketVencimiento('');
        setSelectedPlanId(client?.planId || '');
        setPlanMotivo('');
        setConfirmPlan(false);
        setNewServicioId('');
        setNewServicioPrecio('');
    }, [client]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = async () => {
        // Validación al editar: RUT representante y correo
        if (formData.repRut && String(formData.repRut).trim() && !validarRutDV(formData.repRut)) {
            toast({ title: "RUT del representante inválido", description: "Revisa el dígito verificador.", variant: "destructive" });
            return;
        }
        if (formData.correo && String(formData.correo).trim() && !validarCorreo(formData.correo)) {
            toast({ title: "Correo inválido", description: "Ingresa un correo con formato válido.", variant: "destructive" });
            return;
        }
        if (onUpdateClient) await onUpdateClient(formData);
        setIsEditing(false);
        if (onRefresh) onRefresh(); // re-sincroniza el score recalculado por el trigger
    };

    const addNote = async () => {
        if(!newNote.trim()) return;
        setIsSavingNote(true);
        try {
            const sessionId = getSessionId();
            const meta = bitacoraTab === 'ticket'
                ? { prioridad: ticketPrioridad, responsable: ticketResponsable, fechaVencimiento: ticketVencimiento || null }
                : {};
            const response = await createNotaApi(sessionId, formData.id, newNote, bitacoraTab, meta);
            const payload = await response.json();

            if(payload.success) {
                setFormData(prev => ({
                    ...prev,
                    notas: [payload.nota, ...(prev.notas || [])]
                }));
                setNewNote('');
                setTicketResponsable('');
                setTicketVencimiento('');
                setTicketPrioridad('Media');
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

    const startEditNote = (nota) => {
        setEditingNoteId(nota.id);
        setEditNoteText(nota.texto);
    };

    const handleSaveEditNote = async (nota) => {
        if (!editNoteText.trim()) return;
        try {
            const response = await editarNotaApi(getSessionId(), nota.id, { texto: editNoteText });
            const payload = await response.json();
            if (!payload.success) throw new Error(payload.message);
            setFormData(prev => ({
                ...prev,
                notas: (prev.notas || []).map(n => n.id === nota.id ? { ...n, ...payload.nota } : n)
            }));
            setEditingNoteId(null);
            setEditNoteText('');
            toast({ title: "Nota actualizada" });
        } catch (error) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        }
    };

    const handleDeleteNote = async (nota) => {
        try {
            const response = await eliminarNotaApi(getSessionId(), nota.id);
            const payload = await response.json();
            if (!payload.success) throw new Error(payload.message);
            setFormData(prev => ({
                ...prev,
                notas: (prev.notas || []).filter(n => n.id !== nota.id)
            }));
            toast({ title: "Nota eliminada" });
        } catch (error) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
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
                    { planAnterior: prev.plan || prev.plan_nombre || '—', planNuevo: nuevoNombre, autor: getUserNombre(), motivo: planMotivo, fecha: new Date().toLocaleString('es-CL') },
                    ...(prev.planHistorial || [])
                ]
            }));
            setPlanMotivo('');
            setConfirmPlan(false);
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
            const response = await addServicioApi(getSessionId(), formData.id, {
                servicioId: newServicioId,
                precioPactado: newServicioPrecio,
                periodicidad: newServicioPeriod,
                primeraFacturacion: newServicioPrimera || null,
            });
            const payload = await response.json();
            if (!payload.success) throw new Error(payload.message);
            setFormData(prev => ({ ...prev, servicios: [...(prev.servicios || []), payload.servicio] }));
            setNewServicioId('');
            setNewServicioPrecio('');
            setNewServicioPeriod('mensual');
            setNewServicioPrimera('');
            toast({ title: "Servicio agregado", description: payload.servicio?.nombre });
            if (onRefresh) onRefresh();
        } catch (error) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        } finally {
            setIsSavingServicio(false);
        }
    };

    const handleRemoveServicio = async (servicio) => {
        if (!window.confirm(`¿Dar de baja el servicio "${servicio.nombre}"? Quedará suspendido (podrás reactivarlo después).`)) return;
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

    const handleReactivarServicio = async (servicio) => {
        try {
            const response = await reactivarServicioApi(getSessionId(), servicio.id);
            const payload = await response.json();
            if (!payload.success) throw new Error(payload.message);
            setFormData(prev => ({
                ...prev,
                servicios: (prev.servicios || []).map(s => s.id === servicio.id ? { ...s, estado: 'Activo', fechaTermino: null, fechaInicio: payload.servicio?.fechaInicio || s.fechaInicio } : s)
            }));
            toast({ title: "Servicio reactivado", description: servicio.nombre });
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
    const telParaLink = String(wsRaw || telRaw || '').replace(/\D/g, '');
    const correoLink = correo && correo !== 'Sin Registro' ? correo : '';
    const copiar = (texto, label) => {
        if (!texto || texto === 'Sin Registro' || texto === 'Sin RUT') return;
        navigator.clipboard?.writeText(String(texto));
        toast({ title: 'Copiado', description: `${label} copiado al portapapeles`, duration: 1500 });
    };

    const claveWeb = formData.web_password_encrypted || formData.claveWeb || 'SIN CLAVE';
    const claveSII = formData.sii_password_encrypted || formData.claveSII || 'SIN CLAVE';

    const giro = formData.giro || 'Sin Registro';
    const regimen = formData.regimen || formData.regimen_tributario || 'Sin Registro';
    const honorario = Number(formData.honorarioNeto ?? formData.honorario_neto ?? 0);
    const direccion = formData.direccion || 'Sin Registro';
    const comuna = formData.comuna || 'Sin Registro';
    const ciudad = formData.ciudad || 'Sin Registro';
    const score = formData.score ?? 50;
    const pagoServicio = formData.pagoServicio || formData.estado_pago || 'AL DIA';
    const estadoF29 = formData.estadoFormulario || formData.estado_f29 || 'PENDIENTE';
    const logoUrl = formData.logo || formData.logo_url || '';

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

    // --- Precio de plan según tramo de facturación de la empresa ---
    const facturacionMensual = Number(ventas) || 0; // ventas mensuales = facturación mensual
    // Lista de precios predefinida (netos de los tramos de plan) para sugerir al asignar un servicio.
    const preciosSugeridos = React.useMemo(
        () => [...new Set((preciosPlanTramo || []).map(r => Number(r.precioNeto)).filter(n => n > 0))].sort((a, b) => a - b),
        [preciosPlanTramo]
    );
    const nombreDePlanId = (id) => planes.find(p => p.id === id)?.nombre;
    const precioDePlan = (planNombre) => {
        const rows = (preciosPlanTramo || []).filter(r => r.plan === planNombre);
        if (!rows.length) return null;
        const fijo = rows.find(r => r.tramoOrden === 0);
        const row = fijo || rows.find(r => facturacionMensual >= r.tramoMin && (r.tramoMax == null || facturacionMensual < r.tramoMax)) || rows[rows.length - 1];
        if (!row) return null;
        return { neto: row.precioNeto, iva: Math.round(row.precioNeto * 0.19), total: Math.round(row.precioNeto * 1.19), rrhhGratis: row.rrhhGratis, tramoMin: row.tramoMin, tramoMax: row.tramoMax, fijo: !!fijo };
    };
    const precioSeleccionado = precioDePlan(nombreDePlanId(selectedPlanId));

    // --- Plan y servicios ---
    const planHistorial = formData.planHistorial || [];
    const fechaCambioPlan = formData.fechaCambioPlan || null;
    const serviciosActivos = (formData.servicios || []).filter(s => s.estado !== 'Suspendido');
    const serviciosSuspendidos = (formData.servicios || []).filter(s => s.estado === 'Suspendido');
    const idsContratados = new Set(serviciosActivos.map(s => s.nombre));
    const serviciosParaAgregar = (serviciosDisponibles || []).filter(s => !idsContratados.has(s.nombre));

    // --- Honorarios: plan actual + servicios contratados ---
    const precioPlanActual = precioDePlan(plan);              // precio sugerido por tramo (referencia)
    const totalServicios = serviciosActivos.reduce((acc, s) => acc + (Number(s.precioPactado) || 0), 0);
    // El honorario REAL es el neto del Excel (lo que efectivamente paga), no el sugerido por tramo.
    const netoPlan = honorario;
    const totalHonorariosNeto = netoPlan + totalServicios;
    const totalHonorariosConIva = Math.round(totalHonorariosNeto * 1.19);

    // --- Precio sugerido (plan según tramo) vs. lo configurado en servicios ---
    // Útil para detectar clientes mal cobrados respecto de la matriz de precios.
    const sugeridoVsCobrado = precioPlanActual
        ? { sugerido: precioPlanActual.neto, cobrado: honorario, dif: honorario - precioPlanActual.neto }
        : null;

    // --- Bitácora por tipo ---
    const todasLasNotas = formData.notas || [];
    const conversaciones = todasLasNotas.filter(n => (n.tipo || 'conversacion') !== 'ticket');
    const tickets = todasLasNotas.filter(n => n.tipo === 'ticket');
    const ticketsAbiertos = tickets.filter(t => !t.resuelto).length;
    const _notasBase = bitacoraTab === 'ticket' ? tickets : conversaciones;
    const _term = bitacoraSearch.trim().toLowerCase();
    const notasVisibles = _term
        ? _notasBase.filter(n =>
            String(n.texto || '').toLowerCase().includes(_term) ||
            String(n.autor || '').toLowerCase().includes(_term) ||
            String(n.responsable || '').toLowerCase().includes(_term))
        : _notasBase;

    // --- Recordatorios / alertas automáticas del cliente ---
    const recordatorios = [];
    const pagoUp = String(pagoServicio).toUpperCase();
    const f29Up = String(estadoF29).toUpperCase();
    if (pagoUp === 'NO PAGADO') recordatorios.push({ t: 'Pago pendiente', tone: 'red' });
    if (pagoUp === 'SERVICIO SUSPENDIDO') recordatorios.push({ t: 'Servicio suspendido', tone: 'red' });
    if (f29Up === 'PENDIENTE') recordatorios.push({ t: 'F29 pendiente de declarar', tone: 'amber' });
    if (Number(dtAtrasados) > 0) recordatorios.push({ t: `${dtAtrasados} trámite(s) DT atrasado(s)`, tone: 'amber' });
    if (ticketsAbiertos > 0) recordatorios.push({ t: `${ticketsAbiertos} ticket(s) abierto(s)`, tone: 'sky' });
    const toneCls = {
        red: 'text-red-600 bg-red-500/10 border-red-500/30',
        amber: 'text-amber-700 bg-amber-500/10 border-amber-500/30',
        sky: 'text-sky-700 bg-sky-500/10 border-sky-500/30',
    };

    return (
        <>
        {/* Fondo: cierra al hacer clic fuera. La ventana flota, así la tabla no se deforma. */}
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        />
        {/* Ventana centrada */}
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: 'tween', duration: 0.2 }}
            className="pointer-events-auto w-full max-w-3xl max-h-[88vh] bg-white backdrop-blur-3xl border border-[#efe8dd] rounded-2xl flex flex-col overflow-hidden shadow-2xl"
        >
            {/* CABECERA (Con Atajos Dinámicos) */}
            <div className="p-5 border-b border-[#efe8dd] flex flex-col gap-4 bg-gradient-to-r from-blue-900/30 to-transparent shrink-0">
                
                {/* 1. Nombre y Plan */}
                <div className="flex gap-4 items-center">
                    <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-600 shrink-0 overflow-hidden">
                        {logoUrl ? (
                            <img src={logoUrl} alt="logo" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                        ) : (
                            type === 'Empresa' ? <Building2 size={24} /> : <User size={24} />
                        )}
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-sm md:text-base font-black text-slate-900 uppercase tracking-tight leading-tight truncate">
                            {razonSocial}
                        </h2>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                            <button onClick={() => copiar(rut, 'RUT')} title="Copiar RUT" className="group flex items-center gap-1 text-xs text-slate-500 font-mono bg-slate-50 hover:bg-black/50 px-2 py-0.5 rounded border border-[#efe8dd] truncate transition-colors">
                                {rut} <Copy size={11} className="opacity-40 group-hover:opacity-100" />
                            </button>
                            <span className="text-[10px] font-black px-2 py-0.5 rounded border border-blue-500/30 text-blue-600 bg-blue-500/10 uppercase shrink-0">
                                Plan: {plan}
                            </span>
                            {honorario > 0 && (
                                <span className="text-[10px] font-black px-2 py-0.5 rounded border border-emerald-500/30 text-emerald-700 bg-emerald-500/10 shrink-0">
                                    {fmt(honorario)}/mes
                                </span>
                            )}
                        </div>

                        {/* Acciones rápidas de contacto */}
                        <div className="flex items-center gap-1.5 mt-2">
                            {telParaLink.length >= 8 && (
                                <>
                                    <a href={`https://wa.me/${telParaLink}`} target="_blank" rel="noreferrer" title="WhatsApp" className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 hover:text-slate-900 bg-emerald-500/10 hover:bg-emerald-600 border border-emerald-500/30 px-2 py-1 rounded-lg transition-colors">
                                        <MessageSquare size={12} /> WhatsApp
                                    </a>
                                    <a href={`tel:+${telParaLink}`} title="Llamar" className="flex items-center gap-1 text-[10px] font-bold text-sky-400 hover:text-slate-900 bg-sky-500/10 hover:bg-sky-600 border border-sky-500/30 px-2 py-1 rounded-lg transition-colors">
                                        <Phone size={12} /> Llamar
                                    </a>
                                </>
                            )}
                            {correoLink && (
                                <a href={`mailto:${correoLink}`} title="Enviar correo" className="flex items-center gap-1 text-[10px] font-bold text-purple-600 hover:text-slate-900 bg-purple-500/10 hover:bg-purple-600 border border-purple-500/30 px-2 py-1 rounded-lg transition-colors">
                                    <Mail size={12} /> Correo
                                </a>
                            )}
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
                                    className="hidden md:flex items-center gap-1.5 px-3 py-1.5 md:py-2 rounded-xl font-black uppercase tracking-widest text-[9px] md:text-[10px] bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:bg-orange-600 hover:text-slate-900 transition-all shadow-lg"
                                >
                                    <Receipt size={14} /> Facturador
                                </motion.button>

                                {/* Botón: Ir a Bancos */}
                                <motion.button
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    onClick={() => navigate('/bancos')}
                                    className="hidden md:flex items-center gap-1.5 px-3 py-1.5 md:py-2 rounded-xl font-black uppercase tracking-widest text-[9px] md:text-[10px] bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-600 hover:text-slate-900 transition-all shadow-lg"
                                >
                                    <Landmark size={14} /> Bancos
                                </motion.button>

                                {/* La ficha era una isla: para saber qué se le facturó,
                                    si ya se le cobró el mes o si le llegó el recordatorio,
                                    había que salir del CRM, cambiar de módulo y volver a
                                    buscar al mismo cliente a mano. */}
                                <motion.button
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    onClick={() => navigate('/facturacion?sub=cobros')}
                                    title="Ver el cobro del mes de este cliente"
                                    className="hidden md:flex items-center gap-1.5 px-3 py-1.5 md:py-2 rounded-xl font-black uppercase tracking-widest text-[9px] md:text-[10px] bg-emerald-500/20 text-emerald-700 border border-emerald-500/30 hover:bg-emerald-600 hover:text-white transition-all shadow-lg"
                                >
                                    <DollarSign size={14} /> Cobro del mes
                                </motion.button>

                                <motion.button
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    onClick={() => navigate('/facturacion?sub=correos')}
                                    title="Ver los correos que se le enviaron"
                                    className="hidden md:flex items-center gap-1.5 px-3 py-1.5 md:py-2 rounded-xl font-black uppercase tracking-widest text-[9px] md:text-[10px] bg-purple-500/20 text-purple-700 border border-purple-500/30 hover:bg-purple-600 hover:text-white transition-all shadow-lg"
                                >
                                    <Send size={14} /> Correos
                                </motion.button>

                                <motion.button
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    onClick={() => navigate('/tareas?sub=todas')}
                                    title="Ver las tareas pendientes con este cliente"
                                    className="hidden md:flex items-center gap-1.5 px-3 py-1.5 md:py-2 rounded-xl font-black uppercase tracking-widest text-[9px] md:text-[10px] bg-sky-500/20 text-sky-700 border border-sky-500/30 hover:bg-sky-600 hover:text-white transition-all shadow-lg"
                                >
                                    <Layers size={14} /> Tareas
                                </motion.button>
                            </>
                        )}
                    </AnimatePresence>

                    {/* Elegir con qué empresa trabaja el resto del sistema.
                        NO tiene nada que ver con dar de alta o de baja al cliente. */}
                    <button
                        onClick={handleSelectCompany}
                        title={isSelected
                            ? 'El resto del sistema ya está trabajando con esta empresa'
                            : 'Contabilidad, facturación y bancos pasarán a trabajar con esta empresa'}
                        className={`flex items-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2 rounded-xl font-black uppercase tracking-widest text-[9px] md:text-[10px] transition-all ${isSelected ? 'bg-emerald-500/20 text-emerald-600 border border-emerald-500/30' : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'}`}
                    >
                        {isSelected ? (
                            <><CheckCircle2 size={14} /> Trabajando con esta</>
                        ) : (
                            <><Building2 size={14} /> Trabajar con esta empresa</>
                        )}
                    </button>

                    {/* Controles de Ventana (Editar, Eliminar y Cerrar) */}
                    <div className="flex gap-1 ml-auto">
                        <button onClick={() => setIsEditing(!isEditing)} aria-label={isEditing ? 'Salir de edición' : 'Editar cliente'} title="Editar" className={`p-1.5 md:p-2 rounded-xl border transition-colors ${isEditing ? 'bg-blue-500/20 border-blue-500/50 text-blue-600' : 'bg-slate-50 border-transparent text-slate-500 hover:text-slate-900'}`}>
                            <Edit size={16} />
                        </button>
                        {onDelete && (
                            <button onClick={() => setConfirmDelete(true)} title="Eliminar cliente" className="p-1.5 md:p-2 rounded-xl bg-slate-50 border border-transparent text-slate-500 hover:text-red-500 hover:bg-red-500/10 transition-colors">
                                <Trash2 size={16} />
                            </button>
                        )}
                        <button onClick={onClose} aria-label="Cerrar ficha" title="Cerrar" className="p-1.5 md:p-2 rounded-xl bg-slate-50 text-slate-500 hover:text-red-500 transition-colors">
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

                {/* RECORDATORIOS / ALERTAS */}
                {recordatorios.length > 0 && (
                    <div className="bg-white border border-[#efe8dd] rounded-2xl p-3">
                        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                            <Bell size={13} /> Recordatorios ({recordatorios.length})
                        </h3>
                        <div className="flex flex-wrap gap-1.5">
                            {recordatorios.map((r, i) => (
                                <span key={i} className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${toneCls[r.tone]}`}>{r.t}</span>
                            ))}
                        </div>
                    </div>
                )}

                {/* 0. ESTADO Y CLASIFICACIÓN */}
                <div className="bg-white border border-[#efe8dd] rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <CheckCircle2 size={14} /> Estado y Clasificación
                        </h3>
                        {!isEditing && (
                            <button onClick={() => setIsEditing(true)} className="text-[9px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-700 flex items-center gap-1">
                                <Edit size={11} /> Editar
                            </button>
                        )}
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                        {isEditing ? (
                            <>
                                {/* El estado de pago ya NO se edita: se calcula desde el
                                    ciclo de cobro. Editarlo a mano era lo que hacía que
                                    la ficha dijera una cosa y la lista mostrara otra. */}
                                <div className="flex flex-col gap-1.5">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Estado de Pago</span>
                                    <span className={`w-fit text-[10px] font-black px-2 py-0.5 rounded-full border uppercase ${(pagoServicio === 'AL DIA') ? 'text-emerald-700 bg-emerald-500/10 border-emerald-500/30' : pagoServicio === 'NO PAGADO' ? 'text-red-600 bg-red-500/10 border-red-500/30' : 'text-slate-600 bg-slate-500/10 border-slate-500/30'}`}>{pagoServicio}</span>
                                    <span className="text-[9px] text-slate-400 italic leading-tight">Sale del ciclo de cobro. Se cambia registrando el pago, no acá.</span>
                                </div>
                                <SelectField label="Estado F29" name="estadoFormulario" value={formData.estadoFormulario || estadoF29} isEditing={true} onChange={handleInputChange} options={conActual(OPCIONES_F29, formData.estadoFormulario || estadoF29)} />
                                <div className="flex flex-col gap-1.5">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Score (automático)</span>
                                    <span className="text-[10px] text-slate-400 italic">Se recalcula según los estados</span>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="flex flex-col gap-1.5">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Estado de Pago</span>
                                    <span className={`w-fit text-[10px] font-black px-2 py-0.5 rounded-full border uppercase ${(pagoServicio === 'PAGADO' || pagoServicio === 'AL DIA') ? 'text-emerald-700 bg-emerald-500/10 border-emerald-500/30' : pagoServicio === 'NO PAGADO' ? 'text-red-600 bg-red-500/10 border-red-500/30' : 'text-slate-600 bg-slate-500/10 border-slate-500/30'}`}>{pagoServicio}</span>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Estado F29</span>
                                    <span className={`w-fit text-[10px] font-black px-2 py-0.5 rounded-full border uppercase ${(estadoF29 === 'DECLARADO' || estadoF29 === 'NO DECLARAR') ? 'text-emerald-700 bg-emerald-500/10 border-emerald-500/30' : estadoF29 === 'PENDIENTE' ? 'text-amber-700 bg-amber-500/10 border-amber-500/30' : 'text-orange-700 bg-orange-500/10 border-orange-500/30'}`}>{estadoF29}</span>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Score</span>
                                    <span className={`w-fit text-[10px] font-black px-2 py-0.5 rounded-md border ${score >= 80 ? 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20' : score >= 50 ? 'text-amber-600 bg-amber-500/10 border-amber-500/20' : 'text-red-500 bg-red-500/10 border-red-500/20'}`}>Score {score}</span>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Estado del servicio: Activo / De baja (controla en qué pestaña aparece) */}
                    <div className="mt-3 pt-3 border-t border-[#efe8dd] flex items-center justify-between gap-3">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Estado del servicio</span>
                        {isEditing ? (
                            <div className="flex bg-slate-50 p-1 rounded-lg border border-[#efe8dd]">
                                <button type="button" onClick={() => setFormData(prev => ({ ...prev, activo: true }))} className={`px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest transition-colors ${formData.activo !== false ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:text-slate-900'}`}>Activo</button>
                                <button type="button" onClick={() => setFormData(prev => ({ ...prev, activo: false }))} className={`px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest transition-colors ${formData.activo === false ? 'bg-red-600 text-white' : 'text-slate-500 hover:text-slate-900'}`}>De baja</button>
                            </div>
                        ) : (
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border uppercase ${formData.activo === false ? 'text-red-600 bg-red-500/10 border-red-500/30' : 'text-emerald-700 bg-emerald-500/10 border-emerald-500/30'}`}>{formData.activo === false ? 'De baja' : 'Activo'}</span>
                        )}
                    </div>
                </div>

                {/* 1. INFO GENERAL */}
                <div className="bg-white border border-[#efe8dd] rounded-2xl p-4">
                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <User size={14} /> Contacto y Representante
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                        <EditableField label="RUT Empresa" name="rut" value={isEditing ? (formData.rut || '') : rut} isEditing={isEditing} onChange={handleInputChange} isMono />
                        <EditableField label="Neto mensual (honorario)" name="honorario" value={isEditing ? (formData.honorario ?? honorario) : fmt(honorario)} isEditing={isEditing} onChange={handleInputChange} />
                        <EditableField label="Representante Legal" name="repNombre" value={isEditing ? formData.repNombre : repNombre} isEditing={isEditing} onChange={handleInputChange} />
                        <EditableField label="RUT Representante" name="repRut" value={isEditing ? formData.repRut : repRut} isEditing={isEditing} onChange={handleInputChange} />
                        <EditableField label="Correo Electrónico" name="correo" value={isEditing ? formData.correo : correo} isEditing={isEditing} onChange={handleInputChange} />
                        <EditableField label="WhatsApp / Teléfono" name="whatsapp" value={isEditing ? formData.whatsapp : whatsapp} isEditing={isEditing} onChange={handleInputChange} />
                        <EditableField label="Giro" name="giro" value={isEditing ? formData.giro : giro} isEditing={isEditing} onChange={handleInputChange} />
                        <EditableField label="Régimen Tributario" name="regimen" value={isEditing ? formData.regimen : regimen} isEditing={isEditing} onChange={handleInputChange} />
                    </div>

                    {/* RESPONSABLE DEL SERVICIO · es de la OFICINA, no del cliente.
                        Va aparte del representante legal justamente para que no se
                        confundan: los dos son "el contacto", pero de lados opuestos. */}
                    <div className="mt-3 pt-3 border-t border-[#efe8dd] flex items-center gap-2">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Responsable del servicio</span>
                        {client.responsableNombre ? (
                            <span className="text-xs font-bold text-emerald-700 bg-emerald-500/10 border border-emerald-500/25 rounded-lg px-2 py-0.5">
                                {client.responsableNombre}
                            </span>
                        ) : (
                            <span className="text-[11px] text-slate-400 italic">Sin asignar</span>
                        )}
                    </div>

                    {/* Los demás representantes legales. Solo aparece si hay más de
                        uno: con uno solo ya está arriba y repetirlo sobra. */}
                    {Array.isArray(client.representantes) && client.representantes.length > 1 && (
                        <div className="mt-3 pt-3 border-t border-[#efe8dd]">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                Otros representantes legales ({client.representantes.length - 1})
                            </span>
                            <div className="mt-1.5 space-y-1">
                                {client.representantes.filter(r => !r.principal).map(r => (
                                    <div key={r.id} className="flex items-center gap-2 flex-wrap text-xs bg-slate-50 border border-[#efe8dd] rounded-lg px-2.5 py-1.5">
                                        <span className="font-bold text-slate-700">{r.nombre}</span>
                                        {r.rut && <span className="text-slate-500 font-mono text-[10px]">{r.rut}</span>}
                                        {r.email && <span className="text-slate-400 text-[10px] truncate">{r.email}</span>}
                                        {r.telefono && <span className="text-slate-400 text-[10px]">{r.telefono}</span>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* PLANES · el negocio vende más de uno a la vez. Se muestra solo
                    cuando hay más de uno; con uno solo ya está en la cabecera. */}
                {Array.isArray(client.planes) && client.planes.length > 1 && (
                    <div className="bg-white border border-[#efe8dd] rounded-2xl p-4">
                        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                            <Layers size={14} /> Planes contratados ({client.planes.length})
                        </h3>
                        <div className="space-y-1.5">
                            {client.planes.map(p => (
                                <div key={p.id} className="flex items-center gap-2 border border-[#efe8dd] rounded-lg px-3 py-2">
                                    <span className="text-[9px] font-black text-slate-300 w-4">{p.principal ? '★' : ''}</span>
                                    <span className="text-xs font-bold text-slate-700 flex-1 truncate">{p.nombre}</span>
                                    <span className="text-xs font-black text-slate-900 tabular-nums">{fmt(p.precio)}</span>
                                </div>
                            ))}
                            <div className="flex items-center gap-2 px-3 pt-2 border-t border-[#efe8dd]">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex-1">Suma de planes</span>
                                <span className="text-xs font-black text-emerald-700 tabular-nums">
                                    {fmt(client.planes.reduce((s, p) => s + (Number(p.precio) || 0), 0))}
                                </span>
                            </div>
                        </div>
                        {/* Si la suma no calza con lo que se cobra, hay que verlo. */}
                        {Math.round(client.planes.reduce((s, p) => s + (Number(p.precio) || 0), 0)) !== Math.round(Number(honorario) || 0) && (
                            <p className="text-[10px] text-amber-700 bg-amber-500/10 border border-amber-500/25 rounded-lg px-2.5 py-1.5 mt-2">
                                La suma de los planes no calza con el honorario cobrado ({fmt(honorario)}).
                                El honorario es el que manda en la facturación.
                            </p>
                        )}
                    </div>
                )}

                {/* DIRECCIÓN */}
                <div className="bg-white border border-[#efe8dd] rounded-2xl p-4">
                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <Landmark size={14} /> Dirección (Casa Matriz)
                    </h3>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                        <EditableField label="Dirección" name="direccion" value={isEditing ? formData.direccion : direccion} isEditing={isEditing} onChange={handleInputChange} />
                        <EditableField label="Comuna" name="comuna" value={isEditing ? formData.comuna : comuna} isEditing={isEditing} onChange={handleInputChange} />
                        <EditableField label="Ciudad" name="ciudad" value={isEditing ? formData.ciudad : ciudad} isEditing={isEditing} onChange={handleInputChange} />
                        {isEditing && (
                            <div className="col-span-2 lg:col-span-3">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Logo del cliente</p>
                                <LogoUploader
                                    value={formData.logo || formData.logo_url || ''}
                                    onChange={(dataUri) => setFormData(prev => ({ ...prev, logo: dataUri }))}
                                    onError={(msg) => toast({ variant: 'destructive', title: 'Logo', description: msg })}
                                />
                            </div>
                        )}
                    </div>
                </div>

                {/* 2. CREDENCIALES */}
                <div className="bg-blue-500/5 border border-blue-500/10 rounded-2xl p-4">
                    <h3 className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-3 flex items-center gap-2">
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
                                className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-900 transition-colors"
                            >
                                <History size={12} /> Historial ({planHistorial.length})
                            </button>
                        )}
                    </div>

                    {/* Plan actual + selector */}
                    <div className="flex flex-wrap items-end gap-2 mb-2">
                        <div className="flex flex-col gap-1 flex-1 min-w-[120px]">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Plan Actual</span>
                            <select
                                value={selectedPlanId}
                                onChange={(e) => setSelectedPlanId(e.target.value)}
                                className="bg-slate-50 border border-[#efe8dd] rounded-lg p-2 text-xs text-slate-900 outline-none focus:border-indigo-500 cursor-pointer"
                            >
                                <option value="">— Selecciona un plan —</option>
                                {planes.map(p => {
                                    const pr = precioDePlan(p.nombre);
                                    return <option key={p.id} value={p.id}>{p.nombre}{pr ? ` — ${fmt(pr.neto)} +IVA` : ''}</option>;
                                })}
                            </select>
                        </div>
                        <input
                            type="text"
                            value={planMotivo}
                            onChange={(e) => setPlanMotivo(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && selectedPlanId && selectedPlanId !== formData.planId) setConfirmPlan(true); }}
                            placeholder="Motivo (opcional)"
                            className="flex-1 min-w-[120px] bg-slate-50 border border-[#efe8dd] rounded-lg p-2 text-xs text-slate-900 outline-none focus:border-indigo-500 placeholder:text-slate-400"
                        />
                        <Button
                            onClick={() => setConfirmPlan(true)}
                            disabled={isSavingPlan || !selectedPlanId || selectedPlanId === formData.planId}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-3 h-9 text-[10px] font-black uppercase tracking-widest"
                        >
                            Cambiar
                        </Button>
                    </div>

                    {/* Confirmación de cambio de plan */}
                    <AnimatePresence>
                        {confirmPlan && selectedPlanId && selectedPlanId !== formData.planId && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden mb-2"
                            >
                                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
                                    <p className="text-[11px] text-amber-100 font-bold mb-2">
                                        ¿Cambiar plan de <span className="text-slate-900 font-bold">{plan}</span> a <span className="text-slate-900 font-bold">{nombreDePlanId(selectedPlanId)}</span>?
                                        {precioSeleccionado && <span className="text-emerald-700"> Nuevo valor: {fmt(precioSeleccionado.neto)} +IVA.</span>}
                                    </p>
                                    <div className="flex gap-2">
                                        <Button onClick={() => setConfirmPlan(false)} disabled={isSavingPlan} className="flex-1 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg h-8 text-[10px] font-black uppercase tracking-widest">
                                            Cancelar
                                        </Button>
                                        <Button onClick={handleCambiarPlan} disabled={isSavingPlan} className="flex-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg h-8 text-[10px] font-black uppercase tracking-widest">
                                            {isSavingPlan ? 'Cambiando…' : 'Sí, cambiar'}
                                        </Button>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                    {/* Precio del plan según facturación de la empresa */}
                    {precioSeleccionado && (
                        <div className="bg-slate-50 border border-indigo-500/20 rounded-xl p-3 mb-2">
                            <div className="flex items-center justify-between">
                                <span className="text-[9px] text-slate-400 uppercase tracking-widest">Valor del plan</span>
                                <span className="text-[9px] text-slate-400">
                                    {precioSeleccionado.fijo ? 'Precio fijo' : `Facturación: ${fmt(facturacionMensual)}`}
                                </span>
                            </div>
                            <div className="flex items-baseline gap-2 mt-1">
                                <span className="text-lg font-black text-slate-900">{fmt(precioSeleccionado.neto)}</span>
                                <span className="text-[10px] text-slate-500">neto</span>
                                <span className="text-[10px] text-slate-400">+ IVA {fmt(precioSeleccionado.iva)}</span>
                            </div>
                            <div className="flex items-center justify-between mt-0.5">
                                <span className="text-[11px] font-bold text-emerald-600">Total: {fmt(precioSeleccionado.total)}</span>
                                {precioSeleccionado.rrhhGratis > 0 && <span className="text-[9px] font-black text-amber-600">🎁 {precioSeleccionado.rrhhGratis} RRHH gratis</span>}
                            </div>
                        </div>
                    )}
                    {fechaCambioPlan && (
                        <p className="text-[9px] text-slate-400 mb-3">Último cambio de plan: <span className="text-slate-600 font-bold">{fechaCambioPlan}</span></p>
                    )}

                    {/* Historial de cambios de plan */}
                    <AnimatePresence>
                        {showPlanHistory && planHistorial.length > 0 && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mb-3">
                                <div className="space-y-2 bg-slate-50 rounded-xl p-3 border border-[#efe8dd] max-h-40 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
                                    {planHistorial.map((h, i) => (
                                        <div key={i} className="text-[10px] border-b border-[#efe8dd] pb-1.5 last:border-0 last:pb-0">
                                            <div className="flex items-center gap-1.5 text-slate-700 font-bold">
                                                <span className="text-slate-400">{h.planAnterior}</span> → <span className="text-indigo-300">{h.planNuevo}</span>
                                            </div>
                                            <div className="text-slate-400 flex flex-wrap gap-x-2">
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

                    {/* Servicios contratados (activos) */}
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Servicios Contratados</span>
                    <div className="flex flex-col gap-1.5 mt-2 mb-3">
                        {serviciosActivos.length > 0 ? serviciosActivos.map(s => (
                            <div key={s.id} className="flex items-center justify-between gap-2 bg-slate-50 border border-[#efe8dd] rounded-lg px-2.5 py-1.5">
                                <div className="flex flex-col min-w-0">
                                    <span className="text-[11px] font-bold text-slate-700 truncate">{s.nombre}</span>
                                    <span className="text-[8px] text-slate-400">
                                        {s.periodicidad ? <span className="capitalize">{s.periodicidad}</span> : 'Mensual'}
                                        {s.primeraFacturacion ? ` · 1ª fact. ${s.primeraFacturacion}` : (s.fechaInicio ? ` · desde ${s.fechaInicio}` : '')}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    {s.precioPactado ? <span className="text-[11px] font-black text-emerald-600">${Number(s.precioPactado).toLocaleString('es-CL')}</span> : <span className="text-[9px] text-slate-400 italic">sin precio</span>}
                                    <button onClick={() => handleRemoveServicio(s)} title="Dar de baja" className="text-slate-400 hover:text-red-500 transition-colors">
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            </div>
                        )) : (
                            <span className="text-[10px] text-slate-400 italic">Sin servicios contratados.</span>
                        )}
                    </div>

                    {/* Servicios suspendidos (con opción de reactivar) */}
                    {serviciosSuspendidos.length > 0 && (
                        <div className="mb-3">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Suspendidos</span>
                            <div className="flex flex-col gap-1.5 mt-2">
                                {serviciosSuspendidos.map(s => (
                                    <div key={s.id} className="flex items-center justify-between gap-2 bg-slate-50 border border-[#efe8dd] rounded-lg px-2.5 py-1.5 opacity-70">
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-[11px] font-bold text-slate-500 line-through truncate">{s.nombre}</span>
                                            {s.fechaTermino && <span className="text-[8px] text-slate-400">Baja: {s.fechaTermino}</span>}
                                        </div>
                                        <button
                                            onClick={() => handleReactivarServicio(s)}
                                            title="Reactivar servicio"
                                            className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-emerald-600 hover:text-emerald-700 border border-emerald-400/30 bg-emerald-400/10 hover:bg-emerald-400/20 px-2 py-0.5 rounded-full transition-colors shrink-0"
                                        >
                                            <RotateCcw size={10} /> Reactivar
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Agregar servicio: catálogo + precio (lista) + periodicidad + 1ª facturación */}
                    <div className="bg-slate-50 border border-[#efe8dd] rounded-lg p-2.5 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <select
                                value={newServicioId}
                                onChange={(e) => setNewServicioId(e.target.value)}
                                className="flex-1 min-w-[120px] bg-white border border-[#efe8dd] rounded-lg p-2 text-xs text-slate-900 outline-none focus:border-indigo-500 cursor-pointer"
                            >
                                <option value="">+ Sumar servicio…</option>
                                {serviciosParaAgregar.map(s => (
                                    <option key={s.id} value={s.id}>{s.nombre}</option>
                                ))}
                            </select>
                            <input
                                type="text"
                                inputMode="numeric"
                                list="precios-sugeridos"
                                value={newServicioPrecio}
                                onChange={(e) => setNewServicioPrecio(formatMiles(e.target.value))}
                                onKeyDown={(e) => { if (e.key === 'Enter' && newServicioId) handleAddServicio(); }}
                                placeholder="Precio"
                                className="w-24 bg-white border border-[#efe8dd] rounded-lg p-2 text-xs text-slate-900 outline-none focus:border-indigo-500 placeholder:text-slate-400"
                            />
                            <datalist id="precios-sugeridos">
                                {preciosSugeridos.map(p => <option key={p} value={Number(p).toLocaleString('es-CL')} />)}
                            </datalist>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <select
                                value={newServicioPeriod}
                                onChange={(e) => setNewServicioPeriod(e.target.value)}
                                title="Periodicidad de facturación"
                                className="flex-1 min-w-[110px] bg-white border border-[#efe8dd] rounded-lg p-2 text-xs text-slate-900 outline-none focus:border-indigo-500 cursor-pointer capitalize"
                            >
                                {['mensual', 'bimensual', 'trimestral', 'cuatrimestral', 'semestral', 'anual'].map(p => (
                                    <option key={p} value={p}>{p}</option>
                                ))}
                            </select>
                            <input
                                type="date"
                                value={newServicioPrimera}
                                onChange={(e) => setNewServicioPrimera(e.target.value)}
                                title="Fecha de la primera facturación"
                                className="flex-1 min-w-[130px] bg-white border border-[#efe8dd] rounded-lg p-2 text-xs text-slate-900 outline-none focus:border-indigo-500"
                            />
                            <Button
                                onClick={handleAddServicio}
                                disabled={isSavingServicio || !newServicioId}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-3 h-9 flex items-center gap-1 text-[10px] font-black uppercase"
                            >
                                <Plus size={14} /> Agregar
                            </Button>
                        </div>
                    </div>

                    {/* Total de honorarios (plan + servicios) */}
                    <div className="mt-3 bg-slate-50 border border-emerald-500/20 rounded-xl p-3">
                        <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                            <span>Honorario plan ({plan})</span>
                            <span className="font-bold text-slate-700">{fmt(netoPlan)}</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1.5">
                            <span>Servicios activos ({serviciosActivos.length})</span>
                            <span className="font-bold text-slate-700">{fmt(totalServicios)}</span>
                        </div>
                        <div className="flex items-center justify-between border-t border-[#efe8dd] pt-1.5">
                            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Total honorarios</span>
                            <div className="text-right">
                                <div className="text-sm font-black text-slate-900">{fmt(totalHonorariosNeto)} <span className="text-[9px] text-slate-400 font-normal">neto</span></div>
                                <div className="text-[9px] text-emerald-600 font-bold">{fmt(totalHonorariosConIva)} c/IVA</div>
                            </div>
                        </div>
                    </div>

                    {/* Sugerido (matriz) vs. configurado (servicios) */}
                    {sugeridoVsCobrado && (
                        <div className="mt-2 bg-slate-50 border border-[#efe8dd] rounded-xl p-3">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Sugerido vs. configurado</span>
                            <div className="flex items-center justify-between mt-1.5 text-[11px]">
                                <div className="flex flex-col">
                                    <span className="text-slate-400 text-[9px]">Sugerido (plan/tramo)</span>
                                    <span className="font-bold text-indigo-300">{fmt(sugeridoVsCobrado.sugerido)}</span>
                                </div>
                                <div className="flex flex-col text-center">
                                    <span className="text-slate-400 text-[9px]">Cobrado (honorario)</span>
                                    <span className="font-bold text-slate-700">{fmt(sugeridoVsCobrado.cobrado)}</span>
                                </div>
                                <div className="flex flex-col text-right">
                                    <span className="text-slate-400 text-[9px]">Diferencia</span>
                                    <span className={`font-black ${sugeridoVsCobrado.dif < 0 ? 'text-red-500' : sugeridoVsCobrado.dif > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                                        {sugeridoVsCobrado.dif > 0 ? '+' : ''}{fmt(sugeridoVsCobrado.dif)}
                                    </span>
                                </div>
                            </div>
                            {sugeridoVsCobrado.dif < 0 && (
                                <p className="text-[9px] text-red-600/80 mt-1.5">⚠️ Se está cobrando menos que el precio sugerido para su facturación.</p>
                            )}
                        </div>
                    )}
                </div>

                {/* 3. OPERACIÓN MENSUAL (FINANZAS) */}
                <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-4">
                    <h3 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-3 flex items-center gap-2">
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
                    <h3 className="text-[10px] font-black text-purple-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <FileSpreadsheet size={14} /> Renta Anual (AT 2026)
                    </h3>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                        <EditableField label="¿Contrató Renta?" name="contratoRenta" value={isEditing ? formData.contratoRenta : contratoRenta} isEditing={isEditing} onChange={handleInputChange} />
                        <EditableField label="Monto Renta" name="montoRenta" value={isEditing ? formData.montoRenta : fmt(montoRenta)} isEditing={isEditing} onChange={handleInputChange} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <EditableField label="Estado Formulario" name="formularioRenta" value={isEditing ? formData.formularioRenta : formularioRenta} isEditing={isEditing} onChange={handleInputChange} />
                        <EditableField label="Renta del mes" name="rentaMarzoNeto" value={isEditing ? formData.rentaMarzoNeto : fmt(rentaMarzoNeto)} isEditing={isEditing} onChange={handleInputChange} />
                    </div>
                </div>

                {/* 5. DIRECCIÓN DEL TRABAJO (DT) */}
                <div className="bg-sky-500/5 border border-sky-500/10 rounded-2xl p-4">
                    <h3 className="text-[10px] font-black text-sky-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <Briefcase size={14} /> Dirección del Trabajo (DT)
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-xl flex flex-col justify-center items-center">
                            <span className="text-[9px] text-red-500 font-bold uppercase tracking-widest mb-1">Trámites Atrasados</span>
                            <span className="text-2xl font-black text-slate-900">{dtAtrasados}</span>
                        </div>
                        <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl flex flex-col justify-center items-center">
                            <span className="text-[9px] text-amber-600 font-bold uppercase tracking-widest mb-1">Pendientes de Firma</span>
                            <span className="text-2xl font-black text-slate-900">{dtPendientesFirma}</span>
                        </div>
                    </div>
                </div>

                {/* 6. BITÁCORA: CONVERSACIONES Y TICKETS */}
                <div className="bg-white border border-[#efe8dd] rounded-2xl p-4">
                    {/* Pestañas */}
                    <div className="flex bg-slate-50 p-1 rounded-xl border border-[#efe8dd] w-full mb-3">
                        <button
                            onClick={() => setBitacoraTab('conversacion')}
                            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${bitacoraTab === 'conversacion' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-900'}`}
                        >
                            <MessageSquare size={13} /> Conversaciones ({conversaciones.length})
                        </button>
                        <button
                            onClick={() => setBitacoraTab('ticket')}
                            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${bitacoraTab === 'ticket' ? 'bg-amber-600 text-white' : 'text-slate-500 hover:text-slate-900'}`}
                        >
                            <Ticket size={13} /> Tickets {ticketsAbiertos > 0 && <span className="bg-red-500/80 text-white px-1.5 rounded-full">{ticketsAbiertos}</span>}
                        </button>
                    </div>

                    {/* Entrada nueva */}
                    <div className="flex gap-2 mb-2">
                        <input
                            type="text"
                            value={newNote}
                            onChange={(e) => setNewNote(e.target.value)}
                            placeholder={bitacoraTab === 'ticket' ? 'Describe el ticket / incidencia...' : 'Escribe una conversación o gestión...'}
                            className="flex-1 bg-slate-50 border border-[#efe8dd] rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:border-emerald-500 transition-colors placeholder:text-slate-400"
                            onKeyDown={(e) => e.key === 'Enter' && addNote()}
                        />
                        <Button onClick={addNote} disabled={isSavingNote || !newNote.trim()} className={`${bitacoraTab === 'ticket' ? 'bg-amber-600 hover:bg-amber-500' : 'bg-emerald-600 hover:bg-emerald-500'} text-white rounded-xl px-4 h-auto`}>
                            <Send size={16} />
                        </Button>
                    </div>

                    {/* Metadatos de ticket para la nueva entrada */}
                    {bitacoraTab === 'ticket' && (
                        <div className="grid grid-cols-3 gap-2 mb-3">
                            <select
                                value={ticketPrioridad}
                                onChange={(e) => setTicketPrioridad(e.target.value)}
                                title="Prioridad"
                                className="bg-slate-50 border border-[#efe8dd] rounded-lg p-2 text-[11px] text-slate-900 outline-none focus:border-amber-500 cursor-pointer"
                            >
                                <option value="Alta">🔴 Alta</option>
                                <option value="Media">🟡 Media</option>
                                <option value="Baja">🟢 Baja</option>
                            </select>
                            <input
                                type="text"
                                value={ticketResponsable}
                                onChange={(e) => setTicketResponsable(e.target.value)}
                                placeholder="Responsable"
                                className="bg-slate-50 border border-[#efe8dd] rounded-lg p-2 text-[11px] text-slate-900 outline-none focus:border-amber-500 placeholder:text-slate-400"
                            />
                            <input
                                type="date"
                                value={ticketVencimiento}
                                onChange={(e) => setTicketVencimiento(e.target.value)}
                                title="Vencimiento"
                                className="bg-slate-50 border border-[#efe8dd] rounded-lg p-2 text-[11px] text-slate-900 outline-none focus:border-amber-500"
                            />
                        </div>
                    )}

                    {/* Buscador en la bitácora */}
                    <div className="relative mb-3">
                        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={bitacoraSearch}
                            onChange={(e) => setBitacoraSearch(e.target.value)}
                            placeholder="Buscar en la bitácora..."
                            className="w-full bg-slate-50 border border-[#efe8dd] rounded-lg pl-8 pr-3 py-1.5 text-[11px] text-slate-900 outline-none focus:border-emerald-500 placeholder:text-slate-400"
                        />
                    </div>

                    {notasVisibles.length > 0 ? (
                        <div className="space-y-3 max-h-56 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/10">
                            {notasVisibles.map((nota, i) => (
                                <div key={nota.id || i} className={`border border-[#efe8dd] rounded-xl p-2.5 ${nota.tipo === 'ticket' && nota.resuelto ? 'opacity-50' : ''} ${nota.tipo === 'ticket' ? 'bg-amber-500/5' : 'bg-slate-50'}`}>
                                    <div className="flex items-center justify-between gap-2 mb-1">
                                        <div className="flex items-center gap-1.5 text-slate-400 min-w-0">
                                            <Clock size={10} className="shrink-0" />
                                            <span className="text-[9px] font-black tracking-widest truncate">{nota.fecha}</span>
                                            {nota.autor && <span className="text-[9px] text-slate-400 truncate">· {nota.autor}</span>}
                                            {nota.editado && <span className="text-[9px] text-slate-400 italic">· editado</span>}
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            {nota.tipo === 'ticket' && (
                                                <button
                                                    onClick={() => handleToggleTicket(nota)}
                                                    title={nota.resuelto ? 'Reabrir ticket' : 'Marcar como resuelto'}
                                                    className={`flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border transition-colors ${nota.resuelto ? 'text-emerald-600 border-emerald-400/30 bg-emerald-400/10' : 'text-amber-600 border-amber-400/30 bg-amber-400/10 hover:bg-amber-400/20'}`}
                                                >
                                                    {nota.resuelto ? <><CheckCircle2 size={10} /> Resuelto</> : <><RotateCcw size={10} /> Abierto</>}
                                                </button>
                                            )}
                                            <button onClick={() => startEditNote(nota)} title="Editar nota" className="p-1 text-slate-400 hover:text-blue-600 transition-colors">
                                                <Edit size={11} />
                                            </button>
                                            <button onClick={() => handleDeleteNote(nota)} title="Eliminar nota" className="p-1 text-slate-400 hover:text-red-500 transition-colors">
                                                <Trash2 size={11} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Badges de ticket (prioridad / responsable / vencimiento) */}
                                    {nota.tipo === 'ticket' && (nota.prioridad || nota.responsable || nota.fechaVencimiento) && (
                                        <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                                            {nota.prioridad && (
                                                <span className={`flex items-center gap-1 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full border ${nota.prioridad === 'Alta' ? 'text-red-600 border-red-400/30 bg-red-400/10' : nota.prioridad === 'Media' ? 'text-amber-700 border-amber-400/30 bg-amber-400/10' : 'text-emerald-700 border-emerald-400/30 bg-emerald-400/10'}`}>
                                                    <Flag size={9} /> {nota.prioridad}
                                                </span>
                                            )}
                                            {nota.responsable && (
                                                <span className="flex items-center gap-1 text-[8px] font-bold text-slate-600 px-1.5 py-0.5 rounded-full border border-[#efe8dd] bg-slate-50">
                                                    <User size={9} /> {nota.responsable}
                                                </span>
                                            )}
                                            {nota.fechaVencimiento && (
                                                <span className="flex items-center gap-1 text-[8px] font-bold text-sky-700 px-1.5 py-0.5 rounded-full border border-sky-400/30 bg-sky-400/10">
                                                    <CalendarClock size={9} /> {nota.fechaVencimiento}
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    {editingNoteId === nota.id ? (
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={editNoteText}
                                                onChange={(e) => setEditNoteText(e.target.value)}
                                                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEditNote(nota); if (e.key === 'Escape') setEditingNoteId(null); }}
                                                autoFocus
                                                className="flex-1 bg-slate-50 border border-blue-500/50 rounded-lg p-1.5 text-xs text-slate-900 outline-none"
                                            />
                                            <button onClick={() => handleSaveEditNote(nota)} className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white"><Save size={12} /></button>
                                            <button onClick={() => setEditingNoteId(null)} className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500"><X size={12} /></button>
                                        </div>
                                    ) : (
                                        <p className="text-xs text-slate-700">{nota.texto}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-xs text-slate-400 italic text-center py-2">
                            {bitacoraSearch ? 'Sin resultados para tu búsqueda.' : (bitacoraTab === 'ticket' ? 'Sin tickets registrados.' : 'Sin conversaciones registradas aún.')}
                        </p>
                    )}
                </div>

                {formData.ultimaModificacion && (
                    <p className="text-[9px] text-slate-400 text-center pt-1">Última modificación: {formData.ultimaModificacion}</p>
                )}

            </div>

            {/* OVERLAY DE CONFIRMACIÓN DE ELIMINACIÓN */}
            <AnimatePresence>
                {confirmDelete && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
                            className="bg-white border border-red-500/30 rounded-2xl p-5 w-full max-w-sm shadow-2xl"
                        >
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center text-red-500 shrink-0">
                                    <AlertTriangle size={20} />
                                </div>
                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Eliminar cliente</h3>
                            </div>
                            <p className="text-xs text-slate-600 leading-relaxed mb-1">
                                Vas a eliminar <span className="font-bold text-slate-900">{razonSocial}</span> de forma <span className="text-red-500 font-bold">permanente</span>.
                            </p>
                            <p className="text-[10px] text-slate-400 mb-4">
                                Se borrarán sus notas, servicios e historial de plan. Esta acción no se puede deshacer.
                            </p>
                            <div className="flex gap-2">
                                <Button variant="ghost" onClick={() => setConfirmDelete(false)} disabled={isDeleting} className="flex-1 uppercase font-black text-[10px] tracking-widest text-slate-500 h-10 rounded-xl bg-slate-50 hover:bg-slate-100">
                                    Cancelar
                                </Button>
                                <Button onClick={handleDelete} disabled={isDeleting} className="flex-1 bg-red-600 hover:bg-red-500 text-white uppercase font-black text-[10px] tracking-widest h-10 rounded-xl flex items-center justify-center gap-2">
                                    <Trash2 size={14} /> {isDeleting ? 'Eliminando…' : 'Sí, eliminar'}
                                </Button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* FOOTER BOTÓN GUARDAR */}
            {isEditing && (
                <div className="p-4 border-t border-[#efe8dd] bg-white flex gap-3 shrink-0 mt-auto">
                    <Button variant="ghost" onClick={() => { setIsEditing(false); setFormData(client); }} className="flex-1 uppercase font-black text-[10px] tracking-widest text-slate-500 h-10 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors">
                        Cancelar
                    </Button>
                    <Button onClick={handleSave} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white uppercase font-black text-[10px] tracking-widest h-10 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-lg shadow-blue-500/20">
                        <Save size={14} /> Guardar Cambios
                    </Button>
                </div>
            )}
        </motion.div>
        </div>
        </>
    );
};

export default ClientDetailDrawer;