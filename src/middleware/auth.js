import { pool } from "../database/db.js";

export async function requireSession(req, res, next) {
  const sessionId = req.header("x-session-id");
  const empresaIdFromHeader = req.header("x-company-id");

  if (!sessionId) {
    return res.status(401).json({ message: "No se encontró el ID de sesión" });
  }

  try {
    const query = `
      SELECT s.usuario_id, u.rol, u.nombre, s.expires_at
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

    req.user = {
      usuarioId: session.usuario_id,
      rol: session.rol,
      nombre: session.nombre,
      sessionId: sessionId,
      empresaId: empresaIdFromHeader || null
    };

    // Cargar permisos de módulos si es administrador
    if (session.rol === 'Administrador') {
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

export const requireModulo = (modulo) => {
  return (req, res, next) => {
    if (req.user?.rol !== 'Administrador') {
      return res.status(403).json({
        success: false,
        message: "Acceso Denegado: Esta acción requiere privilegios de Administrador."
      });
    }

    // Si no tiene módulos asignados (backward compatibility), permitir todo
    if (!req.user?.modulos) {
      return next();
    }

    const moduloMap = {
      'contabilidad': 'puede_ver_contabilidad',
      'facturacion': 'puede_ver_facturacion',
      'rrhh': 'puede_ver_rrhh',
      'operacion_renta': 'puede_ver_operacion_renta',
      'crm': 'puede_ver_crm',
      'admin': 'puede_ver_admin'
    };

    const permiso = moduloMap[modulo];
    if (!permiso || !req.user?.modulos?.[permiso]) {
      return res.status(403).json({
        success: false,
        message: `Acceso Denegado: No tienes permiso para acceder a ${modulo}.`
      });
    }

    next();
  };
};