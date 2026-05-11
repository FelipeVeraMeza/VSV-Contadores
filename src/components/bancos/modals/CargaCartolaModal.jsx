import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import { read, utils } from 'xlsx';

// Tu función estandarizadora
const cleanText = (str) => {
    if (str === null || str === undefined) return '';
    return String(str)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .trim();
};

const CargaCartolaModal = ({ isOpen, setIsOpen, onCartolaCargada, isUploading }) => {
    const [file, setFile] = useState(null);
    const [isParsing, setIsParsing] = useState(false);
    const fileInputRef = useRef(null);

    const handleFileChange = (e) => {
        if (e.target.files.length > 0) {
            setFile(e.target.files[0]);
        }
    };

    const handleUpload = () => {
    if (!file) {
        toast({ variant: "destructive", title: "Error", description: "Selecciona el archivo Excel/CSV." });
        return;
    }

    setIsParsing(true);
    const reader = new FileReader();
    
    reader.readAsArrayBuffer(file);

    reader.onload = (event) => {
        try {
            const data = new Uint8Array(event.target.result);
            const workbook = read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            
            const rows = utils.sheet_to_json(sheet, { header: 1 });
            let startIndex = -1;
            
            // 1. Buscador dinámico de encabezados
            for (let i = 0; i < rows.length; i++) {
                if (!rows[i]) continue;
                const filaStr = rows[i].map(String).join(' ').toLowerCase();
                if (filaStr.includes('fecha') && filaStr.includes('movimiento')) {
                    startIndex = i;
                    break;
                }
            }

            if (startIndex === -1) {
                toast({ variant: "destructive", title: "Inválido", description: "No se encontró Fecha y Movimiento." });
                setIsParsing(false);
                return;
            }

            // 2. Mapeo inteligente de columnas
            const rawHeaders = rows[startIndex];
            const columnMap = {};
            rawHeaders.forEach((header, index) => {
                const cleanH = cleanText(header);
                if (cleanH) columnMap[cleanH] = index;
            });

            const movimientosLimpios = [];

            // 3. Procesamiento de filas
            for (let i = startIndex + 1; i < rows.length; i++) {
                const filaRaw = rows[i];
                if (!filaRaw) continue;
                
                const fechaVal = filaRaw[columnMap['FECHA']];
                if (!fechaVal || String(fechaVal).trim() === '' || String(fechaVal).includes('Desde')) continue;

                let fechaISO = String(fechaVal).trim();
                if (fechaISO.includes('-')) {
                    const partes = fechaISO.split('-');
                    if (partes.length === 3) fechaISO = `${partes[2]}-${partes[1]}-${partes[0]}`;
                }

                const parseMonto = (val) => {
                    if (!val) return 0;
                    if (typeof val === 'number') return val;
                    const str = String(val).replace(/\$/g, '').replace(/\./g, '').replace(/,/g, '.').trim();
                    return parseFloat(str) || 0;
                };

                const cargo = parseMonto(filaRaw[columnMap['CARGO']]);
                const abono = parseMonto(filaRaw[columnMap['ABONO']]);
                const saldo = parseMonto(filaRaw[columnMap['SALDO']]);

                if (cargo > 0 || abono > 0) {
                    movimientosLimpios.push({
                        fecha: fechaISO,
                        oficina: cleanText(filaRaw[columnMap['OFICINA']]),
                        descripcion: cleanText(filaRaw[columnMap['MOVIMIENTO']]),
                        documento: String(filaRaw[columnMap['N DOCUMENTO']] || '0').trim(),
                        cargo: cargo,
                        abono: abono,
                        saldo: saldo,
                        banco: 'BCI'
                    });
                }
            }

            // 👀 LOG DE DEPURACIÓN (Míralo en F12)
            console.log("Datos extraídos en React:", movimientosLimpios);

            // 4. ENVÍO AL BACKEND
            if (movimientosLimpios.length > 0) {
                onCartolaCargada(movimientosLimpios); 
                setFile(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
            } else {
                toast({ variant: "destructive", title: "Vacío", description: "No hay movimientos válidos para procesar." });
            }

        } catch (error) {
            console.error("Error al leer el archivo en React:", error);
            toast({ variant: "destructive", title: "Error", description: "El archivo está dañado o tiene un formato no compatible." });
        } finally {
            setIsParsing(false);
        }
    };
};

    const isLoading = isParsing || isUploading;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !isLoading && setIsOpen(open)}>
            <DialogContent className="sm:max-w-[500px] bg-[#0f172a]/95 backdrop-blur-3xl border-white/10 text-white shadow-2xl">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-black uppercase tracking-tighter">Cargar Cartola</DialogTitle>
                    <DialogDescription className="text-gray-400">Sube tu Excel o CSV.</DialogDescription>
                </DialogHeader>
                
                <div className="mt-2 flex justify-center rounded-2xl border border-dashed border-white/20 px-6 py-12 hover:bg-white/[0.02] bg-black/20 cursor-pointer relative">
                    <div className="text-center">
                        <FileSpreadsheet className="mx-auto h-16 w-16 text-blue-400/80 mb-4" />
                        <Input id="cartola-file" type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleFileChange} accept=".csv, .xls, .xlsx" disabled={isLoading} ref={fileInputRef} />
                        <p className="text-sm font-bold text-blue-400">Seleccionar archivo</p>
                        <p className="text-[10px] text-gray-500 mt-2 font-black uppercase tracking-widest">{file ? file.name : 'Click aquí'}</p>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isLoading} className="border-white/10 text-gray-300">Cancelar</Button>
                    <Button onClick={handleUpload} disabled={isLoading || !file} className="bg-blue-600 text-white font-black shadow-lg shadow-blue-500/20">
                        {isLoading ? <><Loader2 className="animate-spin h-4 w-4 mr-2" /> Procesando...</> : 'Guardar Datos'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default CargaCartolaModal;