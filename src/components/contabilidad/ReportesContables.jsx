import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, TrendingUp, CreditCard, FileText, Calculator, Building2 } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import BalanceGeneralModal from './modals/BalanceGeneralModal';

const reportes = [
    { name: 'Balance de 8 Columnas', icon: BarChart3, color: 'from-blue-500 to-cyan-600' },
    { name: 'Estado de Resultados', icon: TrendingUp, color: 'from-green-500 to-emerald-600' },
    { name: 'Flujo de Efectivo', icon: CreditCard, color: 'from-purple-500 to-violet-600' },
    { name: 'Libro Diario', icon: FileText, color: 'from-orange-500 to-red-600' },
    { name: 'Libro Mayor', icon: Calculator, color: 'from-pink-500 to-rose-600' },
    { name: 'Balance General', icon: Building2, color: 'from-indigo-500 to-blue-600', action: 'balanceGeneral' }
];

const ReportesContables = ({ empresaId }) => {
    const [isBalanceModalOpen, setIsBalanceModalOpen] = useState(false);

    const handleReportClick = (action) => {
        if (action === 'balanceGeneral') {
            setIsBalanceModalOpen(true);
        } else {
            toast({
                title: "Reporte en Desarrollo",
                description: "Este reporte estará disponible próximamente en el búnker.",
            });
        }
    };

    return (
        <>
            <BalanceGeneralModal 
                isOpen={isBalanceModalOpen} 
                setIsOpen={setIsBalanceModalOpen} 
                empresaId={empresaId}
            />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            >
                {reportes.map((reporte, index) => {
                    const Icon = reporte.icon;
                    return (
                        <motion.div
                            key={reporte.name}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, delay: index * 0.1 }}
                            className="bg-slate-50 rounded-xl p-6 hover:bg-slate-100 transition-colors cursor-pointer border border-[#efe8dd] hover:border-blue-500/30 group"
                            onClick={() => handleReportClick(reporte.action)}
                        >
                            <div className={`w-12 h-12 bg-gradient-to-r ${reporte.color} rounded-xl flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform`}>
                                <Icon className="h-6 w-6 text-white" />
                            </div>
                            <h3 className="text-slate-900 font-black uppercase italic text-sm tracking-tight">{reporte.name}</h3>
                            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-1">Generar reporte búnker</p>
                        </motion.div>
                    );
                })}
            </motion.div>
        </>
    );
};

export default ReportesContables;