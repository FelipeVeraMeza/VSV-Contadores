// ============================================================================
// Credenciales para extraer del SII
// ----------------------------------------------------------------------------
// Regla del negocio: al portal del SII se entra con el RUT del REPRESENTANTE
// LEGAL y su clave del SII; ya dentro se selecciona la empresa cuya información
// se quiere ver. Así que para extraer hace falta:
//
//   1. RUT del representante legal   (empresa.rut_rep_encrypted)   → usuario del login
//   2. Clave del SII                 (empresa_credenciales.sii_password_encrypted)
//   3. RUT de la empresa             (empresa.rut_encrypted)       → la que se selecciona
//
// La clave web (empresa_credenciales.web_password_encrypted) se guarda para otros
// trámites del portal, pero la extracción del RCV no la usa: se avisa si falta,
// sin bloquear.
//
// Todo se lee y descifra ACÁ, en el servidor. Antes el frontend enviaba el RUT y
// la clave en el cuerpo del POST, así que la clave del SII de cada cliente
// viajaba al navegador.
// ============================================================================
import { pool } from '../database/db.js';
import { decrypt } from './crypto.js';

const lleno = (cifrado) => {
    const valor = cifrado ? decrypt(cifrado) : null;
    return valor && String(valor).trim() ? String(valor).trim() : null;
};

/**
 * Devuelve las credenciales listas para el robot, o lanza un Error con un mensaje
 * que nombra la empresa y qué le falta exactamente.
 */
export const credencialesSiiDeEmpresa = async (empresaId, organizacionId = null) => {
    const { rows } = await pool.query(
        `SELECT e.razon_social, e.organizacion_id,
                e.rut_encrypted, e.rut_rep_encrypted, e.nombre_rep,
                c.sii_password_encrypted, c.web_password_encrypted
           FROM empresa e
           LEFT JOIN empresa_credenciales c ON c.empresa_id = e.id
          WHERE e.id = $1`,
        [empresaId]
    );

    if (!rows.length) throw new Error('La empresa no existe.');
    const fila = rows[0];

    // Aislamiento entre organizaciones: no se extrae de una empresa ajena.
    if (organizacionId && (fila.organizacion_id || null) !== organizacionId) {
        throw new Error('Esa empresa no pertenece a tu organización.');
    }

    const razonSocial = fila.razon_social || 'la empresa';
    const rutEmpresa       = lleno(fila.rut_encrypted);
    const rutRepresentante = lleno(fila.rut_rep_encrypted);
    const clave            = lleno(fila.sii_password_encrypted);
    const claveWeb         = lleno(fila.web_password_encrypted);

    const faltan = [];
    if (!rutEmpresa)       faltan.push('el RUT de la empresa');
    if (!rutRepresentante) faltan.push('el RUT del representante legal');
    if (!clave)            faltan.push('la clave del SII');

    if (faltan.length) {
        const lista = faltan.length === 1
            ? faltan[0]
            : `${faltan.slice(0, -1).join(', ')} y ${faltan[faltan.length - 1]}`;
        throw new Error(
            `No se puede extraer de ${razonSocial}: falta ${lista}. ` +
            `Complétalo en la ficha del cliente y vuelve a intentar.`
        );
    }

    if (!claveWeb) {
        console.warn(`⚠️  ${razonSocial} no tiene clave web guardada. La extracción del RCV no la necesita, pero otros trámites del portal sí.`);
    }

    return { rutEmpresa, rutRepresentante, clave, claveWeb, razonSocial, nombreRep: fila.nombre_rep || null };
};
