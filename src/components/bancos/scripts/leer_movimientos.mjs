import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import xlsx from 'xlsx';

// Resolución dinámica de rutas para módulos ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Estandarización de texto: Mayúsculas y sin tildes/acentos
const cleanText = (str) => {
    if (str === null || str === undefined) return '';
    return String(str)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .trim();
};

function mostrarTabla(nombreArchivo) {
    try {
        const rutaArchivo = join(__dirname, nombreArchivo);
        
        // 1. Leer el archivo directamente usando la librería xlsx (interpreta el binario nativo)
        const workbook = xlsx.readFile(rutaArchivo);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        // 2. Convertir la hoja a una matriz (arreglo de arreglos)
        const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        
        let startIndex = -1;
        
        // 3. Buscar dinámicamente en qué fila empiezan los encabezados
        for (let i = 0; i < rows.length; i++) {
            if (!rows[i]) continue;
            // Unimos la fila en un solo string para buscar coincidencias
            const filaStr = rows[i].map(String).join(' ').toLowerCase();
            if (filaStr.includes('fecha') && filaStr.includes('movimiento')) {
                startIndex = i;
                break;
            }
        }

        if (startIndex === -1) {
            console.error('No se encontraron los encabezados (Fecha, Movimiento) en el archivo.');
            return;
        }

        // 4. Mapear los índices reales de las columnas 
        // Esto evita errores de desplazamiento si el banco añade columnas vacías a la izquierda
        const rawHeaders = rows[startIndex];
        const columnMap = {};
        
        rawHeaders.forEach((header, index) => {
            const cleanH = cleanText(header);
            if (cleanH) {
                columnMap[cleanH] = index; // Se guarda la posición (Ej: 'FECHA' está en la columna 1)
            }
        });

        const movimientos = [];

        // 5. Parsear cada transacción
        for (let i = startIndex + 1; i < rows.length; i++) {
            const filaRaw = rows[i];
            if (!filaRaw) continue;
            
            // Si la celda de Fecha está vacía, ignoramos la fila (evita leer el pie de página del banco)
            const fechaVal = filaRaw[columnMap['FECHA']];
            if (!fechaVal || String(fechaVal).trim() === '') continue;

            const fila = {};
            
            // Asignamos según el mapa dinámico
            fila['FECHA'] = cleanText(filaRaw[columnMap['FECHA']]);
            fila['OFICINA'] = cleanText(filaRaw[columnMap['OFICINA']]);
            fila['MOVIMIENTO'] = cleanText(filaRaw[columnMap['MOVIMIENTO']]);
            fila['N DOCUMENTO'] = cleanText(filaRaw[columnMap['N DOCUMENTO']]);
            
            // Convertimos los valores a numéricos flotantes
            fila['CARGO'] = parseFloat(filaRaw[columnMap['CARGO']]) || 0;
            fila['ABONO'] = parseFloat(filaRaw[columnMap['ABONO']]) || 0;
            fila['SALDO'] = parseFloat(filaRaw[columnMap['SALDO']]) || 0;

            movimientos.push(fila);
        }

        // 6. Imprimir resultado en consola
        if (movimientos.length > 0) {
            console.table(movimientos);
            console.log(`\n✅ Se procesaron correctamente ${movimientos.length} movimientos.`);
        } else {
            console.log('Se leyó la tabla, pero no se encontraron transacciones válidas.');
        }

    } catch (error) {
        console.error('ERROR AL PROCESAR EL ARCHIVO:', error.message);
    }
}

// Ejecución
mostrarTabla('Movimientos_Historicos (2).xls');