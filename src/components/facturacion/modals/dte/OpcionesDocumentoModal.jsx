import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { 
  Ban, Edit3, TrendingDown, TrendingUp, Copy, Activity, AlertTriangle, FileText, ChevronRight 
} from "lucide-react";

export default function OpcionesDocumentoModal({ isOpen, setIsOpen, documento, onEmitirNota }) {
  if (!documento) return null;

  const NOMBRES_DTE = { 33: "Factura Electrónica", 34: "Factura Exenta", 39: "Boleta", 52: "Guía de Despacho", 56: "Nota de Débito", 61: "Nota de Crédito" };
  const nombreDte = NOMBRES_DTE[documento.tipo_dte] || `Documento ${documento.tipo_dte}`;

  // ========================================================
  // MAPEO EXACTO DE LAS OPCIONES DEL SII
  // ========================================================
  const OPCIONES = [
    {
      id: 'seguimiento',
      title: 'Seguimiento',
      desc: 'Revisar eventos y anotaciones del documento.',
      icon: Activity, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', hover: 'hover:bg-emerald-500/20 hover:border-emerald-500/40',
      action: () => toast({ title: "En construcción", description: "Módulo de seguimiento en desarrollo." })
    },
    {
      id: 'copiar',
      title: 'Copiar Documento',
      desc: 'Generar un nuevo documento basándose en este.',
      icon: Copy, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', hover: 'hover:bg-blue-500/20 hover:border-blue-500/40',
      action: () => toast({ title: "En construcción", description: "Módulo de duplicación en desarrollo." })
    },
    {
      id: 'nc_anula',
      title: 'Generar Nota de Crédito de Anulación',
      desc: 'Generar una Nota de Crédito para Anular este documento.',
      icon: Ban, color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20', hover: 'hover:bg-rose-500/20 hover:border-rose-500/40',
      action: () => { setIsOpen(false); onEmitirNota(documento, '61', '1', 'Anula Documento'); }
    },
    {
      id: 'nc_monto',
      title: 'Generar Nota de Crédito para Corregir Montos',
      desc: 'Generar una Nota de Crédito para Corregir los montos o cantidades.',
      icon: TrendingDown, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20', hover: 'hover:bg-purple-500/20 hover:border-purple-500/40',
      action: () => { setIsOpen(false); onEmitirNota(documento, '61', '3', 'Corrige Montos'); }
    },
    {
      id: 'nc_texto',
      title: 'Generar Nota de Crédito para Corregir Texto',
      desc: 'Generar una Nota de Crédito para Corregir el Giro o Dirección.',
      icon: Edit3, color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20', hover: 'hover:bg-indigo-500/20 hover:border-indigo-500/40',
      action: () => { setIsOpen(false); onEmitirNota(documento, '61', '2', 'Corrige Textos'); }
    },
    {
      id: 'nd_monto',
      title: 'Generar Nota de Débito para Corregir Montos',
      desc: 'Generar una Nota de Débito para Corregir los montos o cantidades.',
      icon: TrendingUp, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', hover: 'hover:bg-amber-500/20 hover:border-amber-500/40',
      action: () => { setIsOpen(false); onEmitirNota(documento, '56', '3', 'Aumenta Valor'); }
    },
    {
      id: 'reparos',
      title: 'Reparos',
      desc: 'Revisar reparos y observaciones del SII al documento.',
      icon: AlertTriangle, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', hover: 'hover:bg-orange-500/20 hover:border-orange-500/40',
      action: () => toast({ title: "Sin Reparos", description: "Este documento no presenta reparos en el SII." })
    }
  ];

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[700px] bg-[#0a0a0a] border-white/10 text-white p-0 shadow-2xl overflow-hidden">
        
        {/* CABECERA DEL DOCUMENTO */}
        <div className="p-8 pb-6 border-b border-white/5 bg-white/[0.02]">
          <DialogHeader>
            <div className="flex items-center gap-4">
              <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                <FileText className="text-gray-300" size={28} />
              </div>
              <div>
                <DialogTitle className="text-2xl font-black uppercase tracking-tighter">
                  Opciones del Documento
                </DialogTitle>
                <DialogDescription className="text-gray-400 text-xs font-mono mt-1">
                  {nombreDte} • Folio N° <span className="text-white font-bold">{documento.folio}</span>
                </DialogDescription>
                <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest mt-2">
                  Receptor: <span className="text-gray-300">{documento.razon_social || documento.razon_social_proveedor}</span>
                </p>
              </div>
            </div>
          </DialogHeader>
        </div>

        {/* LISTA DE ACCIONES */}
        <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar space-y-3">
          {OPCIONES.map((opcion) => {
            const Icon = opcion.icon;
            return (
              <button
                key={opcion.id}
                onClick={opcion.action}
                className={`w-full flex items-start gap-4 p-4 rounded-xl border border-white/5 bg-black/40 text-left transition-all duration-300 group ${opcion.hover}`}
              >
                <div className={`p-3 rounded-xl border ${opcion.bg} ${opcion.border} flex-shrink-0 transition-colors`}>
                  <Icon className={`${opcion.color}`} size={20} />
                </div>
                <div className="flex-1 pt-0.5">
                  <h4 className="text-sm font-bold text-white group-hover:text-gray-200 transition-colors">{opcion.title}</h4>
                  <p className="text-[11px] text-gray-500 mt-1 font-medium leading-relaxed">{opcion.desc}</p>
                </div>
                <div className="pt-2">
                  <ChevronRight className="text-gray-600 group-hover:text-white transition-colors" size={18} />
                </div>
              </button>
            );
          })}
        </div>

        <div className="p-4 border-t border-white/5 bg-black/40">
          <Button onClick={() => setIsOpen(false)} variant="ghost" className="w-full text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-white hover:bg-white/5 h-12 rounded-xl">
            Cerrar Panel
          </Button>
        </div>

      </DialogContent>
    </Dialog>
  );
}