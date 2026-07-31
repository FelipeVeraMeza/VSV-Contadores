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
//   responsable_id      → responsable
//   creado_por          → quien la creó
//   tarea_colaborador   → colaboradores
//
//   ver / editar / cambiar estado / comentar : responsable, colaboradores y quien la creó
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
    const { rows } = await pool.query(
        `SELECT t.id, t.titulo, t.responsable_id, t.creado_por, t.organizacion_id,
                EXISTS (SELECT 1 FROM tarea_colaborador tc
                         WHERE tc.tarea_id = t.id AND tc.usuario_id = $2) AS es_colaborador
           FROM tarea t
          WHERE t.id = $1`,
        [tareaId, usuario?.usuarioId || null]
    );

    if (!rows.length) {
        return { existe: false, puedeVer: false, puedeEditar: false, puedeEliminar: false, motivo: 'La tarea no existe.' };
    }

    const t = rows[0];
    const yo = usuario?.usuarioId || null;

    // Aislamiento primero: una tarea de otra organización no se ve nunca, ni
    // siendo administrador. Esto no es "permiso de tarea", es multi-tenant.
    if ((t.organizacion_id || null) !== (usuario?.organizacionId || null)) {
        return { existe: true, titulo: t.titulo, puedeVer: false, puedeEditar: false, puedeEliminar: false,
                 motivo: 'Esa tarea pertenece a otra organización.' };
    }

    const esAdmin = usuario?.rol === 'Administrador';
    const esResponsable = t.responsable_id === yo;
    const esCreador = t.creado_por === yo;
    const involucrado = esResponsable || esCreador || t.es_colaborador;

    return {
        existe: true,
        titulo: t.titulo,
        puedeVer:      esAdmin || involucrado,
        puedeEditar:   esAdmin || involucrado,
        puedeEliminar: esAdmin || esCreador,
        motivo: (esAdmin || involucrado) ? null : 'No participas en esa tarea.',
    };
};

/**
 * Middleware. `accion` es 'ver' | 'editar' | 'eliminar'.
 * En modo permisivo deja pasar y solo deja constancia.
 */
export const exigirPermisoTarea = (accion) => async (req, res, next) => {
    try {
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
