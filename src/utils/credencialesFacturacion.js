// ============================================================================
// CREDENCIALES CON LAS QUE SE ENTRA AL SII A FACTURAR
// ----------------------------------------------------------------------------
// Regla del negocio: al portal del SII se entra con el RUT de una persona y su
// clave tributaria, y al firmar el documento se pide además la clave del
// certificado digital (.pfx). Ese certificado es PERSONAL: el de Victor no es
// el de Mati.
//
// Hasta el 31-jul-2026 los 5 robots leían esos datos directo del `.env`
// (`DTE_RUT`, `DTE_DV`, `DTE_PASS`, `SII_PFX_PASS`), que son los de la cuenta
// master. O sea que apretara el botón quien lo apretara, para el SII todas las
// facturas de la oficina las emitía la misma persona.
//
// Ahora se usan las del usuario que apretó, guardadas cifradas en
// `credencial_global` desde Mi Perfil. Si ese usuario todavía no las cargó, se
// cae a las del `.env`: así nadie se queda sin poder facturar mientras las
// completan.
// ============================================================================
import { obtenerCredencialGlobal } from '../controllers/credenciales.controllers.js';

export const credencialesDelSistema = () => ({
    DTE_RUT: process.env.DTE_RUT || '',
    DTE_DV: process.env.DTE_DV || '',
    DTE_PASS: process.env.DTE_PASS || '',
    SII_PFX_PASS: process.env.SII_PFX_PASS || '',
    DTE_CIUDAD: process.env.DTE_CIUDAD || 'Santiago',
});

const completas = (c) => !!(c && c.DTE_RUT && c.DTE_DV && c.DTE_PASS);

/**
 * Credenciales para el robot, según quién esté facturando.
 *
 * Devuelve siempre algo utilizable: las del usuario si están completas, y si no
 * las del sistema. `origen` sirve para dejarlo escrito en el log y saber después
 * con qué cuenta salió cada documento.
 */
export const credencialesParaFacturar = async (usuarioId, nombreUsuario = null) => {
    const sistema = credencialesDelSistema();

    if (!usuarioId) {
        return { credenciales: sistema, origen: 'sistema', motivo: 'no se identificó al usuario' };
    }

    let propias = null;
    try {
        propias = await obtenerCredencialGlobal(usuarioId);
    } catch (err) {
        console.warn(`⚠️  No se pudieron leer las credenciales de ${nombreUsuario || usuarioId}: ${err.message}`);
    }

    if (!completas(propias)) {
        return {
            credenciales: sistema,
            origen: 'sistema',
            motivo: propias ? 'las suyas están incompletas' : 'no tiene credenciales cargadas',
        };
    }

    // La clave del certificado puede faltar aunque el resto esté: se completa
    // con la del sistema para no dejar el documento sin firmar.
    if (!propias.SII_PFX_PASS) {
        propias.SII_PFX_PASS = sistema.SII_PFX_PASS;
    }
    if (!propias.DTE_CIUDAD) {
        propias.DTE_CIUDAD = sistema.DTE_CIUDAD;
    }

    return { credenciales: propias, origen: 'usuario', motivo: null };
};

/** Una línea para el log, sin exponer claves. */
export const describirCredenciales = ({ credenciales, origen, motivo }, nombreUsuario) => {
    const quien = nombreUsuario || 'usuario desconocido';
    const rut = `${credenciales.DTE_RUT}-${credenciales.DTE_DV}`;
    return origen === 'usuario'
        ? `🔑 Facturando como ${quien} con SU cuenta del SII (${rut}).`
        : `🔑 Facturando como ${quien} con la cuenta del SISTEMA (${rut}) — ${motivo}.`;
};
