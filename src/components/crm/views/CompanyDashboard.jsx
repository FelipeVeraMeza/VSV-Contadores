import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { User, Mail, Phone, Building2, Landmark, FileText, Send, Lock, ChevronLeft } from 'lucide-react';
import { SecureField } from '../ui/CrmUI'; // Ajusta la ruta si es necesario
import { toast } from '@/components/ui/use-toast';

// Simulación de API para Bitácora (Reemplazar con tu endpoint real de Supabase)
const mockBitacora = [
  { id: 1, texto: "Se solicitaron las claves del SII actualizadas.", usuario_nombre: "Felipe Vera", created_at: new Date(Date.now() - 86400000).toISOString() },
  { id: 2, texto: "Cliente confirmó pago de honorarios de Febrero.", usuario_nombre: "Felipe Vera", created_at: new Date().toISOString() }
];

const CompanyDashboard = ({ client, onClearSelection }) => {
    const [bitacora, setBitacora] = useState([]);
    const [nuevoMensaje, setNuevoMensaje] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        // Aquí harías tu fetch real: getBitacoraApi(client.id)
        // Por ahora cargamos los datos de prueba
        setBitacora(mockBitacora);
    }, [client.id]);

    const handleEnviarMensaje = async (e) => {
        e.preventDefault();
        if (!nuevoMensaje.trim()) return;

        setIsSubmitting(true);
        try {
            // Aquí iría tu: await addBitacoraEntryApi(client.id, nuevoMensaje)
            const nuevoRegistro = {
                id: Date.now(),
                texto: nuevoMensaje,
                usuario_nombre: "Usuario Actual", 
                created_at: new Date().toISOString()
            };
            setBitacora([nuevoRegistro, ...bitacora]);
            setNuevoMensaje("");
            toast({ title: "Gestión guardada", description: "El registro se añadió a la bitácora." });
        } catch (error) {
            toast({ title: "Error", description: "No se pudo guardar el mensaje.", variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const formatCLP = (val) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(val || 0);

    if (!client) return null;

    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="h-full flex flex-col">
            {/* Barra de regreso rápida */}
            <div className="mb-4">
                <button onClick={onClearSelection} className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors text-xs font-black uppercase tracking-widest bg-slate-50 px-4 py-2 rounded-xl border border-[#efe8dd] hover:bg-slate-100">
                    <ChevronLeft size={14} /> Volver al listado general
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* COLUMNA IZQUIERDA: Paneles de Datos (Ocupa 2 espacios) */}
                <div className="lg:col-span-2 space-y-6">
                    
                    {/* Tarjeta 1: Cabecera Empresa */}
                    <div className="bg-gradient-to-br from-white to-[#f4eee3] p-6 rounded-3xl border border-[#efe8dd] shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-5"><Building2 size={100} /></div>
                        <div className="relative z-10">
                            <h2 className="text-3xl font-black tracking-tighter text-slate-900 uppercase">{client.razon_social}</h2>
                            <div className="flex items-center gap-4 mt-2">
                                <p className="text-blue-600 font-bold tracking-widest text-sm">{client.rut_encrypted}</p>
                                <span className="px-3 py-1 bg-blue-500/20 text-blue-600 text-[10px] font-black uppercase tracking-widest rounded-full border border-blue-500/30">
                                    Plan: {client.plan_nombre || client.plan || 'EMPRENDEDOR'}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Tarjeta 2: Contacto */}
                        <div className="bg-slate-50/60 p-6 rounded-3xl border border-[#efe8dd] space-y-5">
                            <h3 className="text-slate-900 font-black uppercase tracking-widest text-xs flex items-center gap-2 mb-4">
                                <User className="w-4 h-4 text-emerald-600" /> Contacto y Representante
                            </h3>
                            <div>
                                <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Representante Legal</p>
                                <p className="text-sm font-bold text-slate-900 truncate">{client.nombre_rep || client.repNombre || 'No registrado'}</p>
                            </div>
                            <div>
                                <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">RUT Representante</p>
                                <p className="text-sm font-bold text-slate-900">{client.rut_rep_encrypted || client.repRut || 'No registrado'}</p>
                            </div>
                            <div className="pt-2 border-t border-[#efe8dd]">
                                <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest flex items-center gap-1"><Mail className="w-3 h-3"/> Correo</p>
                                <p className="text-xs font-bold text-blue-600 truncate">{client.email_corporativo || 'No registrado'}</p>
                            </div>
                            <div>
                                <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest flex items-center gap-1"><Phone className="w-3 h-3"/> Teléfono / WhatsApp</p>
                                <p className="text-xs font-bold text-slate-900">{client.telefono_corporativo || client.whatsapp || 'No registrado'}</p>
                            </div>
                        </div>

                        {/* Tarjeta 3: Credenciales */}
                        <div className="bg-slate-50/60 p-6 rounded-3xl border border-[#efe8dd] space-y-5">
                            <h3 className="text-slate-900 font-black uppercase tracking-widest text-xs flex items-center gap-2 mb-4">
                                <Lock className="w-4 h-4 text-purple-600" /> Accesos y Credenciales
                            </h3>
                            <div className="space-y-4">
                                <SecureField label="Clave Portal Web" name="claveWeb" value={client.claveWeb || 'No registrada'} />
                                <SecureField label="Clave SII" name="claveSII" value={client.claveSII || 'No registrada'} />
                                <SecureField label="Clave Previred" name="clavePrevired" value={client.clavePrevired || 'No registrada'} />
                            </div>
                        </div>

                        {/* Tarjeta 4: F29 */}
                        <div className="bg-slate-50/60 p-6 rounded-3xl border border-[#efe8dd]">
                            <h3 className="text-slate-900 font-black uppercase tracking-widest text-xs flex items-center gap-2 mb-4">
                                <Building2 className="w-4 h-4 text-orange-400" /> Operación Mensual (F29)
                            </h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-slate-50 p-3 rounded-2xl border border-[#efe8dd] col-span-2 flex justify-between items-center">
                                    <div>
                                        <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Neto a Pagar</p>
                                        <p className={`text-xl font-black ${client.impuesto_pagar > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                                            {formatCLP(client.impuesto_pagar || client.neto)}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Estado</p>
                                        <p className="text-xs font-bold text-slate-900 bg-slate-100 px-2 py-1 rounded mt-1">{client.estado_f29 || client.estadoFormulario || 'PENDIENTE'}</p>
                                    </div>
                                </div>
                                <div>
                                    <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Monto Bruto</p>
                                    <p className="text-xs font-bold text-slate-900">{formatCLP(client.monto_bruto || client.bruto)}</p>
                                </div>
                                <div>
                                    <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">N° Factura</p>
                                    <p className="text-xs font-bold text-slate-900">{client.nro_factura || client.numeroFactura || '-'}</p>
                                </div>
                                <div>
                                    <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Ventas</p>
                                    <p className="text-xs font-bold text-slate-900">{formatCLP(client.ventas_mensuales || client.ventas)}</p>
                                </div>
                                <div>
                                    <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Compras</p>
                                    <p className="text-xs font-bold text-slate-900">{formatCLP(client.compras_mensuales || client.compras)}</p>
                                </div>
                            </div>
                        </div>

                        {/* Tarjeta 5: Renta */}
                        <div className="bg-gradient-to-br from-blue-900/20 to-purple-900/20 p-6 rounded-3xl border border-blue-500/20">
                            <h3 className="text-slate-900 font-black uppercase tracking-widest text-xs flex items-center gap-2 mb-4">
                                <Landmark className="w-4 h-4 text-blue-600" /> Renta Anual (AT 2026)
                            </h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">¿Contrató Renta?</p>
                                    <p className={`text-sm font-black ${client.contrato_renta || client.contratoRenta ? 'text-emerald-600' : 'text-red-500'}`}>
                                        {(client.contrato_renta || client.contratoRenta) ? 'SÍ' : 'NO'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Estado</p>
                                    <p className="text-xs font-bold text-slate-900">{client.estado_formulario_renta || client.formularioRenta || 'PENDIENTE'}</p>
                                </div>
                                <div>
                                    <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Renta Marzo Neto</p>
                                    <p className="text-xs font-bold text-slate-900">{formatCLP(client.renta_marzo_neto || client.rentaMarzoNeto)}</p>
                                </div>
                                <div>
                                    <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Impuesto a Pagar</p>
                                    <p className="text-xs font-bold text-red-500">{formatCLP(client.monto_renta || client.renta)}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* COLUMNA DERECHA: Bitácora (Chat) */}
                <div className="bg-slate-50/80 rounded-3xl border border-[#efe8dd] flex flex-col h-[800px] shadow-2xl relative overflow-hidden">
                    <div className="p-6 border-b border-[#efe8dd] bg-slate-50 backdrop-blur-xl z-10">
                        <h3 className="text-slate-900 font-black uppercase tracking-widest text-sm flex items-center gap-2">
                            <FileText className="w-5 h-5 text-blue-600" /> Bitácora de Gestión
                        </h3>
                        <p className="text-[10px] text-slate-500 mt-1">Historial directo con {client.razon_social}</p>
                    </div>
                    
                    {/* Historial de Mensajes (Scrollable) */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-4 scroll-smooth">
                        {bitacora.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-500">
                                <FileText size={40} className="mb-2 opacity-20" />
                                <p className="text-xs font-black uppercase tracking-widest">Sin gestiones registradas</p>
                            </div>
                        ) : (
                            bitacora.map((msg) => (
                                <motion.div 
                                    initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} 
                                    key={msg.id} 
                                    className="bg-slate-50 p-4 rounded-2xl border border-[#efe8dd] hover:bg-slate-100 transition-colors"
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">{msg.usuario_nombre}</span>
                                        <span className="text-[9px] text-slate-500 font-mono">{new Date(msg.created_at).toLocaleDateString('es-CL')}</span>
                                    </div>
                                    <p className="text-sm text-slate-600 leading-relaxed">{msg.texto}</p>
                                </motion.div>
                            ))
                        )}
                    </div>

                    {/* Input de Mensaje */}
                    <div className="p-4 border-t border-[#efe8dd] bg-slate-50 backdrop-blur-xl z-10">
                        <form onSubmit={handleEnviarMensaje} className="flex gap-2">
                            <input 
                                type="text" 
                                value={nuevoMensaje}
                                onChange={(e) => setNuevoMensaje(e.target.value)}
                                placeholder="Escribe una nueva gestión aquí..." 
                                className="flex-1 bg-slate-50 border border-[#efe8dd] rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-slate-500"
                                disabled={isSubmitting}
                            />
                            <button 
                                type="submit" 
                                disabled={isSubmitting || !nuevoMensaje.trim()}
                                className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-200 disabled:text-slate-500 text-white p-3 rounded-xl transition-all shadow-lg hover:shadow-blue-500/20 flex items-center justify-center w-12"
                            >
                                <Send size={18} className={nuevoMensaje.trim() ? "translate-x-0.5 -translate-y-0.5" : ""} />
                            </button>
                        </form>
                    </div>
                </div>

            </div>
        </motion.div>
    );
};

export default CompanyDashboard;