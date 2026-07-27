import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

// Evita que un error de render tumbe todo el CRM: muestra un fallback con opción de reintentar.
class CrmErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, info) {
        console.error('❌ Error en el CRM:', error, info);
    }

    handleReset = () => this.setState({ hasError: false, error: null });

    render() {
        if (this.state.hasError) {
            return (
                <div className="h-full flex flex-col items-center justify-center text-center gap-4 p-8">
                    <div className="w-14 h-14 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400">
                        <AlertTriangle size={26} />
                    </div>
                    <div>
                        <h2 className="text-slate-900 font-black text-lg">Algo salió mal en el CRM</h2>
                        <p className="text-slate-500 text-sm mt-1 max-w-md">
                            Ocurrió un error al mostrar esta sección. Puedes reintentar o recargar la página.
                        </p>
                        {this.state.error?.message && (
                            <p className="text-[10px] text-slate-400 mt-2 font-mono break-all max-w-md">{this.state.error.message}</p>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <button onClick={this.handleReset} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors">
                            <RotateCcw size={14} /> Reintentar
                        </button>
                        <button onClick={() => window.location.reload()} className="bg-slate-50 hover:bg-slate-100 text-slate-600 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors">
                            Recargar página
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

export default CrmErrorBoundary;
