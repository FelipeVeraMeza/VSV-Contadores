import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Datos de la empresa (según tus documentos)
const empresa = {
    nombre: "VOLLAIRE & OLIVOS SIMPLE PYME LTDA",
    rut: "78.306.207-0",
    direccion: "PADRE MARIANO 103, OF 201, PROVIDENCIA",
    representante: "DIDIANNE GRACE VOLLAIRE AGUILERA",
    representanteRut: "11.030.124-3"
};

/**
 * VALORES CONSOLIDADOS REALES (Noviembre + Diciembre 2025)
 * Basado estrictamente en tus logs de Libro Mayor y Estado de Resultados.
 * Cuadratura verificada: Sumas $15.254.699 | Utilidad $12.020.786
 */
const cuentas = [
    { cod: "1101-02", nombre: "BANCO BCI", d: 666400, c: 0, sd: 666400, sa: 0, act: 666400, pas: 0, per: 0, gan: 0 },
    { cod: "1104-01", nombre: "DEUDORES CLIENTES", d: 14446520, c: 666400, sd: 13780120, sa: 0, act: 13780120, pas: 0, per: 0, gan: 0 },
    { cod: "1108-02", nombre: "IVA CREDITO FISCAL", d: 22639, c: 0, sd: 22639, sa: 0, act: 22639, pas: 0, per: 0, gan: 0 },
    { cod: "2108-02", nombre: "IVA DEBITO FISCAL", d: 0, c: 2306594, sd: 0, sa: 2306594, act: 0, pas: 2306594, per: 0, gan: 0 },
    { cod: "2116-01", nombre: "FACTURAS POR PAGAR", d: 0, c: 141779, sd: 0, sa: 141779, act: 0, pas: 141779, per: 0, gan: 0 },
    { cod: "4201-08", nombre: "GASTOS GENERALES", d: 119140, c: 0, sd: 119140, sa: 0, act: 0, pas: 0, per: 119140, gan: 0 },
    { cod: "5101-01", nombre: "VENTAS", d: 0, c: 12139926, sd: 0, sa: 12139926, act: 0, pas: 0, per: 0, gan: 12139926 }
];

const doc = new PDFDocument({ layout: 'landscape', size: 'LETTER', margin: 40 });
const filename = path.join(__dirname, 'Balance_General.pdf');
doc.pipe(fs.createWriteStream(filename));

// --- ENCABEZADO ---
doc.font('Helvetica-Bold').fontSize(9).text(empresa.rut + " " + empresa.nombre);
doc.font('Helvetica').text(empresa.direccion);
doc.text("Representante Legal: " + empresa.representanteRut + " " + empresa.representante);
doc.moveDown(1);

doc.font('Helvetica-Bold').fontSize(14).text('BALANCE GENERAL', { align: 'center' });
doc.fontSize(10).text('PERIODO: NOVIEMBRE - DICIEMBRE 2025', { align: 'center' });
doc.moveDown(2);

// --- TABLA ---
const tableTop = doc.y;
const colX = [40, 220, 290, 360, 430, 500, 570, 640, 710];
const colWidths = [180, 70, 70, 70, 70, 70, 70, 70, 70];

// Dibujar encabezados superiores agrupados
doc.rect(colX[1], tableTop, 140, 15).stroke();
doc.font('Helvetica-Bold').fontSize(8).text("SUMAS", colX[1], tableTop + 4, { width: 140, align: 'center' });

doc.rect(colX[3], tableTop, 140, 15).stroke();
doc.text("SALDOS", colX[3], tableTop + 4, { width: 140, align: 'center' });

doc.rect(colX[5], tableTop, 140, 15).stroke();
doc.text("INVENTARIO", colX[5], tableTop + 4, { width: 140, align: 'center' });

doc.rect(colX[7], tableTop, 140, 15).stroke();
doc.text("RESULTADO", colX[7], tableTop + 4, { width: 140, align: 'center' });

// Dibujar sub-encabezados
const subHeaderTop = tableTop + 15;
const headers = ["Cuenta", "Debitos", "Creditos", "Deudor", "Acreedor", "Activo", "Pasivo", "Perdidas", "Ganancias"];
headers.forEach((h, i) => {
    doc.rect(colX[i], subHeaderTop, colWidths[i], 15).stroke();
    doc.text(h, colX[i] + 2, subHeaderTop + 4, { width: colWidths[i] - 4, align: i === 0 ? 'left' : 'right' });
});

// --- DATOS ---
let currentY = subHeaderTop + 15;
let totales = Array(8).fill(0);

cuentas.forEach((c, idx) => {
    doc.font('Helvetica').fontSize(8);
    // Zebra striping
    if (idx % 2 === 0) {
        doc.rect(colX[0], currentY, 740, 15).fill('#f9f9f9').stroke('#eee');
        doc.fill('#000');
    } else {
        doc.rect(colX[0], currentY, 740, 15).stroke('#eee');
    }

    const row = [c.cod + " " + c.nombre, c.d, c.c, c.sd, c.sa, c.act, c.pas, c.per, c.gan];
    row.forEach((val, i) => {
        const text = i === 0 ? val : (val === 0 ? "" : val.toLocaleString('es-CL'));
        doc.text(text, colX[i] + 2, currentY + 4, { width: colWidths[i] - 4, align: i === 0 ? 'left' : 'right' });
        if (i > 0) totales[i - 1] += val;
    });
    currentY += 15;
});

// --- TOTALES Y UTILIDAD ---
const utilidadResultado = totales[7] - totales[6];
const utilidadPatrimonial = totales[4] - totales[5];

doc.font('Helvetica-Bold');
doc.rect(colX[0], currentY, 740, 15).fill('#f0f0f0').stroke();
doc.fill('#000').text("TOTALES", colX[0] + 2, currentY + 4);
totales.forEach((t, i) => {
    doc.text(t.toLocaleString('es-CL'), colX[i + 1] + 2, currentY + 4, { width: colWidths[i + 1] - 4, align: 'right' });
});

currentY += 15;
doc.rect(colX[0], currentY, 740, 15).stroke();
doc.text("UTILIDAD DEL EJERCICIO", colX[0] + 2, currentY + 4);
doc.text(utilidadPatrimonial.toLocaleString('es-CL'), colX[6] + 2, currentY + 4, { width: colWidths[6] - 4, align: 'right' });
doc.text(utilidadResultado.toLocaleString('es-CL'), colX[7] + 2, currentY + 4, { width: colWidths[7] - 4, align: 'right' });

// Totales de cierre
currentY += 15;
doc.rect(colX[0], currentY, 740, 15).fill('#e0e0e0').stroke();
doc.fill('#000').text("TOTALES IGUALES", colX[0] + 2, currentY + 4);
doc.text(totales[0].toLocaleString('es-CL'), colX[1] + 2, currentY + 4, { width: colWidths[1] - 4, align: 'right' });
doc.text(totales[1].toLocaleString('es-CL'), colX[2] + 2, currentY + 4, { width: colWidths[2] - 4, align: 'right' });
doc.text(totales[2].toLocaleString('es-CL'), colX[3] + 2, currentY + 4, { width: colWidths[3] - 4, align: 'right' });
doc.text(totales[3].toLocaleString('es-CL'), colX[4] + 2, currentY + 4, { width: colWidths[4] - 4, align: 'right' });

// Inventario cuadrado
doc.text((totales[4]).toLocaleString('es-CL'), colX[5] + 2, currentY + 4, { width: colWidths[5] - 4, align: 'right' });
doc.text((totales[5] + utilidadPatrimonial).toLocaleString('es-CL'), colX[6] + 2, currentY + 4, { width: colWidths[6] - 4, align: 'right' });

// Resultado cuadrado
doc.text((totales[6] + utilidadResultado).toLocaleString('es-CL'), colX[7] + 2, currentY + 4, { width: colWidths[7] - 4, align: 'right' });
doc.text((totales[7]).toLocaleString('es-CL'), colX[8] + 2, currentY + 4, { width: colWidths[8] - 4, align: 'right' });

// --- DECLARACIÓN Y FIRMAS ---
currentY += 40;

// Texto de declaración
doc.font('Helvetica-Oblique').fontSize(8);
const declaracion = "Declaro(mos) dejando constancia que el presente Balance General ha sido confeccionado con datos e informaciones que hemos proporcionado como fidedignos a mi (nuestro) Contador.";
doc.text(declaracion, colX[0], currentY, { width: 740, align: 'left' });

currentY += 50;

// Líneas de firma
const lineSize = 180;
const signatureY = currentY;

// Firma Representante Legal
doc.moveTo(colX[0] + 50, signatureY).lineTo(colX[0] + 50 + lineSize, signatureY).stroke();
doc.font('Helvetica-Bold').fontSize(8).text("FIRMA REPRESENTANTE LEGAL", colX[0] + 50, signatureY + 5, { width: lineSize, align: 'center' });
doc.font('Helvetica').text(empresa.nombre, colX[0] + 50, signatureY + 15, { width: lineSize, align: 'center' });
doc.text("RUT: " + empresa.rut, colX[0] + 50, signatureY + 25, { width: lineSize, align: 'center' });

// Firma Contador
doc.moveTo(colX[6] - 50, signatureY).lineTo(colX[6] - 50 + lineSize, signatureY).stroke();
doc.font('Helvetica-Bold').fontSize(8).text("FIRMA CONTADOR", colX[6] - 50, signatureY + 5, { width: lineSize, align: 'center' });
doc.font('Helvetica').text("NOMBRE DEL CONTADOR", colX[6] - 50, signatureY + 15, { width: lineSize, align: 'center' });
doc.text("RUT: XX.XXX.XXX-X", colX[6] - 50, signatureY + 25, { width: lineSize, align: 'center' });

doc.end();
console.log(`✅ Reporte final generado: Balance_General.pdf`);