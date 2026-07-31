// ============================================================================
// CANDADO DEL SII — POR CUENTA, NO GLOBAL
// ----------------------------------------------------------------------------
// El problema real es que el portal del SII no admite DOS sesiones abiertas con
// la MISMA cuenta: si dos robots entran con el mismo RUT, el portal bota una y
// el documento puede quedar a medio emitir.
//
// Con cuentas DISTINTAS no hay conflicto: son sesiones independientes. Por eso
// el candado se toma por cuenta y no para todo el sistema. Así, si Victor está
// facturando con su RUT, Mati puede facturar con el suyo al mismo tiempo.
//
// Mientras alguien no haya cargado sus credenciales y caiga al respaldo del
// `.env`, comparte cuenta con quien también esté en el respaldo: ahí sí se
// esperan entre ellos, que es justamente lo que hay que evitar.
//
// Ojo: esto vive en la memoria del proceso. Si algún día se levanta más de una
// instancia del servidor, cada una tendría su propio candado y habría que
// moverlo a la base de datos.
// ============================================================================

// clave (RUT del SII) → { etiqueta, quien, desde }
const enUso = new Map();

// Si un robot se cuelga y nunca suelta, el candado no puede quedarse tomado
// para siempre. Una emisión normal tarda entre 1 y 3 minutos.
const EXPIRA_MS = 20 * 60 * 1000;

/** Identifica la cuenta del SII a partir de las credenciales resueltas. */
export const claveDeCuenta = (credenciales) => {
    const rut = String(credenciales?.DTE_RUT || '').replace(/[^0-9kK]/gi, '');
    const dv = String(credenciales?.DTE_DV || '').replace(/[^0-9kK]/gi, '');
    return rut ? `${rut}-${dv}` : 'sin-cuenta';
};

const vencido = (uso) => Date.now() - uso.desde > EXPIRA_MS;

/** Devuelve quién la está usando, o null si está libre. */
export const cuentaOcupada = (clave) => {
    const uso = enUso.get(clave);
    if (!uso) return null;
    if (vencido(uso)) {
        console.warn(`⚠️  El candado del SII de la cuenta ${clave} llevaba más de 20 minutos tomado (${uso.etiqueta}). Se libera.`);
        enUso.delete(clave);
        return null;
    }
    return uso;
};

/** Intenta tomar la cuenta. Devuelve true si quedó tomada por ti. */
export const tomarCuenta = (clave, etiqueta, quien = null) => {
    if (cuentaOcupada(clave)) return false;
    enUso.set(clave, { etiqueta, quien, desde: Date.now() });
    return true;
};

export const soltarCuenta = (clave) => enUso.delete(clave);

/** Mensaje listo para devolverle al usuario cuando la cuenta está ocupada. */
export const motivoOcupada = (uso) => {
    const quien = uso.quien ? ` (${uso.quien})` : '';
    const minutos = Math.max(1, Math.round((Date.now() - uso.desde) / 60000));
    return `esa cuenta del SII ya está en uso${quien}: ${uso.etiqueta}, hace ${minutos} min`;
};

/** Para diagnóstico: qué cuentas están ocupadas ahora mismo. */
export const cuentasEnUso = () =>
    [...enUso.entries()]
        .filter(([, uso]) => !vencido(uso))
        .map(([clave, uso]) => ({ cuenta: clave, ...uso }));
