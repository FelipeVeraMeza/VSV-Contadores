import { useNavigate } from 'react-router-dom';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Building2, User, Edit, DollarSign, Briefcase, FileSpreadsheet, Key, Send, Save, Clock, AlertTriangle, CheckCircle2, Landmark, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { EditableField, SecureField } from '../ui/CrmUI';
import { createNotaApi } from '@/services/crmService';

import { useAuth } from '@/hooks/useAuth'; 

const ClientDetailDrawer = ({ client, onClose, onUpdateClient }) => {
    const navigate = useNavigate(); 
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState(client);
    const [newNote, setNewNote] = useState('');
    const [isSavingNote, setIsSavingNote] = useState(false);

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
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            const sessionId = user.sessionId;
            
            const response = await createNotaApi(sessionId, formData.id, newNote);
            const payload = await response.json();
            
            if(payload.success) {
                setFormData(prev => ({
                    ...prev,
                    notas: [payload.nota, ...(prev.notas || [])]
                }));
                setNewNote('');
                toast({ title: "Nota agregada", description: "La gestión se guardó correctamente" });
            } else {
                throw new Error(payload.message);
            }
        } catch (error) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        } finally {
            setIsSavingNote(false);
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

                {/* 6. BITÁCORA DE GESTIÓN */}
                <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4">
                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <Clock size={14} /> Bitácora de Gestión
                    </h3>
                    
                    <div className="flex gap-2 mb-4">
                        <input 
                            type="text" 
                            value={newNote} 
                            onChange={(e) => setNewNote(e.target.value)} 
                            placeholder="Escribe una nueva gestión aquí..." 
                            className="flex-1 bg-black/40 border border-white/10 rounded-xl p-2.5 text-xs text-white outline-none focus:border-blue-500 transition-colors placeholder:text-gray-600"
                            onKeyDown={(e) => e.key === 'Enter' && addNote()}
                        />
                        <Button onClick={addNote} disabled={isSavingNote || !newNote.trim()} className="bg-blue-600 hover:bg-blue-500 text-white rounded-xl px-4 h-auto">
                            <Send size={16} />
                        </Button>
                    </div>

                    {formData.notas && formData.notas.length > 0 ? (
                        <div className="space-y-3 max-h-40 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/10">
                            {formData.notas.map((nota, i) => (
                                <div key={i} className="border-b border-white/5 pb-2 last:border-0 last:pb-0">
                                    <div className="flex items-center gap-1.5 mb-1 text-gray-500">
                                        <Clock size={10} /> <span className="text-[9px] font-black tracking-widest">{nota.fecha}</span>
                                    </div>
                                    <p className="text-xs text-gray-200">{nota.texto}</p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-xs text-gray-500 italic text-center py-2">Sin gestiones registradas aún.</p>
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