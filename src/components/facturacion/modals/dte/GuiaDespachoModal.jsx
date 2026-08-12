import { useMemo, useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import { buildDteJson } from "@/lib/dte/buildDte";
import { API_BASE_URL } from "../../../../../config.js";
import { cleanRut } from "@/lib/rut.js";
// Faltaba este import: sin él la emisión moría con "apiDTE is not defined".
import * as apiDTE from "@/services/apiDTE.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const todayLocalISO = () => {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 10);
};

const DOC_CONFIG = {
  title: "Crear Guía de Despacho",
  description: "Completa los datos para emitir una Guía de Despacho (DTE 52).",
};

const createEmptyItem = () => ({
  name: "Operación Renta",
  cantidad: "1",
  unidad: "UN",
  precio: "123",
  descuento: "",
  traslado: "1",
  fecha: todayLocalISO(),
  metodo: "1",
  descripcion: "",

  transportePatente: "",
  transporteRut: "",
  transporteChofer: "",
  transporteDireccionDestino: ""
});

export default function GuiaDespachoModal({ isOpen, setIsOpen }) {
  const [item, setItem] = useState(createEmptyItem());
  const [ciudad, setCiudad] = useState("");

  const [showTransporte, setShowTransporte] = useState(false);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [downloadInfo, setDownloadInfo] = useState(null);

  const toggleTransporte = () => {
    setShowTransporte((prev) => {
      const next = !prev;

      if (prev === true && next === false) {
        setItem((curr) => ({
          ...curr,
          transportePatente: "",
          transporteRut: "",
          transporteChofer: "",
          transporteRutChofer: "",
        }));
      }

      return next;
    });
  };

  useEffect(() => {
    if (isOpen) {
      const company = JSON.parse(localStorage.getItem("selectedCompany") || "{}");
      setCiudad(company?.ciudad || "");
    }
  }, [isOpen]);

  const { totalNeto, iva, total } = useMemo(() => {
    const neto = Number(item.cantidad || 0) * Number(item.precio || 0);
    const ivaCalc = Math.round(neto * 0.19);
    return { totalNeto: neto, iva: ivaCalc, total: neto + ivaCalc };
  }, [item.cantidad, item.precio]);

  const resetForm = () => {
    setItem(createEmptyItem());
    setShowTransporte(false);
    setIsFinished(false);
    setDownloadInfo(null);
  };

  const validate = () => {
    const errors = [];

    if (!item.name.trim()) errors.push("Nombre del ítem");
    if (Number(item.cantidad) <= 0) errors.push("Cantidad");
    if (Number(item.precio) <= 0) errors.push("Precio");

    const desc = Number(item.descuento);
    if (desc < 0 || desc > 100) {
      errors.push("El descuento debe estar entre 0 y 100%");
    }

    const trasladosValidos = ["1", "2", "3", "4", "5", "6", "7", "8", "9"]; 
    if (!trasladosValidos.includes(String(item.traslado))) {
      errors.push("Forma de traslado");
    }

    if (errors.length > 0) {
      toast({
        variant: "destructive",
        title: "Faltan campos",
        description: `Error en: ${errors.join(", ")}.`,
      });
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);

    try {
      const company = JSON.parse(localStorage.getItem("selectedCompany") || "{}");
      const RUT_RECEPTOR = "78112284-K"; // RUT de Pruebas
      // const RUT_RECEPTOR = company?.rut || "";

      const dteJson = buildDteJson({
        TipoDTE: 52,
        Receptor: {
          RUTRecep: RUT_RECEPTOR,
          RznSocRecep: company?.razon_social,
          CdadRecep: company?.ciudad,
        },
        Detalle: {
          NmbItem: item.name.trim(),
          QtyItem: Number(item.cantidad),
          UniItem: item.unidad.trim(),
          PrcItem: Number(item.precio),
          DescuentoPct: item.descuento || 0,
          Descripcion: item.descripcion,
          Traslado: item.traslado,
          FchEmis: item.fecha
        },

        ...(showTransporte
            ? {
                Transporte: {
                  Patente: item.transportePatente,
                  RUTTrans: item.transporteRut,
                  Chofer: item.transporteChofer,
                  RUTChofer: item.transporteRutChofer,
                },
              }
            : {})
      });

      const res = await apiDTE.emitirDte(dteJson);

      const data = await res.json();

      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || "Error al emitir el documento");
      }

      setDownloadInfo({
        archivo: data.fileName, 
        url: `${API_BASE_URL}${data.downloadUrl}` 
      });

      setIsFinished(true);
      toast({ title: "¡Éxito!", description: "DTE emitido correctamente." });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error de Emisión",
        description: err.message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(val) => { if(!isSubmitting) setIsOpen(val); }}>
      <DialogContent className="sm:max-w-[650px] bg-slate-50 border-[#efe8dd] text-slate-700">
        {(isSubmitting || isFinished) && (
          <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-zinc-950/95 backdrop-blur-sm animate-in fade-in duration-300 pointer-events-auto">
            <div className="flex flex-col items-center gap-6 p-10 text-center w-full max-w-sm">
              
              {isSubmitting ? (
                <>
                  <span className="h-16 w-16 animate-spin rounded-full border-4 border-[#efe8dd] border-t-blue-500" />
                  <h3 className="text-xl font-bold text-slate-900">Firmando con el SII...</h3>
                </>
              ) : (
                <>
                  <div className="h-20 w-20 rounded-full bg-green-500/20 flex items-center justify-center">
                    <svg className="h-10 w-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900 uppercase italic tracking-tighter">¡Guía Emitida!</h3>
                  
                  <div className="flex flex-col gap-3 w-full">
                    <a 
                      href={downloadInfo?.url}
                      download={downloadInfo?.archivo}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center w-full h-12 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white transition-all bg-blue-600 rounded-xl hover:bg-blue-700 active:scale-95 shadow-lg shadow-emerald-900/20 cursor-pointer"
                    >
                      Descargar Guía PDF
                    </a>

                    <Button 
                      variant="ghost" 
                      onClick={() => { resetForm(); setIsOpen(false); }} 
                      className="text-slate-400 font-bold uppercase text-[10px] tracking-widest hover:text-slate-900"
                    >
                      Finalizar Operación
                    </Button>
                  </div>
                </>
              )}
            </div>

            <div className="mt-3">
              <Button
                type="button"
                variant="secondary"
                onClick={toggleTransporte}
                className="w-full md:w-auto"
              >
                {showTransporte ? "Quitar transporte" : "Agregar transporte"}
              </Button>
            </div>

             {showTransporte && (
                <div className="md:col-span-2 mt-2 p-4 bg-slate-50 rounded-lg border border-[#efe8dd] space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4"> 
                    <div className="space-y-2">
                      <Label htmlFor="transporte_rut">RUT Transporte</Label>
                      <Input
                        id="transporte_rut"
                        value={item.transporteRut}
                        onChange={(e) => setItem({ ...item, transporteRut: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="transporte_patente">Patente</Label>
                      <Input
                        id="transporte_patente"
                        value={item.transportePatente}
                        onChange={(e) => setItem({ ...item, transportePatente: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="transporte_dir">RUT Chofer</Label>
                      <Input
                        id="transporte_rut_chofer"
                        value={item.transporteRutChofer}
                        onChange={(e) =>
                          setItem({ ...item, transporteRutChofer: e.target.value })
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="transporte_chofer">Nombre Chofer</Label>
                      <Input
                        id="transporte_chofer"
                        value={item.transporteChofer}
                        onChange={(e) => setItem({ ...item, transporteChofer: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              )}
          </div>
        )}

        <div className="p-6">
          <DialogHeader>
            <DialogTitle>{DOC_CONFIG.title}</DialogTitle>
            <DialogDescription>{DOC_CONFIG.description}</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto p-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2 space-y-2">
                <Label htmlFor="item_name">Nombre del ítem</Label>
                <Input id="item_name" value={item.name} onChange={(e) => setItem({...item, name: e.target.value})} maxLength={80} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="item_cantidad">Cantidad</Label>
                <Input id="item_cantidad" type="number" value={item.cantidad} onChange={(e) => setItem({...item, cantidad: e.target.value})} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="item_unidad">Unidad</Label>
                <Input id="item_unidad" value={item.unidad} onChange={(e) => setItem({...item, unidad: e.target.value})} maxLength={10} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="item_precio">Precio Unitario</Label>
                <Input id="item_precio" type="number" value={item.precio} onChange={(e) => setItem({...item, precio: e.target.value})} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="item_descuento">Descuento (%)</Label>
                <Input 
                  id="item_descuento" 
                  type="number" 
                  min="0" 
                  max="100" 
                  value={item.descuento} 
                  onChange={(e) => setItem({...item, descuento: e.target.value})} 
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="item_fecha">Fecha de Emisión</Label>
                <Input
                  id="item_fecha"
                  type="date"
                  value={item.fecha}
                  onChange={(e) => setItem({ ...item, fecha: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Tipo traslado</Label>
                <Select 
                  value={item.traslado} 
                  onValueChange={(val) => setItem({...item, traslado: val})}
                >
                  <SelectTrigger className="border-[#efe8dd]">
                    <SelectValue placeholder="Seleccione método" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-50 text-slate-700">
                    <SelectItem value="1">Operación constituye venta</SelectItem>
                    <SelectItem value="2">Ventas por efectuar</SelectItem>
                    <SelectItem value="3">Consignaciones</SelectItem>
                    <SelectItem value="4">Entrega gratuita</SelectItem>
                    <SelectItem value="5">Traslados internos</SelectItem>
                    <SelectItem value="6">Otros traslados no venta</SelectItem>
                    <SelectItem value="7">Guía de devolución</SelectItem>
                    <SelectItem value="8">Traslado para exportación (no venta)</SelectItem>
                    <SelectItem value="9">Venta para exportación</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2 space-y-2">
                <Label htmlFor="item_descripcion">Descripción</Label>
                <Input id="item_descripcion" value={item.descripcion} onChange={(e) => setItem({...item, descripcion: e.target.value})} />
              </div>
            </div>

            <div className="mt-3">
              <Button
                type="button"
                variant="secondary"
                onClick={toggleTransporte}
                className="w-full md:w-auto"
              >
                {showTransporte ? "Quitar transporte" : "Agregar transporte"}
              </Button>
            </div>

            {showTransporte && (
              <div className="md:col-span-2 mt-2 p-4 bg-slate-50 rounded-lg border border-[#efe8dd] space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="transporte_rut">RUT Transporte</Label>
                    <Input
                      id="transporte_rut"
                      value={item.transporteRut}
                      onChange={(e) => setItem({ ...item, transporteRut: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="transporte_patente">Patente</Label>
                    <Input
                      id="transporte_patente"
                      value={item.transportePatente}
                      onChange={(e) => setItem({ ...item, transportePatente: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="transporte_dir">RUT Chofer</Label>
                    <Input
                      id="transporte_rut_chofer"
                      value={item.transporteRutChofer}
                      onChange={(e) => setItem({ ...item, transporteRutChofer: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="transporte_chofer">Nombre Chofer</Label>
                    <Input
                      id="transporte_chofer"
                      value={item.transporteChofer}
                      onChange={(e) => setItem({ ...item, transporteChofer: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="p-4 bg-slate-50 rounded-lg border border-[#efe8dd] space-y-1 mt-2">
              <div className="flex justify-between text-sm text-zinc-400">
                <span>Neto:</span>
                <span>${totalNeto.toLocaleString("es-CL")}</span>
              </div>
              <div className="flex justify-between text-xl font-bold pt-2 border-t border-[#efe8dd]">
                <span>Total DTE:</span>
                <span className="text-blue-600">${total.toLocaleString("es-CL")}</span>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>Cancelar</Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700">Emitir Guía</Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}