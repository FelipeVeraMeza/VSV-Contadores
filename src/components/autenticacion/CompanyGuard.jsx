import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth.jsx';
import { toast } from '@/components/ui/use-toast';
import { useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';

const CompanyGuard = () => {
    const { selectedCompany, user, loading } = useAuth();
    const location = useLocation();
    const hasToasted = useRef(false);

    const isAutoSelecting = user?.assigned_companies?.length > 0 && !selectedCompany;

    useEffect(() => {
        if (!loading && user && !selectedCompany && !isAutoSelecting && !hasToasted.current) {
            toast({
                variant: 'destructive',
                title: 'Selección Requerida',
                description: 'Acceso denegado. Debes seleccionar una empresa para operar en este módulo.',
            });
            hasToasted.current = true;
        }

        return () => { 
            if (selectedCompany) hasToasted.current = false; 
        };
    }, [selectedCompany, user, loading, location.pathname, isAutoSelecting]);

    if (loading) {
        return (
            <div className="h-full w-full flex items-center justify-center p-20">
                <Loader2 className="h-8 w-8 text-emerald-500 animate-spin opacity-20" />
            </div>
        );
    }

    if (isAutoSelecting) {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-slate-950">
                <div className="text-center">
                    <Loader2 className="h-10 w-10 text-emerald-500 animate-spin mx-auto mb-4" />
                    <p className="text-[10px] font-black text-emerald-500/50 uppercase tracking-[0.3em] animate-pulse">
                        Sincronizando Entidad...
                    </p>
                </div>
            </div>
        );
    }
    
    if (!selectedCompany) {
        return <Navigate to="/select-company" replace />;
    }

    return <Outlet />;
};

export default CompanyGuard;