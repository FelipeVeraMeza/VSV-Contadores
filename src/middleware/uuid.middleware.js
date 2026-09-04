// ============================================================================
// VALIDACIÓN DE IDENTIFICADORES EN LA RUTA
// ----------------------------------------------------------------------------
// Casi todos los identificadores del sistema son UUID. Cuando llega otra cosa
// —«xyz», «999», el resto de una URL mal armada— Postgres lanza
// «invalid input syntax for type uuid», el controlador lo atrapa en su catch
// genérico y responde 500.
//
// Eso está mal por dos razones:
//   · 500 significa «el servidor se rompió»; acá lo que estaba mal era la
//     petición, y el cliente no puede distinguir un caso del otro
//   · llena los registros de errores que no son errores, y los reales se pierden
//     entre ellos
//
// Poniéndolo en la RUTA y no en cada controlador, queda cubierto también lo que
// se agregue después sin que nadie tenga que acordarse.
// ============================================================================

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Exige que los parámetros indicados sean UUID.
 *
 *   router.get('/:id', requireSession, uuidValido('id'), obtenerPersona);
 *
 * Se responde 404 y no 400 a propósito: para quien pregunta, un id que no puede
 * existir y uno que no existe son lo mismo, y 404 no revela qué forma tienen los
 * identificadores internos.
 */
export const uuidValido = (...nombres) => (req, res, next) => {
    for (const nombre of nombres) {
        const valor = req.params?.[nombre];
        // Un parámetro ausente no es asunto de este middleware: la ruta que lo
        // declara obligatorio ya no coincidiría.
        if (valor === undefined) continue;
        if (!ES_UUID.test(String(valor))) {
            return res.status(404).json({ success: false, message: 'No se encontró el registro.' });
        }
    }
    next();
};

export { ES_UUID };
