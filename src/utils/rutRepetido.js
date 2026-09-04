// =====================================================================
// UN RUT DE REPRESENTANTE QUE YA ESTÁ EN OTRA EMPRESA
// ---------------------------------------------------------------------
// POR QUÉ EXISTE
// El mismo RUT puede estar legítimamente en varias empresas: hay personas que
// representan a dos o tres sociedades. Eso no es un error y no hay que
// impedirlo.
//
// Lo que SÍ es un error es el mismo RUT con nombres DISTINTOS. Medido sobre
// los datos reales el 04-09-2026 aparecieron dos casos:
//
//   15333170-7  ANITA MARIA VEAS VILLAGRA   → ANITA ... ASESORIAS E.I.R.
//               FABIAN ALBERTO SANHUEZA     → JFAY INVERSIONES SPA
//
//   19247436-1  FERNANDO EFRAIN FERRUZOLA   → T-LEX SPA
//               JONATHAN ANDRES JARA KERN   → TELEX SPA
//
// El segundo par huele a copiar y pegar: T-LEX y TELEX se escriben casi igual.
//
// ESTO NO ES COSMÉTICO. El robot que saca compras y ventas entra al portal del
// SII con el RUT DEL REPRESENTANTE más su clave. Con el RUT equivocado no
// entra — o entra como quien no corresponde.
//
// QUÉ HACE ESTE MÓDULO
// Avisa, no bloquea. Devuelve con quién choca para que la pantalla pueda
// preguntar «¿es la misma persona?» en vez de decidirlo sola. Bloquear sería
// peor: el caso legítimo —una persona, dos empresas— es más frecuente que el
// error, y un formulario que no deja guardar obliga a inventar un dato falso.
//
// SE BUSCA POR HASH, NO DESCIFRANDO
// `rut_hash` existe justamente para esto: permite preguntar «¿alguien más
// tiene este RUT?» sin descifrar los 144 representantes cargados.
// =====================================================================
import { pool } from '../database/db.js';
import { generateHash } from './crypto.js';

/** Normaliza para comparar nombres: sin tildes, sin dobles espacios, en mayúsculas. */
const normalizar = (s) => String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

/**
 * ¿Este RUT ya es representante de otra empresa, con OTRO nombre?
 *
 * @param {string} rutLimpio   el RUT ya normalizado (sin puntos ni espacios)
 * @param {string} nombre      el nombre que se está por guardar
 * @param {string|null} empresaIdExcluir  para no chocar consigo misma al editar
 * @returns {Promise<null|{rut, nombreExistente, empresas}>}
 */
export const rutDeRepresentanteEnConflicto = async (rutLimpio, nombre, empresaIdExcluir = null) => {
    if (!rutLimpio || !String(nombre || '').trim()) return null;

    try {
        const { rows } = await pool.query(
            `SELECT r.nombre, e.razon_social
               FROM empresa_representante r
               JOIN empresa e ON e.id = r.empresa_id
              WHERE r.rut_hash = $1
                AND ($2::uuid IS NULL OR r.empresa_id <> $2::uuid)
                AND COALESCE(TRIM(r.nombre), '') <> ''`,
            [generateHash(rutLimpio), empresaIdExcluir]);

        if (!rows.length) return null;

        const nuevo = normalizar(nombre);
        // Solo molesta si el nombre NO calza. Que la misma persona esté en dos
        // empresas es normal y no se avisa.
        const distintos = rows.filter(r => normalizar(r.nombre) !== nuevo);
        if (!distintos.length) return null;

        return {
            rut: rutLimpio,
            nombreExistente: distintos[0].nombre,
            empresas: [...new Set(distintos.map(r => r.razon_social))],
        };
    } catch (err) {
        // Un aviso que falla no puede impedir dar de alta a un cliente.
        console.warn('⚠️  No se pudo comprobar el RUT del representante:', err.message);
        return null;
    }
};

/**
 * Todos los conflictos que ya existen en la base. Lo usa la prueba de QA para
 * que salgan a la luz en cada corrida en vez de quedar enterrados.
 */
export const conflictosDeRutExistentes = async () => {
    const { rows } = await pool.query(
        `SELECT r.rut_hash,
                json_agg(json_build_object('nombre', r.nombre, 'empresa', e.razon_social)) AS gente
           FROM empresa_representante r
           JOIN empresa e ON e.id = r.empresa_id
          WHERE r.rut_hash IS NOT NULL AND COALESCE(TRIM(r.nombre), '') <> ''
          GROUP BY r.rut_hash
         HAVING COUNT(DISTINCT UPPER(TRIM(r.nombre))) > 1`);

    return rows.map(r => ({ gente: r.gente }));
};
