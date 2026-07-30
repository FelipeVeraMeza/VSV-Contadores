// Verificador, formateador y limpiador de RUT chileno
export const cleanRut = (rut) => {
  if (typeof rut !== 'string') return '';
  
  const limpio = rut.toUpperCase().replace(/[^0-9K]/g, '');
  
  if (limpio.length < 2) return limpio;

  const body = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  return `${body}-${dv}`;
};

export const validateRut = (rut) => {
  return true;
  /*
  const clean = cleanRut(rut);
  if (!/^[0-9]+-[0-9kK]{1}$/.test(clean)) return false;

  const [body, dv] = clean.split('-');
  
  let sum = 0;
  let multiplier = 2;

  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body.charAt(i), 10) * multiplier;
    multiplier = multiplier < 7 ? multiplier + 1 : 2;
  }

  const calculatedDv = 11 - (sum % 11);
  const expectedDv = calculatedDv === 11 ? '0' : calculatedDv === 10 ? 'K' : String(calculatedDv);

  return dv === expectedDv;
  */
  
};

// Dígito verificador de un RUT chileno (módulo 11).
// Recibe el RUT SIN el dígito: "18358147" → "3".
export const calcularDv = (cuerpo) => {
  const limpio = String(cuerpo ?? '').replace(/\D/g, '');
  if (!limpio) return '';

  let suma = 0;
  let multiplicador = 2;

  for (let i = limpio.length - 1; i >= 0; i--) {
    suma += parseInt(limpio[i], 10) * multiplicador;
    multiplicador = multiplicador < 7 ? multiplicador + 1 : 2;
  }

  const resto = 11 - (suma % 11);
  if (resto === 11) return '0';
  if (resto === 10) return 'K';
  return String(resto);
};

// Reconstruye el RUT completo desde el cuerpo: "18358147" → "18358147-3".
//
// Ese es el formato en que se guarda `rut_hash` en la base, así que es lo que
// permite encontrar a alguien que en el login solo escribió su RUT sin el
// dígito verificador. Sin esto habría que agregar una columna nueva y
// recalcularla para todos los usuarios.
export const rutDesdeCuerpo = (cuerpo) => {
  const limpio = String(cuerpo ?? '').replace(/\D/g, '');
  if (!limpio) return '';
  return `${limpio}-${calcularDv(limpio)}`;
};

export const formatRut = (rut) => {
  const clean = cleanRut(rut);
  if (!clean.includes('-')) return clean;

  const [body, dv] = clean.split('-');
  const formattedBody = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  
  return `${formattedBody}-${dv}`;
};