import { pool } from "../database/db.js";

export async function requireSession(req, res, next) {
  // Se puede montar dos veces en la misma peticion (a nivel de servidor y dentro
  // del router). Si ya resolvio al usuario, no se vuelve a consultar la base.
  if (req.user) return next();

  // Normalmente la sesión viaja en la cabecera. La excepción es el canal de
  // avisos en vivo: lo abre `EventSource`, que por diseño del navegador NO
  // permite mandar cabeceras propias, así que ahí la sesión llega en la URL.
  //
  // Se acepta solo cuando la ruta lo pide (`permitirSesionEnUrl`), no en
  // cualquier petición: una sesión en la URL queda escrita en los registros del
  // servidor y en el historial, y no queremos eso como norma.
  const sessionId = req.header("x-session-id")
    || (req.permitirSesionEnUrl ? req.query?.sesion : null);
  const empresaIdFromHeader = req.header("x-company-id");

  if (!sessionId) {
    return res.status(401).json({ message: "No se encontró el ID de sesión" });
  }

  try {
    const query = `
      SELECT s.usuario_id, u.rol, u.nombre, u.organizacion_id, s.expires_at,
             s.last_seen_at,
             u.ve_solo_empresas_asignadas
      FROM sessions s
      JOIN usuario u ON s.usuario_id = u.id
      WHERE s.session_id = $1
        AND s.expires_at > NOW()
        AND u.activo = true
    `;
    
    const { rows } = await pool.query(query, [sessionId]);

    if (rows.length === 0) {
      return res.status(401).json({ 
        message: "Sesión inválida, expirada o cuenta restringida" 
      });
    }

    const session = rows[0];

    const now = Date.now();
    const expiresAt = new Date(session.expires_at).getTime();
    
    if (expiresAt - now < 1000 * 60 * 60 * 12) {
        const newExpiry = new Date(now + 1000 * 60 * 60 * 24);
        pool.query("UPDATE sessions SET expires_at = $1 WHERE session_id = $2", [newExpiry, sessionId])
            .catch(err => console.error("⚠️ Error silencioso extendiendo sesión:", err));
    }

    // SEÑAL DE VIDA · para saber quién está conectado ahora mismo.
    //
    // No se escribe en cada petición: eso sería un UPDATE por cada clic de cada
    // persona, y abrir una pantalla dispara varias llamadas a la vez. Con un
    // minuto de resolución sobra para un semáforo de presencia, y el ahorro es
    // de dos órdenes de magnitud.
    //
    // Va sin `await` y con el error tragado a propósito: es un dato accesorio y
    // no puede demorar —ni menos tumbar— la petición que lo provocó.
    const ultimaSenal = session.last_seen_at ? new Date(session.last_seen_at).getTime() : 0;
    if (now - ultimaSenal > 1000 * 60) {
        pool.query("UPDATE sessions SET last_seen_at = NOW() WHERE session_id = $1", [sessionId])
            .catch(() => { /* dato accesorio: si falla, no se rompe nada */ });
    }

    req.user = {
      usuarioId: session.usuario_id,
      rol: session.rol,
      nombre: session.nombre,
      organizacionId: session.organizacion_id || null,
      // Empieza en cero dentro del equipo: solo ve las empresas que se le asignen.
      veSoloEmpresasAsignadas: session.ve_solo_empresas_asignadas === true,
      sessionId: sessionId,
      empresaId: empresaIdFromHeader || null
    };

    // Los módulos se cargan para CUALQUIER rol: el recorte es por usuario, no
    // por rol. Antes solo se leían para Administrador, así que las banderas de
    // un Consultor o un Cliente nunca llegaban a aplicarse.
    {
      try {
        const modulosResult = await pool.query(
          `SELECT puede_ver_contabilidad, puede_ver_facturacion, puede_ver_rrhh,
                  puede_ver_operacion_renta, puede_ver_crm, puede_ver_admin
           FROM admin_modulos
           WHERE usuario_id = $1`,
          [session.usuario_id]
        );
        if (modulosResult.rows.length > 0) {
          req.user.modulos = modulosResult.rows[0];
        }
      } catch (err) {
        console.warn("⚠️ Error cargando módulos:", err.message);
      }
    }
   
    next();
  } catch (error) {
    console.error("❌ Error de Seguridad en requireSession:", error.message);
    return res.status(500).json({ message: "Error interno de seguridad del búnker" });
  }
}

export const requireAdmin = (req, res, next) => {
  if (req.user?.rol !== 'Administrador') {
    return res.status(403).json({
      success: false,
      message: "Acceso Denegado: Esta acción requiere privilegios de Administrador de VSV Pro."
    });
  }
  next();
};

const MODULO_A_COLUMNA = {
  contabilidad:    'puede_ver_contabilidad',
  facturacion:     'puede_ver_facturacion',
  rrhh:            'puede_ver_rrhh',
  operacion_renta: 'puede_ver_operacion_renta',
  crm:             'puede_ver_crm',
  admin:           'puede_ver_admin',
};

/**
 * Exige que el usuario tenga habilitado un módulo en `admin_modulos`.
 *
 * ⚠️ Esta función existía desde antes pero NUNCA se usó en ninguna ruta, y
 * además empezaba rechazando a todo el que no fuera Administrador — o sea que
 * conectarla habría dejado a Consultores y Clientes fuera de todo. Eso se
 * corrigió: acá NO se mira el rol. El rol se controla aparte con requireAdmin;
 * esto solo mira las banderas por usuario.
 *
 * Regla deliberada: SIN fila en `admin_modulos` se permite todo. Un usuario sin
 * configurar no puede quedarse sin acceso a su trabajo por un olvido; recortar
 * es una decisión explícita que alguien tiene que tomar.
 */
export const requireModulo = (modulo) => {
  return (req, res, next) => {
    const columna = MODULO_A_COLUMNA[modulo];
    if (!columna) return next();          // módulo desconocido: no se inventa un bloqueo

    const banderas = req.user?.modulos;
    if (!banderas) return next();          // sin configurar = acceso completo

    if (banderas[columna] === false) {
      return res.status(403).json({
        success: false,
        message: `No tienes habilitado el módulo de ${modulo.replace('_', ' ')}. Pídeselo a un administrador.`
      });
    }

    next();
  };
};