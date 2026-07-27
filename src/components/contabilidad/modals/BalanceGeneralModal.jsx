import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Download } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

const BalanceGeneralModal = ({ isOpen, setIsOpen }) => {
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[800px] bg-slate-50 backdrop-blur-xl border-[#efe8dd] text-slate-700">
        <DialogHeader>
          <DialogTitle className="text-2xl">Balance General</DialogTitle>
          <DialogDescription>Al 20 de junio de 2025</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-8 max-h-[60vh] overflow-y-auto p-4">
          <div>
            <h3 className="text-lg font-semibold mb-2 text-green-400">Activos</h3>
            <Separator className="bg-slate-200 mb-4" />
            <div className="space-y-2">
              <p className="font-medium">Activo Corriente</p>
              <div className="pl-4 space-y-1 text-sm">
                <div className="flex justify-between"><span>Caja</span><span>$500,000</span></div>
                <div className="flex justify-between"><span>Banco Estado</span><span>$15,890,000</span></div>
                <div className="flex justify-between"><span>Clientes</span><span>$8,750,000</span></div>
              </div>
              <Separator className="bg-slate-100 my-2" />
              <div className="flex justify-between font-bold text-green-300">
                <span>Total Activo Corriente</span>
                <span>$25,140,000</span>
              </div>
            </div>
            <div className="space-y-2 mt-4">
              <p className="font-medium">Activo No Corriente</p>
              <div className="pl-4 space-y-1 text-sm">
                <div className="flex justify-between"><span>Maquinaria</span><span>$12,000,000</span></div>
                <div className="flex justify-between"><span>Vehículos</span><span>$8,000,000</span></div>
              </div>
              <Separator className="bg-slate-100 my-2" />
              <div className="flex justify-between font-bold text-green-300">
                <span>Total Activo No Corriente</span>
                <span>$20,000,000</span>
              </div>
            </div>
             <Separator className="bg-slate-200 my-4" />
             <div className="flex justify-between font-bold text-xl text-green-200">
                <span>TOTAL ACTIVOS</span>
                <span>$45,140,000</span>
            </div>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-2 text-red-500">Pasivos</h3>
            <Separator className="bg-slate-200 mb-4" />
            <div className="space-y-2">
              <p className="font-medium">Pasivo Corriente</p>
              <div className="pl-4 space-y-1 text-sm">
                <div className="flex justify-between"><span>Proveedores</span><span>$3,200,000</span></div>
                <div className="flex justify-between"><span>Préstamo Bancario</span><span>$5,000,000</span></div>
              </div>
              <Separator className="bg-slate-100 my-2" />
              <div className="flex justify-between font-bold text-red-600">
                <span>Total Pasivo Corriente</span>
                <span>$8,200,000</span>
              </div>
            </div>
             <div className="space-y-2 mt-4">
              <p className="font-medium">Pasivo No Corriente</p>
              <div className="pl-4 space-y-1 text-sm">
                <div className="flex justify-between"><span>Préstamo Bancario LP</span><span>$10,000,000</span></div>
              </div>
              <Separator className="bg-slate-100 my-2" />
              <div className="flex justify-between font-bold text-red-600">
                <span>Total Pasivo No Corriente</span>
                <span>$10,000,000</span>
              </div>
            </div>
            <h3 className="text-lg font-semibold mt-6 mb-2 text-blue-600">Patrimonio</h3>
            <Separator className="bg-slate-200 mb-4" />
            <div className="space-y-2">
                <div className="flex justify-between"><span>Capital</span><span>$25,000,000</span></div>
                <div className="flex justify-between"><span>Utilidades Retenidas</span><span>$1,940,000</span></div>
            </div>
            <Separator className="bg-slate-200 my-4" />
            <div className="flex justify-between font-bold text-xl text-red-200">
                <span>TOTAL PASIVO + PATRIMONIO</span>
                <span>$45,140,000</span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button 
            variant="outline"
            className="border-[#efe8dd] text-slate-700 hover:bg-slate-100"
            onClick={() => toast({ title: "Funcionalidad en desarrollo", description: "La descarga de reportes estará disponible pronto."})}
          >
            <Download className="mr-2 h-4 w-4" /> Exportar PDF
          </Button>
          <Button type="button" onClick={() => setIsOpen(false)} className="bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white">Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BalanceGeneralModal;