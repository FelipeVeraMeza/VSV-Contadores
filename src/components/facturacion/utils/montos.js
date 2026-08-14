// ============================================================================
// MONTOS EN PANTALLA · «PONER SEPARADOR DE MILES EN LOS NUMEROS»
// ----------------------------------------------------------------------------
// Los campos de plata eran `<input type="number">`. Ese tipo de campo NO admite
// separador de miles —el navegador no lo permite— así que un honorario de
// 1.190.000 se veía «1190000» y había que contar los ceros con el dedo para
// saber si sobraba o faltaba uno. En una factura eso es un error caro.
//
// La solución es un campo de texto que se DIBUJA con puntos pero cuyo valor en
// el estado sigue siendo solo dígitos. Es importante que sea así: el resto del
// facturador hace `Number(row.precio)` para sumar la proyección y
// `String(row.precio).replace(/[^0-9]/g,'')` antes de mandar al SII. Si se
// guardara «1.190.000», la suma daría NaN.
//
//   estado:   "1190000"      ← lo que se guarda y viaja
//   pantalla: "1.190.000"    ← lo que se ve
// ============================================================================

/** Deja solo dígitos. Lo que se guarda en el estado y viaja al servidor. */
export const soloDigitos = (v) => String(v ?? '').replace(/[^\d]/g, '');

/**
 * Formatea para mostrar: 1190000 → "1.190.000".
 * Devuelve '' con el campo vacío, para que el placeholder se vea.
 */
export const formatearMiles = (v) => {
    const d = soloDigitos(v);
    return d ? Number(d).toLocaleString('es-CL') : '';
};

/**
 * Props listas para un campo de dinero. Se usa así:
 *
 *   <Input {...campoMonto(item.precio, (v) => setItem({ ...item, precio: v }))} />
 *
 * `inputMode="numeric"` hace que en el teléfono salga el teclado de números,
 * que es lo único bueno que se pierde al dejar `type="number"`.
 */
export const campoMonto = (valor, alCambiar) => ({
    type: 'text',
    inputMode: 'numeric',
    value: formatearMiles(valor),
    onChange: (e) => alCambiar(soloDigitos(e.target.value)),
});
