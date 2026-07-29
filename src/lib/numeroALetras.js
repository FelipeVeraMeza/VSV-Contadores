// Convierte un entero a palabras en español (para la línea "SON: … PESOS").
// Ej: 425518 → "CUATROCIENTOS VEINTICINCO MIL QUINIENTOS DIECIOCHO".
export function numeroALetras(n) {
  n = Math.round(Math.abs(Number(n) || 0));
  if (n === 0) return 'CERO';
  const U = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE'];
  const D = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  const C = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];
  const centena = (x) => {
    if (x === 0) return '';
    if (x === 100) return 'CIEN';
    const c = Math.floor(x / 100), dd = x % 100, d = Math.floor(dd / 10), u = dd % 10;
    let r = c ? C[c] + ' ' : '';
    if (dd <= 20) r += U[dd];
    else if (dd < 30) r += 'VEINTI' + U[u];
    else { r += D[d]; if (u) r += ' Y ' + U[u]; }
    return r.trim();
  };
  const grupo = (x, sing, plur) => x === 1 ? sing : centena(x) + ' ' + plur;
  const millones = Math.floor(n / 1000000), miles = Math.floor((n % 1000000) / 1000), resto = n % 1000;
  let r = '';
  if (millones) r += grupo(millones, 'UN MILLON', 'MILLONES') + ' ';
  if (miles) r += grupo(miles, 'MIL', 'MIL') + ' ';
  if (resto) r += centena(resto);
  return r.trim().replace(/UNO MIL/g, 'UN MIL').replace(/UNO MILLON/g, 'UN MILLON');
}
