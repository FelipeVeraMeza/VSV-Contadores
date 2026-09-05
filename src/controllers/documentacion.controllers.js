// =====================================================================
// DOCUMENTACIÓN DENTRO DE LA PÁGINA
// ---------------------------------------------------------------------
// EL PEDIDO
// «Crear un módulo que se llame documentación de página. Pasar lo que tenemos
// hoy en el código —la documentación principal que está ahí— directamente a la
// página, para que ellos también puedan verlo sin necesidad de explicarlo
// siempre todos los días.»
//
// POR QUÉ SE LEE DEL ARCHIVO Y NO DE LA BASE
// La documentación ya existe: son 8.176 líneas en docs/*.md, escritas y
// mantenidas junto al código. Copiarlas a la base crearía DOS versiones de la
// misma verdad, y la de la base envejecería sin que nadie lo note —que es
// exactamente lo que pasó con ESTADO-Y-PROPUESTAS.md, que hoy dice «73 tablas»
// cuando hay 89—.
//
// Leyendo el archivo, lo que se ve en pantalla es lo mismo que ve quien toca el
// código. Una sola verdad.
//
// LA LISTA ES BLANCA, NO NEGRA
// Solo se sirven los archivos declarados en DOCUMENTOS. No se acepta un nombre
// de archivo por parámetro ni se arma una ruta con lo que llegue del navegador:
// eso permitiría pedir `../../.env` y llevarse las credenciales. El id que
// llega solo sirve para BUSCAR en una lista fija.
//
// SOLO PARA LA ORGANIZACIÓN
// Es documentación interna del despacho. Un rol Cliente no la ve.
// =====================================================================
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Los documentos que se publican, con su nombre para el menú. Agregar uno es
// agregar una línea acá: el archivo tiene que existir en docs/.
//
// Se suman de a uno, REVISANDO cada documento antes de publicarlo. Publicar los
// 23 de golpe publicaría también los desactualizados, y un documento que dice
// algo falso es peor que no tenerlo: la gente lo lee y decide con él.
//
// Ejemplo real: al revisar los de correo, SEIS requerimientos figuraban como
// pendientes y ya estaban hechos —entre ellos el que el propio documento
// llamaba «el más pedido de los que faltan»—.
const DOCUMENTOS = [
    {
        id: 'crm',
        titulo: 'CRM · Clientes y Prospectos',
        archivo: 'crm-modulo.md',
        resumen: 'Cómo funciona el módulo, qué tiene y qué falta. Los dos conceptos que hay que tener claros, las reglas de negocio y las brechas abiertas.',
        modulo: 'CRM',
    },
    // Comunicaciones · publicados el 05-09-2026, después de revisar cada
    // requerimiento pendiente contra el código: seis figuraban como ❌ y ya
    // estaban hechos. Publicar un documento desactualizado es peor que no
    // publicarlo, porque la gente lo lee y decide con él.
    {
        id: 'correo',
        titulo: 'Correo · Envío, bandeja y campañas',
        archivo: 'correos-requerimientos.md',
        resumen: 'Qué se puede hacer con el correo hoy, qué falta y por qué. Incluye el detalle de por qué el envío no funciona en producción.',
        modulo: 'Comunicaciones',
    },
    {
        id: 'reuniones',
        titulo: 'Reuniones por video',
        archivo: 'reuniones-modulo.md',
        resumen: 'Cómo funciona el módulo de reuniones: agendar, participantes, recordatorios y notas.',
        modulo: 'Comunicaciones',
    },
    {
        id: 'reuniones-manual',
        titulo: 'Reuniones · Manual de uso',
        archivo: 'reuniones-manual.md',
        resumen: 'Guía paso a paso para agendar y llevar una reunión. Escrita para usar, no para programar.',
        modulo: 'Comunicaciones',
    },
    // Publicado el 05-09-2026, después de verificar los 31 pendientes contra el
    // código: siete ya estaban hechos y uno estaba mal entendido —reagendar
    // cambia la fecha, no el título—. Se publica con esas correcciones dentro.
    {
        id: 'reuniones-requerimientos',
        titulo: 'Reuniones · Qué falta',
        archivo: 'reuniones-requerimientos.md',
        resumen: 'La lista completa de lo pedido para reuniones, con lo que ya está hecho, lo que está a medias y lo que falta.',
        modulo: 'Comunicaciones',
    },
    // Tickets · publicado el 05-09-2026. Los 17 requerimientos funcionales se
    // verificaron contra el código antes de publicarlo; el único dato que había
    // envejecido era el bloqueo de las plantillas por empresa, donde el backend
    // ya no es el freno.
    {
        id: 'tareas',
        titulo: 'Tickets · Tareas y proyectos',
        archivo: 'tareas-requerimientos.md',
        resumen: 'Cómo funciona el módulo: estados, subtareas, la regla de avance, permisos y el registro de todo lo que se fue construyendo.',
        modulo: 'Tickets',
    },
];

const PorId = new Map(DOCUMENTOS.map(d => [d.id, d]));

// La carpeta docs/ vive en la raíz del proyecto, dos niveles sobre este archivo.
const CARPETA = path.resolve(process.cwd(), 'docs');

/** Un rol Cliente no ve documentación interna del despacho. */
const puedeVer = (req) => req.user?.rol !== 'Cliente';

// ---------------------------------------------------------------
export const listarDocumentos = async (req, res) => {
    if (!puedeVer(req)) {
        return res.status(403).json({ success: false, message: 'No tienes acceso a la documentación interna.' });
    }
    return res.json({
        success: true,
        documentos: DOCUMENTOS.map(({ id, titulo, resumen, modulo }) => ({ id, titulo, resumen, modulo })),
    });
};

export const obtenerDocumento = async (req, res) => {
    if (!puedeVer(req)) {
        return res.status(403).json({ success: false, message: 'No tienes acceso a la documentación interna.' });
    }

    // El id se BUSCA en la lista fija; nunca se usa para construir una ruta.
    const doc = PorId.get(String(req.params.id || ''));
    if (!doc) return res.status(404).json({ success: false, message: 'Ese documento no existe.' });

    try {
        const contenido = await readFile(path.join(CARPETA, doc.archivo), 'utf8');
        return res.json({
            success: true,
            documento: {
                id: doc.id, titulo: doc.titulo, resumen: doc.resumen,
                modulo: doc.modulo, contenido,
                // El índice se arma acá y no en el navegador: es el mismo
                // recorrido del texto que ya se hace para leerlo, y así la
                // pantalla no repite la lógica de qué es un encabezado.
                indice: indiceDe(contenido),
            },
        });
    } catch (error) {
        // Un documento declarado cuyo archivo no está es un error de despliegue,
        // no del usuario: se dice con claridad en vez de un 500 genérico.
        if (error.code === 'ENOENT') {
            console.error(`❌ Falta el archivo de documentación: docs/${doc.archivo}`);
            return res.status(404).json({
                success: false,
                message: 'El documento está declarado pero su archivo no se encuentra en el servidor.',
            });
        }
        console.error('❌ Error leyendo la documentación:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo leer el documento.' });
    }
};

/**
 * Saca los encabezados de nivel 2 y 3 para armar el índice lateral.
 *
 * Solo ## y ###: el # de nivel 1 es el título del documento —ya se muestra
 * arriba— y a partir del cuarto nivel el índice se vuelve tan largo como el
 * texto y deja de servir para navegar.
 */
function indiceDe(markdown) {
    const salida = [];
    let dentroDeBloqueDeCodigo = false;

    // Se normalizan los finales de línea de Windows. Acá el índice salía bien
    // igual, pero por casualidad: la regex de abajo termina en \s*$ y \s
    // incluye el \r. La comprobación de ``` no tiene esa red —«```\r» no
    // rompe hoy porque se usa startsWith, pero cualquier cambio a un anclado
    // con $ lo rompería en silencio—. Mejor entrar siempre con \n limpio.
    for (const linea of markdown.replace(/\r\n?/g, '\n').split('\n')) {
        // Un ## dentro de un bloque de código es código, no un encabezado.
        if (linea.startsWith('```')) { dentroDeBloqueDeCodigo = !dentroDeBloqueDeCodigo; continue; }
        if (dentroDeBloqueDeCodigo) continue;

        const m = /^(#{2,3})\s+(.+?)\s*$/.exec(linea);
        if (!m) continue;
        const texto = m[2].replace(/[*_`]/g, '').trim();
        if (!texto) continue;
        salida.push({ nivel: m[1].length, texto, ancla: ancla(texto) });
    }
    return salida;
}

/** El id que se le pone al encabezado para poder saltar a él. */
export function ancla(texto) {
    return String(texto)
        .normalize('NFD').replace(/[̀-ͯ]/g, '')   // sin tildes
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
}
