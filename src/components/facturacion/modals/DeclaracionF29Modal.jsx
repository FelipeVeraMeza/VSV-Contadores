import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Download } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

const DeclaracionF29Modal = ({ isOpen, setIsOpen }) => {
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[700px] bg-slate-50 backdrop-blur-xl border-[#efe8dd] text-slate-700">
        <DialogHeader>
          <DialogTitle className="text-2xl">Propuesta Declaración F29</DialogTitle>
          <DialogDescription>Período Tributario: Mayo 2025</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto p-4 space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-2 text-green-400">Débitos (Ventas)</h3>
            <div className="p-4 bg-slate-50 rounded-lg space-y-2">
                <div className="flex justify-between"><span>[502] Ventas afectas a IVA</span><span>$12,547,890</span></div>
                <div className="flex justify-between font-bold"><span>[503] IVA Débito Fiscal (19%)</span><span>$2,384,100</span></div>
            </div>
          </div>
           <div>
            <h3 className="text-lg font-semibold mb-2 text-red-500">Créditos (Compras)</h3>
            <div className="p-4 bg-slate-50 rounded-lg space-y-2">
                <div className="flex justify-between"><span>[519] Compras afectas a IVA</span><span>$8,234,567</span></div>
                <div className="flex justify-between font-bold"><span>[520] IVA Crédito Fiscal (19%)</span><span>$1,564,568</span></div>
            </div>
          </div>
          <Separator className="bg-slate-200" />
           <div>
            <h3 className="text-lg font-semibold mb-2 text-blue-600">Resumen Impuesto</h3>
            <div className="p-4 bg-slate-50 rounded-lg space-y-2">
                <div className="flex justify-between"><span>[89] IVA a Pagar</span><span>$819,532</span></div>
                <div className="flex justify-between"><span>[537] PPM Pagos Provisionales (1%)</span><span>$125,479</span></div>
                 <Separator className="bg-slate-100 my-2" />
                <div className="flex justify-between text-xl font-bold text-blue-700">
                    <span>[91] TOTAL A PAGAR</span>
                    <span>$945,011</span>
                </div>
            </div>
          </div>
          <p className="text-xs text-center text-slate-500">Esta es una propuesta basada en los DTE del período. Verifique la información antes de declarar.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" className="border-[#efe8dd] text-slate-700 hover:bg-slate-100" onClick={() => toast({title:"Próximamente"})}>
            <Download className="mr-2 h-4 w-4" /> Exportar
          </Button>
          <Button type="button" onClick={() => setIsOpen(false)} className="bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white">Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DeclaracionF29Modal;