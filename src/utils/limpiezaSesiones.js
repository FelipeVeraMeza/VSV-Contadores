// =====================================================================
// BARRER LAS SESIONES CADUCADAS
// ---------------------------------------------------------------------
// POR QUÉ
// Cada vez que alguien entra se escribe una fila en `sessions`, y nadie las
// borraba nunca. Al 04-09-2026 la tabla tenía **604 filas y solo 5 vivas**:
// 599 sesiones muertas que ninguna consulta va a usar jamás —el middleware
// filtra por `expires_at > NOW()`— pero que igual se cargan, se indexan y se
// respaldan.
//
// No es urgente hoy, con 604 filas. A este ritmo sí lo es en un año, y es de
// esas cosas que no duelen hasta que duelen mucho.
//
// CÓMO
// Un barrido al arrancar y otro cada seis horas. No hace falta más: lo que se
// borra no lo está usando nadie por definición.
//
// NUNCA TOCA UNA SESIÓN VIVA
// La condición es `expires_at <= NOW()`, la misma que el middleware usa al
// revés para aceptar. Si alguna vez esto echara a alguien conectado, sería
// porque el reloj de la base cambió — no por esta consulta.
// =====================================================================
import { pool } from '../database/db.js';

const CADA_MS = 1000 * 60 * 60 * 6;   // seis horas

/** Borra las sesiones ya vencidas. Devuelve cuántas se fueron. */
export const barrerSesiones = async () => {
    try {
        const { rowCount } = await pool.query(
            'DELETE FROM sessions WHERE expires_at <= NOW()');
        if (rowCount > 0) {
            console.log(`🧹 ${rowCount} sesión(es) caducada(s) eliminadas.`);
        }
        return rowCount;
    } catch (err) {
        // Que falle la limpieza no puede tumbar el servidor: son filas muertas.
        console.warn('⚠️  No se pudieron limpiar las sesiones:', err.message);
        return 0;
    }
};

/** Arranca el barrido periódico. Se llama una vez, al levantar el servidor. */
export const iniciarLimpiezaSesiones = () => {
    barrerSesiones();
    // `unref` para que este temporizador no impida que el proceso termine
    // cuando se le pide que se cierre.
    setInterval(barrerSesiones, CADA_MS).unref?.();
};
