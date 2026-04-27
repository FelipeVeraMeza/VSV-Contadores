import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// =============================
// PATH ARCHIVO
// =============================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const archivo = path.join(
  __dirname,
  "FACTURACIÓN ABRIL - Hoja 1.csv"
);

console.log("\n▶ Leyendo CSV profesional...\n");

if (!fs.existsSync(archivo)) {
  console.error("❌ Archivo no encontrado");
  process.exit(1);
}

// =============================
// LEER ARCHIVO
// =============================
const texto = fs.readFileSync(archivo, "latin1");

// NORMALIZAR
const lineas = texto
  .replace(/\t/g, ",")        // TAB → coma
  .replace(/;+/g, ",")        // ; → coma
  .split(/\r?\n/)
  .map(l => l.trim())
  .filter(l => l.length > 5);

// eliminar header
lineas.shift();

console.log("Lineas detectadas:", lineas.length);

// =============================
// REGEX CHILENOS
// =============================
const rutRegex = /\d{7,8}-[0-9Kk]/;
const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const montoRegex = /\$\s?[\d.,]+/g;

// =============================
function limpiarMonto(m) {
  if (!m) return 0;

  return Number(
    m.replace("$", "")
      .replace(/\./g, "")
      .replace(/,/g, "")
  );
}

// =============================
function parseLinea(linea) {

  const rut = linea.match(rutRegex)?.[0];
  const correo = linea.match(emailRegex)?.[0];
  const montos = linea.match(montoRegex);

  if (!rut || !correo || !montos || montos.length < 2)
    return null;

  // razón social = todo antes del primer monto
  const razonSocial = linea
    .split(montos[0])[0]
    .replace(/"/g, "")
    .replace(/,+$/, "")
    .trim();

  return {
    RAZON_SOCIAL: razonSocial,
    NETO: limpiarMonto(montos[0]),
    BRUTO: limpiarMonto(montos[1]),
    RUT: rut,
    CORREO: correo.toLowerCase(),
  };
}

// =============================
const datos = lineas
  .map(parseLinea)
  .filter(Boolean);

// =============================
console.log("\n✅ TOTAL CLIENTES:", datos.length);

console.log("\n✅ PRIMEROS REGISTROS:");
console.table(datos.slice());

console.log("\n🚀 CSV NORMALIZADO CORRECTAMENTE\n");