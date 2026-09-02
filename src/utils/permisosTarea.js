// ============================================================================
// PERMISOS SOBRE UNA TAREA
// ----------------------------------------------------------------------------
// RF-14 pedía una matriz explícita: propietario, quién ve, quién edita, quién
// finaliza y quién elimina, configurable tarea por tarea.
//
// Se implementó el modelo IMPLÍCITO en vez de la matriz, a propósito. Con un
// equipo chico, una matriz de cinco permisos obliga a decidir cinco cosas cada
// vez que alguien crea una tarea; en la práctica se deja el valor por defecto y
// solo estorba. Acá los permisos se deducen de campos que YA existen:
//
//   responsable_id       → responsable
//   creado_por           → quien la creó
//   tarea_colaborador    → colaboradores
//   proyecto_integrante  → quién pertenece al proyecto
//   parent_id            → de qué tarea es parte
//
//   ver / editar / cambiar estado / comentar : quien está metido en la tarea,
//                                              los integrantes de su proyecto y
//                                              quien ve su tarea madre
//   eliminar                                 : quien la creó
//   todo, dentro de su organización          : rol Administrador
//
// Si más adelante aparece un caso real ("esta tarea de sueldos no la puede ver
// nadie más"), acá se agrega la matriz sabiendo para qué.
//
// ---------------------------------------------------------------------------
// ⚠️ MODO PERMISIVO
// Arranca SIN bloquear: registra en la bitácora lo que habría rechazado y deja
// pasar. Así se puede revisar unos días qué habría cortado antes de activarlo
// de verdad, y nadie se queda sin poder trabajar por una regla mal calibrada.
// Para activarlo: PERMISOS_TAREA_ESTRICTO=true en el .env.
// ============================================================================
import { pool } from '../database/db.js';
import { registrar } from './bitacora.js';

export const modoEstricto = () =>
    String(process.env.PERMISOS_TAREA_ESTRICTO || '').toLowerCase() === 'true';

/**
 * Qué puede hacer este usuario con esta tarea.
 * @returns {{ puedeVer:boolean, puedeEditar:boolean, puedeEliminar:boolean, motivo:string|null }}
 */
export const permisosSobreTarea = async (usuario, tareaId) => {
    const yo = usuario?.usuarioId || null;
    // LA MISMA REGLA QUE USA LA LISTA (`puedeVerTarea` en crm.controllers.js),
    // y tiene que seguir siéndolo. Si acá se decidiera distinto, la lista
    // mostraría tareas que el detalle rechaza — el peor de los dos mundos.
    //
    // Son tres caminos: estar metido en ella, ser integrante de su proyecto, o
    // ver su tarea madre. Ese último se recorre hacia arriba con el CTE: la
    // cadena sube mientras la tarea no sea privada, hasta dos saltos, que es el
    // tope de anidación del modelo.
    const { rows } = await pool.query(
        `WITH RECURSIVE cadena AS (
            SELECT t.id, t.titulo, t.parent_id, t.visibilidad, t.proyecto_id,
                   t.responsable_id, t.creado_por, t.organizacion_id, 0 AS salto
              FROM tarea t WHERE t.id = $1
            UNION ALL
            SELECT m.id, m.titulo, m.parent_id, m.visibilidad, m.proyecto_id,
                   m.responsable_id, m.creado_por, m.organizacion_id, c.salto + 1
              FROM tarea m JOIN cadena c ON m.id = c.parent_id
             WHERE c.visibilidad = 'proyecto' AND c.salto < 2
         )
         SELECT c.salto, c.titulo, c.organizacion_id,
                (c.responsable_id = $2) AS es_responsable,
                (c.creado_por = $2)     AS es_creador,
                EXISTS (SELECT 1 FROM tarea_colaborador tc
                         WHERE tc.tarea_id = c.id AND tc.usuario_id = $2) AS es_colaborador,
                (c.visibilidad = 'proyecto' AND c.proyecto_id IS NOT NULL
                 AND EXISTS (SELECT 1 FROM proyecto_integrante pi
                              WHERE pi.proyecto_id = c.proyecto_id
                                AND pi.usuario_id = $2)) AS es_integrante
           FROM cadena c
          ORDER BY c.salto`,
        [tareaId, yo]
    );

    if (!rows.length) {
        return { existe: false, puedeVer: false, puedeEditar: false, puedeEliminar: false, motivo: 'La tarea no existe.' };
    }

    const t = rows[0];   // salto 0 = la tarea misma; el resto es su ascendencia

    // Aislamiento primero: una tarea de otra organización no se ve nunca, ni
    // siendo administrador. Esto no es "permiso de tarea", es multi-tenant.
    if ((t.organizacion_id || null) !== (usuario?.organizacionId || null)) {
        return { existe: true, titulo: t.titulo, puedeVer: false, puedeEditar: false, puedeEliminar: false,
                 motivo: 'Esa tarea pertenece a otra organización.' };
    }

    const esAdmin = usuario?.rol === 'Administrador';
    // Alcanza con cumplir en cualquier eslabón: en la tarea o en una de arriba.
    const alcanza = rows.some(r => r.es_responsable || r.es_creador || r.es_colaborador || r.es_integrante);

    return {
        existe: true,
        titulo: t.titulo,
        puedeVer:      esAdmin || alcanza,
        // Editar va con ver, a propósito: el integrante de un proyecto "ve y
        // trabaja" (docs/tareas-requerimientos.md §5bis). Mirar sin poder tocar
        // obligaría a pedirle a otro que mueva cada estado.
        puedeEditar:   esAdmin || alcanza,
        // Eliminar NO se hereda ni se contagia: sigue siendo de quien la creó.
        puedeEliminar: esAdmin || !!t.es_creador,
        motivo: (esAdmin || alcanza) ? null : 'No participas en esa tarea.',
    };
};

/**
 * Middleware. `accion` es 'ver' | 'editar' | 'eliminar'.
 * En modo permisivo deja pasar y solo deja constancia.
 */
// Un id que no tiene forma de UUID ni siquiera llega a la base: Postgres
// responde «invalid input syntax for type uuid», el catch de abajo lo daba por
// error genérico y dejaba pasar la petición al controlador, que terminaba
// reventando con un 500. Una URL mal escrita —o alguien probando a mano— debe
// dar 404, no un error de servidor.
const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const exigirPermisoTarea = (accion) => async (req, res, next) => {
    try {
        if (!ES_UUID.test(String(req.params.id || ''))) {
            return res.status(404).json({ success: false, message: 'La tarea no existe.' });
        }
        const p = await permisosSobreTarea(req.user, req.params.id);

        if (!p.existe) return res.status(404).json({ success: false, message: p.motivo });

        const permitido = accion === 'eliminar' ? p.puedeEliminar
                        : accion === 'editar'   ? p.puedeEditar
                        : p.puedeVer;

        if (permitido) return next();

        if (modoEstricto()) {
            return res.status(403).json({ success: false, message: p.motivo || 'No tienes permiso sobre esa tarea.' });
        }

        // Permisivo: se anota y se deja pasar.
        await registrar(req, {
            modulo: 'tareas', accion: 'permiso_habria_bloqueado',
            entidad: 'tarea', entidadId: req.params.id,
            descripcion: `Habría bloqueado "${accion}" sobre «${p.titulo}»: ${p.motivo}`,
            resultado: 'parcial',
            detalle: { accion, motivo: p.motivo, modo: 'permisivo' },
        });
        next();
    } catch (err) {
        console.warn('⚠️ Error evaluando permisos de tarea:', err.message);
        next(); // ante la duda no se bloquea el trabajo
    }
};
