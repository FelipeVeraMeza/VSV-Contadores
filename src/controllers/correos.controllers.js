// ============================================================================
// ENVÍO DE CORREOS PERSONALIZADOS A UN CONJUNTO DE CLIENTES
// ----------------------------------------------------------------------------
// Escribir UNA vez y que a cada empresa le llegue con sus propios datos:
//
//     Hola {{empresa}}, su plan {{plan}} tiene un valor de {{valor_plan}}.
//
// TRES DECISIONES QUE EXPLICAN EL RESTO DEL ARCHIVO
//
// 1. LOS DATOS SE RESUELVEN EN EL SERVIDOR, NO EN LA PANTALLA.
//    La pantalla manda los `empresaId` y el texto con las marcas; los valores
//    salen de la base acá. Si viajaran ya reemplazados desde el navegador,
//    cualquiera podría mandar un correo a nombre de la firma diciendo que el
//    plan vale otra cosa. Además así el monto es el de HOY y no el que estaba
//    cargado en la pantalla hace media hora.
//
// 2. NADA SE MANDA SIN VISTA PREVIA. `previewCampana` devuelve exactamente lo
//    que recibiría cada empresa, quién queda fuera y por qué. Un envío a 200
//    clientes con una marca mal escrita no se puede deshacer.
//
// 3. EL ENVÍO VA EN SEGUNDO PLANO CON AVANCE. 200 correos tardan minutos; si la
//    petición esperara a terminar, el navegador cortaría por tiempo y nadie
//    sabría cuántos salieron. Mismo patrón que los recordatorios de pago.
// ============================================================================
import { pool } from '../database/db.js';
import { registrar } from '../utils/bitacora.js';
import { notificar } from '../utils/notificaciones.js';
import { enviarCorreo, correoConfigurado } from '../utils/mailer.js';
import { decrypt } from '../utils/crypto.js';
import {
    esHtmlCorreo, sanitizarHtmlCorreo, cuerpoVacio, escaparValor,
} from '../utils/htmlCorreo.js';
import crypto from 'node:crypto';

// ============================================================================
// DESUSCRIPCIÓN · el enlace de baja al pie de cada correo
// ----------------------------------------------------------------------------
// El token va FIRMADO, no guardado. Así el enlace funciona sin tener que crear
// una fila por cada correo enviado, y sobre todo: nadie puede dar de baja a otro
// cambiando la dirección en la URL, porque la firma no le va a calzar.
//
// Se firma con ENCRYPTION_KEY, que ya existe para el resto del sistema.
// ============================================================================
const SECRETO_BAJA = () => process.env.ENCRYPTION_KEY || 'vsv-fallback-baja';

const firmar = (texto) =>
    crypto.createHmac('sha256', SECRETO_BAJA()).update(texto).digest('base64url').slice(0, 32);

export const tokenBaja = (correo, org) => {
    const dato = `${String(correo).toLowerCase()}|${org || ''}`;
    return `${Buffer.from(dato).toString('base64url')}.${firmar(dato)}`;
};

/** Devuelve {correo, org} si el token es legítimo, o null. */
export const leerTokenBaja = (token) => {
    try {
        const [datos, firma] = String(token || '').split('.');
        if (!datos || !firma) return null;
        const dato = Buffer.from(datos, 'base64url').toString('utf8');
        // Comparación en tiempo constante: comparar con === filtra información
        // sobre cuántos caracteres acertó quien esté probando.
        const esperada = firmar(dato);
        if (firma.length !== esperada.length) return null;
        if (!crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada))) return null;
        const [correo, org] = dato.split('|');
        return { correo, org: org || null };
    } catch { return null; }
};

// Huella de la campaña: mismo asunto + mismo texto + mismos destinatarios.
// Sirve para avisar «esto ya lo mandaste» sin comparar textos largos.
const huellaDe = (asunto, cuerpo, ids) =>
    crypto.createHash('sha256')
        .update(`${asunto}||${cuerpo}||${[...(ids || [])].sort().join(',')}`)
        .digest('hex').slice(0, 64);

// ============================================================================
// CUÁNTOS CORREOS QUEDAN HOY  ·  RNF-CO-09
// ----------------------------------------------------------------------------
// Resend limita los envíos por día según el plan. El plan gratuito ronda los
// 100 y la cartera con correo son 132: una campaña completa NO CALZA, y sin
// este contador los que sobran se rechazan sin que nadie se entere.
//
// El tope se configura con `CORREOS_LIMITE_DIARIO` porque depende del plan
// contratado, que puede cambiar sin tocar código. 100 es el del plan gratuito:
// se elige como valor por omisión a propósito, porque equivocarse por abajo
// solo hace que el sistema avise de más, y equivocarse por arriba hace que se
// pierdan correos en silencio.
//
// Se cuenta desde `correo_envio`, que es el registro real de lo que salió, y no
// desde un contador aparte que habría que acordarse de mantener.
export const LIMITE_DIARIO = Math.max(1, parseInt(process.env.CORREOS_LIMITE_DIARIO, 10) || 100);

// EL DÍA SE CORTA EN UTC, QUE ES COMO LO CORTA EL PROVEEDOR.
//
// Estaba en hora de Chile con el argumento de que un envío de las 21:00 de un
// martes «tiene que contar para el martes». Suena razonable y era un error: este
// contador no existe para informar un día del calendario, existe para PREDECIR
// cuándo Resend va a empezar a rechazar. Si cuenta en otra ventana que la de
// quien aplica el tope, no predice nada.
//
// Lo que costó descubrirlo: el 16-ago salieron 48 correos después de las 20:00
// de Chile. Para nosotros eran del 16; para Resend, del 17. El contador mostraba
// 88 de 100 —«quedan 12»— cuando Resend ya iba en 148 y estaba rechazando.
//
// Ojo al leerlo: el contador se reinicia a MEDIANOCHE UTC, que en Chile son las
// 20:00 (21:00 en horario de verano). Un envío de las 21:00 aparece contra la
// cuota del día siguiente, y así es como lo va a cobrar el proveedor.
// Las PRUEBAS cuentan. Salen por el mismo proveedor y gastan el mismo tope; no
// contarlas hacía que el contador mintiera justo cuando más se usa —ajustando
// un texto se hacen 10 pruebas seguidas— y con un tope de ~100 esos 10 deciden
// si la campaña del mes entra o no.
//
// Se devuelven por separado para poder decir «12 reales + 3 de prueba»: sumadas
// sin distinguir, uno ve 15 y no entiende de dónde salieron.
export const cuotaDelDia = async (organizacionId) => {
    const { rows } = await pool.query(
        // Un envío con copia oculta son DOS correos para el proveedor: el del
        // cliente y el de la copia. Contarlo como uno mostraría la mitad del
        // gasto real, que es justo cuando más importa.
        `SELECT count(*) FILTER (WHERE NOT es_prueba)::int
                  + count(*) FILTER (WHERE NOT es_prueba AND con_copia)::int AS reales,
                count(*) FILTER (WHERE es_prueba)::int
                  + count(*) FILTER (WHERE es_prueba AND con_copia)::int     AS pruebas
           FROM correo_envio
          WHERE estado = 'enviado'
            AND organizacion_id IS NOT DISTINCT FROM $1::uuid
            AND (enviado_at AT TIME ZONE 'UTC')::date
              = (now()  AT TIME ZONE 'UTC')::date`,
        [organizacionId || null]);
    const reales  = rows[0]?.reales  ?? 0;
    const pruebas = rows[0]?.pruebas ?? 0;
    const enviados = reales + pruebas;
    return {
        limite: LIMITE_DIARIO,
        enviados,
        reales,
        pruebas,
        quedan: Math.max(0, LIMITE_DIARIO - enviados),
        // A qué hora local vuelve a cero, para que no haya que saberse que el
        // corte es en UTC. Se calcula en vez de fijarlo: en horario de verano
        // Chile cambia de UTC-4 a UTC-3 y la hora del reinicio se corre.
        reinicia: new Date(Date.UTC(
            new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + 1))
            .toLocaleTimeString('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit' }),
    };
};

export const cuotaController = async (req, res) => {
    try {
        return res.json({ success: true, ...(await cuotaDelDia(req.user?.organizacionId)) });
    } catch (error) {
        console.error('❌ Error leyendo la cuota:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo leer la cuota del día.' });
    }
};

/** Correos dados de baja en esta organización, en minúsculas. */
const bajasDe = async (organizacionId) => {
    const { rows } = await pool.query(
        `SELECT lower(correo) AS correo FROM correo_baja
          WHERE organizacion_id IS NOT DISTINCT FROM $1::uuid`, [organizacionId || null]);
    return new Set(rows.map(r => r.correo));
};

// El RUT viaja cifrado en la base. Si falla el descifrado se devuelve vacío en
// vez de reventar: un correo sin RUT es un problema menor comparado con una
// campaña que no sale.
const rutLegible = (cifrado) => {
    if (!cifrado || cifrado === 'SIN_DATO') return '';
    try { return decrypt(cifrado) || ''; } catch { return ''; }
};

// ----------------------------------------------------------------------------
// LOS DATOS QUE SE PUEDEN INSERTAR EN EL TEXTO
// ----------------------------------------------------------------------------
// Cada uno dice de dónde sale y cómo se ve, porque la pantalla los lista para
// que la persona los inserte con un clic en vez de escribirlos de memoria.
const pesos = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-CL')}`;

const MES = (d = new Date()) =>
    d.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });

const dia = (v) => v ? new Date(v).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

// IVA chileno. Se calcula acá y no se escribe a mano en la plantilla: el total
// de la cobranza tiene que salir de la misma cuenta siempre, y un «$59.500»
// tecleado a mano en un correo de cobro es un problema, no un detalle.
const IVA = 0.19;

export const CAMPOS = [
    { marca: 'empresa',      etiqueta: 'Razón social',        ejemplo: 'TRANSPORTES CONTE XPRESS SPA', valor: (e) => e.razon_social || '' },
    { marca: 'rut',          etiqueta: 'RUT de la empresa',   ejemplo: '76.123.456-7',                 valor: (e) => rutLegible(e.rut_encrypted) },
    { marca: 'plan',         etiqueta: 'Plan contratado',     ejemplo: 'FULL EMPRENDEDOR',             valor: (e) => e.plan_nombre || 'FREE' },
    { marca: 'valor_plan',   etiqueta: 'Valor del plan',      ejemplo: '$190.000',                     valor: (e) => pesos(e.honorario_neto) },
    { marca: 'representante',etiqueta: 'Representante legal', ejemplo: 'JUAN PÉREZ SOTO',              valor: (e) => e.nombre_rep || '' },
    { marca: 'giro',         etiqueta: 'Giro',                ejemplo: 'TRANSPORTE DE CARGA',          valor: (e) => e.giro || '' },
    { marca: 'correo',       etiqueta: 'Correo de la empresa',ejemplo: 'contacto@empresa.cl',          valor: (e) => e.email_corporativo || '' },
    { marca: 'mes',          etiqueta: 'Mes en curso',        ejemplo: MES(),                          valor: () => MES() },

    // ----------------------------------------------------------------------
    // LA FACTURA IMPAGA  ·  para los correos de cobranza
    // ----------------------------------------------------------------------
    // Salen de `cobro_mensual`, la MÁS ANTIGUA que siga en PENDIENTE_PAGO: es
    // la que se cobra primero. Ver `empresasDe`.
    //
    // Que vengan de la base y no de una planilla no es un lujo: un correo que
    // dice «su factura N°1232 está impaga» cuando el cliente ya pagó cuesta un
    // cliente. Acá el estado es el de hoy, no el del día en que alguien armó
    // el Excel. Si la empresa no debe nada, las marcas salen VACÍAS y la vista
    // previa lo avisa antes de mandar.
    { marca: 'factura',      etiqueta: 'N° de factura impaga', ejemplo: '1232',      valor: (e) => e.folio_impago || '' },
    { marca: 'monto_neto',   etiqueta: 'Monto impago (neto)',  ejemplo: '$50.000',   valor: (e) => e.monto_impago ? pesos(e.monto_impago) : '' },
    { marca: 'iva',          etiqueta: 'IVA del monto impago', ejemplo: '$9.500',    valor: (e) => e.monto_impago ? pesos(Number(e.monto_impago) * IVA) : '' },
    { marca: 'monto_total',  etiqueta: 'Total con IVA',        ejemplo: '$59.500',   valor: (e) => e.monto_impago ? pesos(Number(e.monto_impago) * (1 + IVA)) : '' },
    { marca: 'vencimiento',  etiqueta: 'Vencimiento factura',  ejemplo: '06/09/2026',valor: (e) => dia(e.vence_impago) },
];

export const camposDisponibles = (_req, res) =>
    res.json({ success: true, campos: CAMPOS.map(({ marca, etiqueta, ejemplo }) => ({ marca, etiqueta, ejemplo })) });

// Reemplaza {{marca}} por su valor. Tolera espacios: {{ empresa }} también vale.
//
// Una marca que NO existe se deja TAL CUAL en el texto, a propósito: si se
// borrara, un error de tipeo pasaría desapercibido y el cliente recibiría una
// frase incompleta sin que nadie se entere. Dejándola visible, salta en la
// vista previa antes de mandar nada.
//
// `comoHtml` NO es un detalle de presentación: es de seguridad. Con el cuerpo
// en texto plano se escapaba todo junto al final, así que una razón social con
// «&» o «<» quedaba a salvo sin hacer nada. Con el editor de formato el cuerpo
// ya es HTML y no se puede escapar entero —se perdería el formato—, así que
// cada valor se escapa al insertarse. Sin esto, un cliente llamado
// «GÓMEZ & CÍA <SPA>» rompe el correo, y uno con nombre malicioso hace algo
// peor. El asunto no lo necesita: nunca es HTML.
const combinar = (texto, empresa, comoHtml = false) => {
    if (!texto) return '';
    return String(texto).replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (completo, marca) => {
        const campo = CAMPOS.find(c => c.marca === marca.toLowerCase());
        if (!campo) return completo;
        const valor = campo.valor(empresa);
        return comoHtml ? escaparValor(valor) : valor;
    });
};

// Qué marcas VÁLIDAS se usaron de verdad en el texto. Sirve para revisar solo
// esas: no tiene sentido avisar que el giro está vacío si nadie lo insertó.
const marcasUsadas = (...textos) => {
    const validas = new Set(CAMPOS.map(c => c.marca));
    const usadas = new Set();
    for (const t of textos) {
        for (const m of String(t || '').matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gi)) {
            const marca = m[1].toLowerCase();
            if (validas.has(marca)) usadas.add(marca);
        }
    }
    return [...usadas];
};

// Un dato que sale VACÍO o en CERO es el error caro de este módulo: el correo
// se manda igual y el cliente lee «su plan  tiene un valor de $0». No se puede
// bloquear —a lo mejor de verdad vale cero— pero sí hay que ponerlo delante de
// los ojos antes de apretar enviar. Medido sobre la cartera real: 34 empresas
// tienen el honorario en cero y 26 no tienen plan cargado.
const datosVacios = (empresa, marcas) => {
    const flojos = [];
    for (const marca of marcas) {
        const campo = CAMPOS.find(c => c.marca === marca);
        if (!campo) continue;
        const v = String(campo.valor(empresa) ?? '').trim();
        if (!v || v === '$0') flojos.push(campo.etiqueta);
    }
    return flojos;
};

// Marcas escritas en el texto que no corresponden a ningún campo.
export const marcasDesconocidas = (...textos) => {
    const validas = new Set(CAMPOS.map(c => c.marca));
    const malas = new Set();
    for (const t of textos) {
        for (const m of String(t || '').matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gi)) {
            if (!validas.has(m[1].toLowerCase())) malas.add(m[1]);
        }
    }
    return [...malas];
};

const CORREO_VALIDO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// ============================================================================
// DESTINATARIOS DESDE UNA PLANILLA
// ----------------------------------------------------------------------------
// El otro camino: en vez de sacar los datos del CRM, vienen de un Excel. Es el
// caso del F29 del mes —46 clientes, cada uno con sus compras, sus ventas y su
// impuesto a pagar— donde las cifras NO están en el sistema: se calculan aparte
// y viven en la planilla.
//
// Cada COLUMNA del Excel se convierte en un dato insertable. Con la planilla de
// contabilidad quedan {{razon_social}}, {{rut}}, {{compras_netas}},
// {{impuesto_a_pagar}}… sin tener que configurar nada.
//
// Lo demás es idéntico al envío desde el CRM: misma vista previa, misma cuota,
// mismo registro, mismas bajas. Solo cambia de dónde salen los datos.
// ============================================================================

/** «IMPUESTO A PAGAR» → `impuesto_a_pagar`. Sin tildes ni espacios. */
export const normalizarMarca = (columna) => String(columna || '')
    .trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

// Los números se muestran con separador de miles. En esta planilla TODO lo
// numérico es dinero, y «920319» en un correo a un cliente se lee mal.
// Los textos —RUT, razón social— se dejan tal cual.
const valorLegible = (v) => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number' && Number.isFinite(v)) return v.toLocaleString('es-CL');
    return String(v).trim();
};

/**
 * Convierte las filas del Excel a la forma que ya entiende el resto del envío.
 * Devuelve `{ destinatarios, columnas, sinCorreo }`.
 *
 * `columnaCorreo` puede venir elegida desde la pantalla; si no, se busca: primero
 * por nombre (CORREO / MAIL / EMAIL) y si no aparece, la primera columna cuyos
 * valores tengan una arroba. Adivinar mal acá significa no mandarle a nadie, así
 * que la pantalla igual muestra cuál se eligió.
 */
export const desdePlanilla = (filas, columnaCorreo = null) => {
    if (!Array.isArray(filas) || !filas.length) return { destinatarios: [], columnas: [], sinCorreo: [] };

    const columnas = [...new Set(filas.flatMap(f => Object.keys(f || {})))];
    const col = columnaCorreo && columnas.includes(columnaCorreo)
        ? columnaCorreo
        : (columnas.find(c => /^(correo|mail|e[-_ ]?mail)/i.test(c.trim()))
           || columnas.find(c => filas.some(f => CORREO_VALIDO.test(String(f?.[c] || '').trim()))));

    const destinatarios = [];
    const sinCorreo = [];

    filas.forEach((fila, i) => {
        // Los datos de ESA fila, con la marca ya normalizada.
        const datos = {};
        for (const c of columnas) datos[normalizarMarca(c)] = valorLegible(fila?.[c]);

        const correos = String(fila?.[col] || '')
            .split(/[;,\s]+/).map(x => x.trim()).filter(x => CORREO_VALIDO.test(x));

        // El nombre para mostrar: la primera columna de texto que no sea el
        // correo. Con esta planilla es la razón social.
        const etiqueta = columnas
            .filter(c => c !== col)
            .map(c => String(fila?.[c] || '').trim())
            .find(v => v && !/^\d+([.,]\d+)?$/.test(v)) || `Fila ${i + 2}`;

        if (!correos.length) { sinCorreo.push({ fila: i + 2, etiqueta }); return; }
        destinatarios.push({ fila: i + 2, etiqueta, correos, datos });
    });

    return { destinatarios, columnas, columnaCorreo: col || null, sinCorreo };
};

// Reemplaza las marcas usando los datos de una fila de la planilla. Igual que
// `combinar`, pero contra el diccionario de la fila en vez de contra la empresa.
// El `comoHtml` va por lo mismo que en `combinar`, y acá pesa más: los valores
// salen de un Excel que llenó una persona, no de la base.
const combinarFila = (texto, datos, comoHtml = false) => String(texto || '')
    .replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (completo, marca) => {
        const k = marca.toLowerCase();
        if (!Object.hasOwn(datos, k)) return completo;
        return comoHtml ? escaparValor(datos[k]) : datos[k];
    });

// El cuerpo entra sin revisar —viene de una petición— y sale limpio. Se hace
// UNA vez, apenas llega: después ese mismo texto se guarda, se combina, se
// muestra en la previa y se manda.
const limpiarCuerpo = (cuerpo) =>
    esHtmlCorreo(cuerpo) ? sanitizarHtmlCorreo(cuerpo) : String(cuerpo || '');

// ============================================================================
// EL REMITENTE Y LA FIRMA DE CADA PERSONA
// ----------------------------------------------------------------------------
// Antes TODO salía desde `RESEND_FROM`: escribiera quien escribiera, al cliente
// le llegaba a nombre de Matías, y la respuesta también. Ahora cada uno manda
// desde su dirección y con su firma.
//
// EL DOMINIO NO ES NEGOCIABLE. Resend solo deja enviar desde un dominio
// verificado; con cualquier otro el envío se rechaza con 403 y el correo no
// sale. Se valida acá al guardar en vez de descubrirlo a mitad de una campaña.
const DOMINIO = 'vsvconsultores.com';
const remitenteValido = (c) =>
    CORREO_VALIDO.test(String(c || '').trim()) &&
    String(c).trim().toLowerCase().endsWith(`@${DOMINIO}`);

// De dónde sale el correo de quien está enviando. Si no configuró el suyo, se
// usa el de la variable de entorno, que es como funcionaba hasta ahora.
// Se exporta porque la bandeja de entrada lo necesita para responder: la
// respuesta tiene que salir con el mismo remitente que un envío de campaña.
export const perfilDe = async (usuarioId) => {
    if (!usuarioId) return null;
    const { rows } = await pool.query(
        `SELECT nombre, correo_remitente, correo_respuesta, copia_oculta, correo_copia,
                firma_texto, firma_imagen
           FROM usuario WHERE id = $1`,
        [usuarioId]);
    return rows[0] || null;
};

export const armarRemitente = (perfil) => {
    if (perfil?.correo_remitente && remitenteValido(perfil.correo_remitente)) {
        // Con el nombre delante, para que el cliente vea quién le escribe y no
        // una dirección suelta.
        return perfil.nombre ? `${perfil.nombre} <${perfil.correo_remitente}>` : perfil.correo_remitente;
    }
    return process.env.RESEND_FROM || `Matías Olivos <matias.olivos@${DOMINIO}>`;
};

// ----------------------------------------------------------------------------
// MI CORREO Y MI FIRMA
// ----------------------------------------------------------------------------
export const miPerfilCorreo = async (req, res) => {
    try {
        const p = await perfilDe(req.user?.usuarioId);
        return res.json({
            success: true,
            nombre: p?.nombre || null,
            correoRemitente: p?.correo_remitente || null,
            // A dónde le contesta el cliente. Sin esto la respuesta se pierde:
            // va a la casilla del dominio, que vive en el hosting y nadie lee.
            correoRespuesta: p?.correo_respuesta || null,
            // Copia oculta de cada envío, para tener el registro también en el
            // correo. Cuesta el doble de cuota, así que la pantalla lo advierte.
            copiaOculta: !!p?.copia_oculta,
            correoCopia: p?.correo_copia || null,
            firmaTexto: p?.firma_texto || null,
            firmaImagen: p?.firma_imagen || null,
            // Lo que se va a usar de verdad, ya resuelto: si no configuró el
            // suyo, que se vea cuál va a salir en vez de un campo en blanco.
            remitenteEfectivo: armarRemitente(p),
            dominio: DOMINIO,
        });
    } catch (error) {
        console.error('❌ Error leyendo el perfil de correo:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo cargar tu configuración.' });
    }
};

export const guardarPerfilCorreo = async (req, res) => {
    try {
        const { correoRemitente, correoRespuesta, copiaOculta, correoCopia,
                firmaTexto, firmaImagen } = req.body || {};

        const correo = String(correoRemitente || '').trim();
        if (correo && !remitenteValido(correo)) {
            return res.status(400).json({
                success: false,
                message: `El correo debe ser del dominio @${DOMINIO}. Desde otro dominio Resend rechaza el envío.`,
            });
        }

        // Acá NO se exige el dominio, al revés que arriba: la gracia del correo
        // de respuesta es justamente que sea donde la persona lee de verdad,
        // que suele ser un Gmail. El buzón de @vsvconsultores.com vive en el
        // hosting y no lo abre nadie.
        const respuesta = String(correoRespuesta || '').trim();
        if (respuesta && !CORREO_VALIDO.test(respuesta)) {
            return res.status(400).json({ success: false, message: 'El correo de respuesta no es una dirección válida.' });
        }
        const copia = String(correoCopia || '').trim();
        if (copia && !CORREO_VALIDO.test(copia)) {
            return res.status(400).json({ success: false, message: 'El correo para la copia no es una dirección válida.' });
        }
        // Sin destino no hay a dónde mandarla, y dejarla encendida «a la espera»
        // haría creer que hay registro cuando no lo hay.
        if (copiaOculta && !copia && !respuesta) {
            return res.status(400).json({
                success: false,
                message: 'Para recibir copia oculta necesitas indicar a qué correo, acá o en «Las respuestas me llegan a».',
            });
        }

        if (firmaImagen && !imagenValida(firmaImagen)) {
            return res.status(400).json({ success: false, message: 'La imagen de la firma no es válida.' });
        }

        await pool.query(
            `UPDATE usuario
                SET correo_remitente = $2, correo_respuesta = $3, copia_oculta = $4,
                    correo_copia = $5, firma_texto = $6, firma_imagen = $7
              WHERE id = $1`,
            [req.user?.usuarioId, correo || null, respuesta || null, !!copiaOculta,
             copia || null, firmaTexto?.trim() || null, firmaImagen || null]);

        const p = await perfilDe(req.user?.usuarioId);
        await registrar(req, {
            modulo: 'correos', accion: 'editar', entidad: 'perfil_correo', entidadId: req.user?.usuarioId,
            descripcion: `Actualizó su remitente y firma de correo`,
        });
        return res.json({ success: true, remitenteEfectivo: armarRemitente(p) });
    } catch (error) {
        console.error('❌ Error guardando el perfil de correo:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo guardar.' });
    }
};

// Varias fichas traen más de un correo separados por ; , o espacio.
const correosDe = (empresa) => String(empresa.email_corporativo || '')
    .split(/[;,\s]+/).map(c => c.trim()).filter(c => CORREO_VALIDO.test(c));

// Trae las empresas pedidas, siempre dentro de la organización de quien pide.
// El filtro por organización va acá y no en la pantalla: es lo que impide que
// alguien mande correos a la cartera de otro despacho pasando ids a mano.
const empresasDe = async (ids, organizacionId) => {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    const { rows } = await pool.query(
        `SELECT e.id, e.razon_social, e.giro, e.email_corporativo, e.nombre_rep,
                e.rut_encrypted, e.honorario_neto, p.nombre AS plan_nombre,
                imp.folio AS folio_impago, imp.monto_facturado AS monto_impago,
                imp.fecha_vencimiento AS vence_impago
           FROM empresa e
           LEFT JOIN plan p ON p.id = e.plan_id
           -- LA FACTURA IMPAGA MÁS ANTIGUA, si la hay.
           -- LATERAL y no un JOIN normal: se necesita UNA fila por empresa —la
           -- que se cobra primero— y no una copia del correo por cada factura
           -- que deba. Con LEFT, quien no debe nada igual recibe su correo, con
           -- esas marcas vacías; la vista previa lo muestra antes de enviar.
           LEFT JOIN LATERAL (
               SELECT cm.folio, cm.monto_facturado, cm.fecha_vencimiento
                 FROM cobro_mensual cm
                WHERE cm.empresa_id = e.id
                  AND cm.estado = 'PENDIENTE_PAGO'
                ORDER BY cm.fecha_vencimiento ASC NULLS LAST, cm.periodo ASC
                LIMIT 1
           ) imp ON true
          WHERE e.id = ANY($1::uuid[])
            AND e.organizacion_id IS NOT DISTINCT FROM $2::uuid
          ORDER BY e.razon_social`,
        [ids, organizacionId || null]
    );
    return rows;
};

// El HTML del correo. Se arma acá y no en la pantalla para que TODOS los envíos
// salgan con el mismo formato, y para que el texto que se escribe sea texto y
// no HTML: si la pantalla mandara HTML, un cliente podría recibir etiquetas
// crudas o algo peor.
const escapar = (t) => String(t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// La imagen de la firma viaja como data URI base64 dentro del propio correo.
// Se valida que sea eso y no otra cosa: si la pantalla mandara una URL externa
// y ese enlace muere, la firma queda como un cuadro roto en todos los correos
// ya enviados. Además una URL cualquiera acá sería una forma de meter contenido
// de terceros en un correo que sale a nombre de la firma.
const imagenValida = (v) => typeof v === 'string' && /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(v);

// Enlaces con texto: [texto](https://…) se convierte en un <a>. Es el mínimo
// para poder escribir «revise su estado de cuenta AQUÍ» en vez de pegar una URL
// cruda de 90 caracteres.
//
// Se aplica DESPUÉS de escapar, y solo acepta http/https: así sigue siendo
// imposible inyectar HTML desde el texto, que es lo que protege RNF-CO-05.
const enlaces = (htmlEscapado) =>
    htmlEscapado.replace(
        /\[([^\]]{1,120})\]\((https?:\/\/[^\s)]{1,400})\)/g,
        (_t, texto, url) => `<a href="${url}" style="color:#199b4d;text-decoration:underline">${texto}</a>`
    );

// ----------------------------------------------------------------------------
// LA IMAGEN DE LA FIRMA VIAJA COMO ADJUNTO EN LÍNEA, NO DENTRO DEL HTML
// ----------------------------------------------------------------------------
// Estaba embebida como data URI y NO SE VEÍA EN GMAIL. Dos motivos, y cada uno
// bastaba por sí solo:
//
//   1. Gmail elimina las imágenes `data:` al mostrar un correo recibido.
//   2. Una firma de 130 KB en base64 deja el HTML sobre los 102 KB a partir de
//      los cuales Gmail RECORTA el mensaje. Y lo que recorta es el final: justo
//      donde va la firma.
//
// Con `cid:` la imagen viaja como adjunto aparte, el HTML vuelve a pesar un par
// de KB y el cliente la muestra donde corresponde. Es la forma estándar.
const CID_FIRMA = 'firma_vsv';

// DOS FORMATOS CONVIVIENDO, A PROPÓSITO.
//
// Los cuerpos escritos con el editor llegan en HTML; los 139 envíos y las
// plantillas de antes están en texto plano. Nada de eso se migró: se distingue
// y cada uno se arma como corresponde, así un correo viejo se sigue viendo
// igual que el día que salió.
//
// El saneo se repite acá aunque el cuerpo ya se haya limpiado al entrar. Es a
// propósito: esta función es la ÚLTIMA puerta antes de que el HTML salga hacia
// el cliente, y acá el cuerpo ya trae los datos del cliente insertados. Barato
// y cierra el paso a lo que se haya guardado antes de que existiera el saneo.
const cuerpoComoHtml = (cuerpo) => esHtmlCorreo(cuerpo)
    ? sanitizarHtmlCorreo(cuerpo)
    : enlaces(escapar(cuerpo)).split(/\n{2,}/)
        .map(p => `<p style="margin:0 0 14px">${p.replace(/\n/g, '<br>')}</p>`).join('');

const armarHtml = (cuerpo, firma, firmaImagen, urlBaja) => `
<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:14px;line-height:1.6;color:#1f2937;max-width:600px">
  ${cuerpoComoHtml(cuerpo)}
  ${(firma || imagenValida(firmaImagen)) ? `
  <div style="margin-top:22px;padding-top:14px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px">
    ${/* El texto va ARRIBA de la imagen: «Saludos cordiales, Equipo Simple Pyme»
          y debajo la tarjeta, que es el orden del correo que ya se manda a mano.
          Al revés se lee como si la despedida fuera un pie de la tarjeta. */''}
    ${firma ? `<div style="margin-bottom:10px">${enlaces(escapar(firma)).replace(/\n/g, '<br>')}</div>` : ''}
    ${imagenValida(firmaImagen)
        ? `<img src="cid:${CID_FIRMA}" alt="" style="max-width:200px;height:auto;display:block;margin:0;border:0" />`
        : ''}
  </div>` : ''}
  ${urlBaja ? `
  <div style="margin-top:18px;padding-top:12px;border-top:1px solid #f3f4f6;color:#9ca3af;font-size:11px;line-height:1.5">
    Recibes este correo porque eres cliente de VSV Contadores.<br>
    Si no deseas recibir más correos como este,
    <a href="${urlBaja}" style="color:#9ca3af;text-decoration:underline">cancela tu suscripción aquí</a>.
  </div>` : ''}
</div>`;

// ============================================================================
// ADJUNTOS  ·  RF-CO-19
// ----------------------------------------------------------------------------
// La cascada de envío lee los adjuntos por RUTA DE ARCHIVO (así los usa el
// facturador con los PDF del SII). La pantalla, en cambio, los manda en base64.
// Se escriben a `tmp/` una sola vez y se reusan para todos los destinatarios:
// volver a escribirlos por cada uno sería 130 veces el mismo trabajo.
//
// La carpeta `tmp/` ya existe y el servidor la limpia periódicamente; igual se
// borran acá al terminar, para no dejar documentos de clientes dando vueltas.
const MAX_ADJUNTO = 7 * 1024 * 1024;      // 7 MB, igual que los de tareas
const MAX_ADJUNTOS_TOTAL = 15 * 1024 * 1024;

export const validarAdjuntos = (adjuntos) => {
    if (!Array.isArray(adjuntos) || adjuntos.length === 0) return null;
    let total = 0;
    for (const a of adjuntos) {
        if (!a?.nombre || !a?.dataBase64) return 'Un adjunto llegó incompleto.';
        // El data URI trae ~33% de sobrecarga sobre el tamaño real.
        const bytes = Math.floor((String(a.dataBase64).length * 3) / 4);
        if (bytes > MAX_ADJUNTO) return `«${a.nombre}» pesa más de 7 MB.`;
        total += bytes;
    }
    if (total > MAX_ADJUNTOS_TOTAL) return 'Los adjuntos suman más de 15 MB entre todos.';
    return null;
};

const guardarAdjuntos = async (adjuntos) => {
    if (!Array.isArray(adjuntos) || adjuntos.length === 0) return [];
    const { default: fs } = await import('node:fs');
    const { default: path } = await import('node:path');
    const dir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const rutas = [];
    for (const a of adjuntos) {
        try {
            const base64 = String(a.dataBase64).replace(/^data:[^;]+;base64,/, '');
            // Nombre único: dos campañas a la vez con un «informe.pdf» cada una
            // se pisarían el archivo.
            const seguro = String(a.nombre).replace(/[^\w.\-]/g, '_').slice(0, 80);
            const ruta = path.join(dir, `adj_${Date.now()}_${crypto.randomUUID().slice(0, 8)}_${seguro}`);
            fs.writeFileSync(ruta, Buffer.from(base64, 'base64'));
            rutas.push({ filename: seguro, path: ruta });
        } catch (e) {
            console.error(`⚠️ [CAMPAÑA] No se pudo preparar el adjunto ${a?.nombre}: ${e.message}`);
        }
    }
    return rutas;
};

// La firma en línea, escrita a disco una sola vez por campaña igual que los
// adjuntos: la cascada de envío lee todo por ruta de archivo.
const guardarFirmaInline = async (dataUri) => {
    if (!imagenValida(dataUri)) return null;
    try {
        const { default: fs } = await import('node:fs');
        const { default: path } = await import('node:path');
        const dir = path.join(process.cwd(), 'tmp');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        // La extensión importa: es de donde el proveedor deduce el tipo de
        // imagen, y una firma con la extensión equivocada no se muestra.
        const tipo = (String(dataUri).match(/^data:image\/([a-z]+);/i)?.[1] || 'png').toLowerCase();
        const ext = tipo === 'jpeg' ? 'jpg' : tipo;
        const ruta = path.join(dir, `firma_${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`);
        fs.writeFileSync(ruta, Buffer.from(String(dataUri).replace(/^data:[^;]+;base64,/, ''), 'base64'));
        return { filename: `firma.${ext}`, path: ruta, cid: CID_FIRMA };
    } catch (e) {
        // Sin firma el correo sale igual. Es peor no mandarlo.
        console.error(`⚠️ [CAMPAÑA] No se pudo preparar la firma: ${e.message}`);
        return null;
    }
};

const borrarAdjuntos = async (rutas) => {
    if (!rutas?.length) return;
    const { default: fs } = await import('node:fs');
    for (const r of rutas) {
        try { fs.unlinkSync(r.path); } catch { /* ya no estaba */ }
    }
};

// Marca el resultado de un destinatario. Nunca lanza: un fallo escribiendo el
// registro no puede cortar el envío que sí está saliendo.
//
// Se apunta por el ID DE LA FILA y no por (campaña, empresa): los destinatarios
// que salen de una planilla no tienen empresa —`empresa_id` va en NULL— y un
// `WHERE empresa_id = NULL` no calza con nada, así que esos envíos se habrían
// quedado en 'pendiente' para siempre aunque hubieran salido bien.
// `proveedorId` es el id que devuelve Resend. Guardarlo es lo que después
// permite preguntarle si el correo fue ENTREGADO o rebotó: sin él, lo único que
// sabemos es que se lo entregamos al proveedor sin error.
const marcarEnvio = async (envioId, estado, motivo, proveedorId = null) => {
    try {
        await pool.query(
            `UPDATE correo_envio
                SET estado = $2, motivo = $3, enviado_at = now(), intentos = intentos + 1,
                    proveedor_id = COALESCE($4, proveedor_id)
              WHERE id = $1`,
            [envioId, estado, motivo ? String(motivo).slice(0, 500) : null,
             proveedorId ? String(proveedorId).slice(0, 120) : null]);
    } catch (e) {
        console.error(`⚠️ [CAMPAÑA] No se pudo registrar el envío: ${e.message}`);
    }
};

// La dirección pública donde el cliente se da de baja. Sale del frontend porque
// es una página que ve una persona, no una llamada de la API.
const urlBajaPara = (correo, org) => {
    const base = (process.env.FRONTEND_URL || 'https://vsv-contadores.vercel.app').replace(/\/$/, '');
    return `${base}/baja?t=${encodeURIComponent(tokenBaja(correo, org))}`;
};

// ----------------------------------------------------------------------------
// VISTA PREVIA · qué recibiría cada empresa. NO manda nada.
// ----------------------------------------------------------------------------
export const previewCampana = async (req, res) => {
    try {
        const { empresaIds, asunto, cuerpo: cuerpoCrudo, filas, columnaCorreo } = req.body || {};
        if (!asunto?.trim()) return res.status(400).json({ success: false, message: 'Falta el asunto.' });
        // `cuerpoVacio` y no `.trim()`: con el editor de formato, un cuerpo en
        // blanco llega como «<p><br></p>», que tiene 12 caracteres y no dice
        // nada. Con `.trim()` pasaba el filtro y se veía una previa vacía.
        if (cuerpoVacio(cuerpoCrudo)) return res.status(400).json({ success: false, message: 'Falta el texto del correo.' });
        const cuerpo = limpiarCuerpo(cuerpoCrudo);
        const enHtml = esHtmlCorreo(cuerpo);

        // ---- Camino PLANILLA: los datos vienen del Excel, no del CRM ----
        if (Array.isArray(filas) && filas.length) {
            const org = req.user?.organizacionId || null;
            const bajas = await bajasDe(org);
            const { destinatarios: brutos, columnas, columnaCorreo: colUsada, sinCorreo } =
                desdePlanilla(filas, columnaCorreo);

            if (!colUsada) {
                return res.status(400).json({
                    success: false,
                    message: 'No encontré ninguna columna con correos. Revisa que la planilla tenga una columna CORREO.',
                    columnas,
                });
            }

            const marcasValidas = new Set(brutos.flatMap(d => Object.keys(d.datos)));
            const malas = [...new Set(
                [asunto, cuerpo].flatMap(t => [...String(t).matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi)].map(m => m[1].toLowerCase()))
            )].filter(m => !marcasValidas.has(m));

            const destinatarios = [];
            const excluidas = [...sinCorreo.map(s => ({ id: `f${s.fila}`, razonSocial: s.etiqueta, motivo: 'sin correo en la planilla' }))];
            for (const d of brutos) {
                const vivos = d.correos.filter(c => !bajas.has(c.toLowerCase()));
                if (!vivos.length) {
                    excluidas.push({ id: `f${d.fila}`, razonSocial: d.etiqueta, motivo: 'pidió no recibir más correos' });
                    continue;
                }
                destinatarios.push({
                    id: `f${d.fila}`, razonSocial: d.etiqueta, correos: vivos,
                    asunto: combinarFila(asunto, d.datos),
                    cuerpo: combinarFila(cuerpo, d.datos, enHtml),
                    datosVacios: [],
                });
            }

            // Direcciones repetidas dentro de la propia planilla.
            const cuenta = new Map();
            for (const d of brutos) for (const c of d.correos) {
                const k = c.toLowerCase();
                cuenta.set(k, [...(cuenta.get(k) || []), d.etiqueta]);
            }
            const repetidos = [...cuenta.entries()].filter(([, v]) => v.length > 1)
                .map(([correo, empresas]) => ({ correo, empresas }));

            return res.json({
                success: true,
                origen: 'planilla',
                columnaCorreo: colUsada,
                // Las marcas disponibles salen de las COLUMNAS de la planilla.
                camposPlanilla: columnas.map(c => ({ marca: normalizarMarca(c), etiqueta: c })),
                remitente: armarRemitente(await perfilDe(req.user?.usuarioId)),
                total: destinatarios.length,
                totalExcluidas: excluidas.length,
                destinatarios, excluidas,
                conDatosVacios: [], totalConDatosVacios: 0,
                repetidos, totalRepetidos: repetidos.length,
                marcasDesconocidas: malas,
                cuota: await cuotaDelDia(org),
            });
        }

        const empresas = await empresasDe(empresaIds, req.user?.organizacionId);
        if (!empresas.length) {
            return res.status(400).json({ success: false, message: 'No se encontró ninguna de las empresas seleccionadas.' });
        }

        const usadas = marcasUsadas(asunto, cuerpo);
        const bajas = await bajasDe(req.user?.organizacionId);
        const destinatarios = [];
        const excluidas = [];
        const conDatosVacios = [];

        // El MISMO correo en varias empresas  ·  RF-CO-11
        // Pasa con los contadores que llevan dos o tres sociedades del mismo
        // dueño. Esa persona recibiría el mismo correo dos veces, con datos
        // distintos, y desde afuera se ve como si el sistema estuviera fallando.
        const vecesPorCorreo = new Map();
        for (const e of empresas) {
            for (const c of correosDe(e)) {
                const k = c.toLowerCase();
                if (!vecesPorCorreo.has(k)) vecesPorCorreo.set(k, []);
                vecesPorCorreo.get(k).push(e.razon_social);
            }
        }
        const repetidos = [...vecesPorCorreo.entries()]
            .filter(([, empresas]) => empresas.length > 1)
            .map(([correo, empresas]) => ({ correo, empresas }));

        for (const e of empresas) {
            // Se descarta lo dado de baja ANTES de contar: si el único correo de
            // una empresa está de baja, esa empresa no recibe nada.
            const correos = correosDe(e).filter(c => !bajas.has(c.toLowerCase()));
            if (!correos.length) {
                const teniaAlguno = correosDe(e).length > 0;
                excluidas.push({
                    id: e.id, razonSocial: e.razon_social,
                    motivo: teniaAlguno ? 'pidió no recibir más correos' : 'sin correo válido en la ficha',
                });
                continue;
            }
            const flojos = datosVacios(e, usadas);
            if (flojos.length) {
                conDatosVacios.push({ id: e.id, razonSocial: e.razon_social, campos: flojos });
            }
            destinatarios.push({
                id: e.id,
                razonSocial: e.razon_social,
                correos,
                asunto: combinar(asunto, e),
                cuerpo: combinar(cuerpo, e, enHtml),
                datosVacios: flojos,
            });
        }

        return res.json({
            success: true,
            // El de QUIEN está redactando, no uno fijo para todos.
            remitente: armarRemitente(await perfilDe(req.user?.usuarioId)),
            total: destinatarios.length,
            totalExcluidas: excluidas.length,
            destinatarios,
            excluidas,
            // Las que recibirían el correo con un dato en blanco o en cero.
            conDatosVacios,
            totalConDatosVacios: conDatosVacios.length,
            // Direcciones que aparecen en más de una empresa: esa persona
            // recibiría el mismo correo repetido.
            repetidos,
            totalRepetidos: repetidos.length,
            // Cuántos se pueden mandar hoy todavía. Va en la previa para que se
            // vea ANTES de apretar, no en el error después.
            cuota: await cuotaDelDia(req.user?.organizacionId),
            // Marcas mal escritas. La pantalla las muestra en rojo: es el error
            // más común y el único que no se nota leyendo el texto en crudo.
            marcasDesconocidas: marcasDesconocidas(asunto, cuerpo),
        });
    } catch (error) {
        console.error('❌ Error en la vista previa de la campaña:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo calcular la vista previa.' });
    }
};

// ============================================================================
// PLANTILLAS
// ----------------------------------------------------------------------------
// Se guardan CON las marcas sin resolver. Resolverlas al guardar las congelaría
// con los datos del día en que se escribió la plantilla, que es justo lo que se
// quiere evitar: la gracia es que el monto salga del plan que el cliente tiene
// HOY, no del que tenía cuando alguien redactó el texto.
//
// Viven en la base y no en el navegador porque las escribe quien redacta bien y
// las usa el resto del equipo.
// ============================================================================
const mapPlantilla = (p) => ({
    id: p.id,
    nombre: p.nombre,
    descripcion: p.descripcion,
    asunto: p.asunto,
    cuerpo: p.cuerpo,
    firma: p.firma,
    firmaImagen: p.firma_imagen || null,
    vecesUsada: p.veces_usada ?? 0,
    usadaAt: p.usada_at,
    autor: p.autor || null,
    // NULL = la ve todo el equipo. Con dueño = solo esa persona.
    compartida: p.usuario_id === null,
    esMia: p.usuario_id !== null,
});

export const listarPlantillasCorreo = async (req, res) => {
    try {
        // Las suyas + las del equipo. Las de OTRA persona no se ven: si Victor
        // arma sus plantillas de contabilidad, no tienen por qué aparecerle a
        // Mati mezcladas con las suyas.
        const { rows } = await pool.query(
            `SELECT p.*, u.nombre AS autor
               FROM correo_plantilla p
               LEFT JOIN usuario u ON u.id = p.creado_por
              WHERE p.organizacion_id IS NOT DISTINCT FROM $1::uuid
                AND (p.usuario_id IS NULL OR p.usuario_id = $2)
              ORDER BY p.usuario_id NULLS LAST, p.veces_usada DESC, LOWER(p.nombre) ASC`,
            [req.user?.organizacionId || null, req.user?.usuarioId || null]
        );
        return res.json({ success: true, plantillas: rows.map(mapPlantilla) });
    } catch (error) {
        console.error('❌ Error listando plantillas de correo:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudieron cargar las plantillas.' });
    }
};

export const guardarPlantillaCorreo = async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, descripcion, asunto, cuerpo: cuerpoCrudo, firma, firmaImagen,
                compartida, marcasExtra } = req.body || {};
        if (!nombre?.trim())  return res.status(400).json({ success: false, message: 'Falta el nombre de la plantilla.' });
        if (!asunto?.trim())  return res.status(400).json({ success: false, message: 'Falta el asunto.' });
        if (cuerpoVacio(cuerpoCrudo)) return res.status(400).json({ success: false, message: 'Falta el texto.' });

        // Se guarda ya saneado: esta plantilla se va a mostrar en la pantalla de
        // Plantillas y se va a cargar en el redactor, los dos con formato. Lo que
        // queda en la base tiene que ser seguro de renderizar.
        const cuerpo = limpiarCuerpo(cuerpoCrudo);

        // Una marca inventada guardada en la plantilla se repite en cada envío
        // que la use. Se corta acá, que es donde se escribe una sola vez.
        //
        // `marcasExtra` son las columnas de la planilla con la que se está
        // trabajando. Sin esto, guardar la plantilla del F29 —que usa
        // {{impuesto_a_pagar}} y compañía— se rechazaba: esas marcas no existen
        // en el CRM, existen en el Excel. Se sigue avisando de las de verdad mal
        // escritas, que es para lo que está la revisión.
        const conocidasExtra = new Set(
            (Array.isArray(marcasExtra) ? marcasExtra : []).map(normalizarMarca));
        const malas = marcasDesconocidas(asunto, cuerpo)
            .filter(m => !conocidasExtra.has(normalizarMarca(m)));
        if (malas.length) {
            return res.status(400).json({
                success: false,
                message: `Estos datos no existen: ${malas.map(m => `{{${m}}}`).join(', ')}. Corrígelos antes de guardar.`,
            });
        }

        if (firmaImagen && !imagenValida(firmaImagen)) {
            return res.status(400).json({ success: false, message: 'La imagen de la firma no es válida.' });
        }

        // Por omisión la plantilla es PROPIA. Compartirla con el equipo es una
        // decisión explícita: lo que uno escribe para su día a día no tiene por
        // qué aparecerle a los demás.
        const dueño = compartida ? null : (req.user?.usuarioId || null);

        const valores = [
            req.user?.organizacionId || null,
            nombre.trim().slice(0, 120),
            descripcion?.trim() || null,
            asunto.trim().slice(0, 300),
            cuerpo.trim(),
            firma?.trim() || null,
            firmaImagen || null,
            dueño,
        ];

        const { rows } = id
            ? await pool.query(
                `UPDATE correo_plantilla
                    SET nombre=$2, descripcion=$3, asunto=$4, cuerpo=$5, firma=$6,
                        firma_imagen=$7, usuario_id=$8
                  WHERE id=$9 AND organizacion_id IS NOT DISTINCT FROM $1::uuid
                    -- Solo se puede editar la propia o una del equipo. La de otra
                    -- persona no aparece en la lista, pero el id podría escribirse
                    -- a mano; el candado que vale es este.
                    AND (usuario_id IS NULL OR usuario_id = $10)
                  RETURNING id`,
                [...valores, id, req.user?.usuarioId || null])
            : await pool.query(
                `INSERT INTO correo_plantilla
                    (organizacion_id, nombre, descripcion, asunto, cuerpo, firma,
                     firma_imagen, usuario_id, creado_por)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
                [...valores, req.user?.usuarioId || null]);

        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Plantilla no encontrada.' });

        await registrar(req, {
            modulo: 'correos', accion: id ? 'editar' : 'crear',
            entidad: 'plantilla_correo', entidadId: rows[0].id,
            descripcion: `${id ? 'Editó' : 'Creó'} la plantilla de correo «${nombre.trim()}»`,
        });
        return res.json({ success: true, plantillaId: rows[0].id });
    } catch (error) {
        // 23505 = el índice único del nombre. Es un choque, no una falla: hay que
        // decir qué pasó y no devolver un error genérico.
        if (error.code === '23505') {
            return res.status(409).json({ success: false, message: 'Ya existe una plantilla con ese nombre.' });
        }
        console.error('❌ Error guardando la plantilla de correo:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo guardar la plantilla.' });
    }
};

export const eliminarPlantillaCorreo = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `DELETE FROM correo_plantilla
              WHERE id=$1 AND organizacion_id IS NOT DISTINCT FROM $2::uuid
                -- La propia o una del equipo; la de otra persona, no.
                AND (usuario_id IS NULL OR usuario_id = $3)
              RETURNING nombre`,
            [req.params.id, req.user?.organizacionId || null, req.user?.usuarioId || null]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Plantilla no encontrada.' });
        await registrar(req, {
            modulo: 'correos', accion: 'eliminar', entidad: 'plantilla_correo', entidadId: req.params.id,
            descripcion: `Eliminó la plantilla de correo «${rows[0].nombre}»`,
        });
        return res.json({ success: true });
    } catch (error) {
        console.error('❌ Error eliminando la plantilla de correo:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo eliminar la plantilla.' });
    }
};

// ----------------------------------------------------------------------------
// AVANCE · vive en memoria, como el resto de los procesos largos del sistema
// ----------------------------------------------------------------------------
export const estadoCampana = {
    activo: false, total: 0, actual: 0, enviados: 0, fallidos: 0,
    empresaActual: null, finalizado: false, errores: [], iniciadoPor: null,
    iniciadoPorId: null, organizacionId: null, soloPrueba: false, iniciadoAt: null,
    campanaId: null,
    // Bandera de pánico: la pone `detenerCampana` y el bucle la mira antes de
    // cada correo. No se puede "matar" un for a la fuerza; sí se le puede pedir
    // que no siga.
    detener: false,
};

export const progresoCampana = (_req, res) => res.json(estadoCampana);

// ============================================================================
// CAMPAÑAS ZOMBI · se llama al arrancar el servidor
// ----------------------------------------------------------------------------
// `estadoCampana` vive en MEMORIA y se borra al reiniciar. La base, en cambio,
// se queda con la campaña en 'enviando' y sus destinatarios en 'pendiente'
// PARA SIEMPRE, porque nadie los volvía a mirar.
//
// No es hipotético: **cada deploy reinicia el servidor**. Si alguien está
// mandando en ese momento, queda esa inconsistencia — y en la dirección más
// confusa: la pantalla deja empezar otra campaña (en memoria no hay nada
// activo) mientras la base dice que hay una corriendo. El registro que existe
// justamente para poder confiar en él terminaría mintiendo.
//
// Al arrancar se cierran esas campañas. Lo que YA salió queda como 'enviado' y
// no se toca: esos correos se mandaron de verdad. Lo que quedó 'pendiente' se
// marca 'omitido' diciendo por qué, que es lo que después permite reintentar
// solo esos sin volver a escribirle a quien ya recibió.
export const cerrarCampanasZombi = async () => {
    try {
        const { rows: campanas } = await pool.query(
            `UPDATE correo_campana
                SET estado = 'fallida', terminada_at = now()
              WHERE estado = 'enviando'
              RETURNING id, asunto, total, enviados`);
        if (campanas.length === 0) return;

        const { rowCount: sueltos } = await pool.query(
            `UPDATE correo_envio
                SET estado = 'omitido',
                    motivo = 'El servidor se reinició antes de enviarlo (probablemente un despliegue).'
              WHERE estado = 'pendiente'
                AND campana_id = ANY($1::uuid[])`,
            [campanas.map(c => c.id)]);

        console.warn(
            `⚠️  [CORREO] ${campanas.length} campaña(s) quedaron a medias por un reinicio. ` +
            `Cerradas. ${sueltos} destinatario(s) no alcanzaron a recibirla:`);
        for (const c of campanas) {
            console.warn(`     · «${String(c.asunto).slice(0, 50)}» — salieron ${c.enviados} de ${c.total}`);
        }
    } catch (e) {
        // No puede impedir que el servidor arranque: es limpieza, no arranque.
        console.error('⚠️  [CORREO] No se pudieron cerrar las campañas a medias:', e.message);
    }
};

// ----------------------------------------------------------------------------
// DETENER a medio camino  ·  RF-CO-40
// ----------------------------------------------------------------------------
// Lo que ya salió, salió: el correo no se puede volver atrás. Esto corta lo que
// FALTA, que es lo único que todavía se puede evitar.
export const detenerCampanaController = async (req, res) => {
    if (!estadoCampana.activo) {
        return res.status(409).json({ success: false, message: 'No hay ningún envío en curso.' });
    }
    estadoCampana.detener = true;
    console.log(`🛑 [CAMPAÑA] Detención pedida por ${req.user?.nombre || 'alguien'}.`);
    await registrar(req, {
        modulo: 'correos', accion: 'detener', entidad: 'campana', entidadId: estadoCampana.campanaId,
        descripcion: `Detuvo el envío en ${estadoCampana.actual}/${estadoCampana.total}`,
    });
    return res.json({
        success: true,
        message: `Se detiene después del que está en curso. Ya salieron ${estadoCampana.enviados}.`,
    });
};

// ----------------------------------------------------------------------------
// HISTORIAL  ·  RF-CO-65
// ----------------------------------------------------------------------------
export const historialCampanas = async (req, res) => {
    try {
        // Las pruebas gastan cuota pero NO son campañas: nadie quiere ver 40
        // envíos a su propia casilla mezclados con lo que salió a clientes, así
        // que por omisión no aparecen.
        //
        // Se pueden pedir igual, y hace falta: mientras se está preparando algo
        // TODO lo enviado son pruebas, y sin esto la pantalla se ve vacía como
        // si estuviera rota. Vienen marcadas con `es_prueba` para no confundir.
        const conPruebas = req.query?.pruebas === '1';
        const { rows } = await pool.query(
            `SELECT c.id, c.asunto, c.estado, c.total, c.enviados, c.fallidos,
                    c.remitente, c.created_at, c.terminada_at, c.es_prueba,
                    u.nombre AS autor
               FROM correo_campana c
               LEFT JOIN usuario u ON u.id = c.enviado_por
              WHERE c.organizacion_id IS NOT DISTINCT FROM $1::uuid
                AND (c.es_prueba = false OR $2 = true)
              ORDER BY c.created_at DESC
              LIMIT 50`,
            [req.user?.organizacionId || null, conPruebas]);
        return res.json({ success: true, campanas: rows });
    } catch (error) {
        console.error('❌ Error leyendo el historial:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo cargar el historial.' });
    }
};

// El detalle de una campaña: a quién le llegó y a quién no.
export const detalleCampana = async (req, res) => {
    try {
        const { rows } = await pool.query(
            // Va el `cuerpo_final` porque es lo que responde la pregunta que
            // motivó todo el registro: «¿qué decía EXACTAMENTE el correo que le
            // llegó?». Reconstruirlo hoy con la plantilla daría otro texto: el
            // plan del cliente, o las cifras del mes, pudieron cambiar.
            `SELECT e.razon_social, e.destinatario, e.estado, e.motivo, e.enviado_at,
                    e.asunto_final, e.cuerpo_final
               FROM correo_envio e
               JOIN correo_campana c ON c.id = e.campana_id
              WHERE e.campana_id = $1
                AND c.organizacion_id IS NOT DISTINCT FROM $2::uuid
              ORDER BY e.estado, e.razon_social`,
            [req.params.id, req.user?.organizacionId || null]);
        return res.json({ success: true, envios: rows });
    } catch (error) {
        console.error('❌ Error leyendo el detalle:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo cargar el detalle.' });
    }
};

// ----------------------------------------------------------------------------
// «¿LE LLEGÓ A ESTE CLIENTE?»  ·  RF-CO-64
// ----------------------------------------------------------------------------
// La pregunta que motivó todo el registro. Se consulta por empresa.
export const enviosDeEmpresa = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT e.destinatario, e.asunto_final, e.estado, e.motivo, e.enviado_at,
                    u.nombre AS autor
               FROM correo_envio e
               LEFT JOIN correo_campana c ON c.id = e.campana_id
               LEFT JOIN usuario u ON u.id = c.enviado_por
              WHERE e.empresa_id = $1
                AND e.organizacion_id IS NOT DISTINCT FROM $2::uuid
              ORDER BY e.created_at DESC
              LIMIT 30`,
            [req.params.empresaId, req.user?.organizacionId || null]);
        return res.json({ success: true, envios: rows });
    } catch (error) {
        console.error('❌ Error leyendo los envíos de la empresa:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudo cargar.' });
    }
};

// ----------------------------------------------------------------------------
// QUIÉNES DEBEN  ·  para no buscarlos a mano entre toda la cartera
// ----------------------------------------------------------------------------
// El correo de cobranza va a un puñado de empresas, no a la cartera entera.
// Elegirlas a mano en una lista de 137 es donde se cuela el error caro: mandarle
// «su factura está impaga» a alguien que ya pagó.
//
// Devuelve los ids para que la pantalla los marque de una, con cuánto debe cada
// una, que es lo que permite revisar antes de apretar.
export const empresasConImpaga = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT e.id, e.razon_social,
                    count(cm.id)::int              AS facturas,
                    sum(cm.monto_facturado)::float AS total,
                    min(cm.fecha_vencimiento)      AS vence_primera
               FROM empresa e
               JOIN cobro_mensual cm ON cm.empresa_id = e.id AND cm.estado = 'PENDIENTE_PAGO'
              WHERE e.organizacion_id IS NOT DISTINCT FROM $1::uuid
              GROUP BY e.id, e.razon_social
              ORDER BY min(cm.fecha_vencimiento) ASC NULLS LAST`,
            [req.user?.organizacionId || null]);
        return res.json({ success: true, empresas: rows });
    } catch (error) {
        console.error('❌ Error buscando las facturas impagas:', error.message);
        return res.status(500).json({ success: false, message: 'No se pudieron cargar las facturas impagas.' });
    }
};

// ----------------------------------------------------------------------------
// BAJAS  ·  RL-CO-01 / RL-CO-02
// ----------------------------------------------------------------------------
export const listarBajas = async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT correo, motivo, origen, created_at FROM correo_baja
              WHERE organizacion_id IS NOT DISTINCT FROM $1::uuid
              ORDER BY created_at DESC`, [req.user?.organizacionId || null]);
        return res.json({ success: true, bajas: rows });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'No se pudieron cargar las bajas.' });
    }
};

// Volver a suscribir a alguien: solo a mano y desde adentro, nunca desde el
// enlace del correo. Darse de baja tiene que ser fácil; volver, deliberado.
export const quitarBaja = async (req, res) => {
    try {
        await pool.query(
            `DELETE FROM correo_baja
              WHERE lower(correo) = lower($1) AND organizacion_id IS NOT DISTINCT FROM $2::uuid`,
            [req.body?.correo || '', req.user?.organizacionId || null]);
        await registrar(req, {
            modulo: 'correos', accion: 'editar', entidad: 'baja_correo', entidadId: null,
            descripcion: `Reactivó los correos para ${req.body?.correo}`,
        });
        return res.json({ success: true });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'No se pudo reactivar.' });
    }
};

// ----------------------------------------------------------------------------
// ENVIAR
// ----------------------------------------------------------------------------
export const enviarCampana = async (req, res) => {
    try {
        const {
            empresaIds, asunto, cuerpo: cuerpoCrudo, firma, firmaImagen, soloPrueba, plantillaId,
            adjuntos, correoPrueba, filas, columnaCorreo,
        } = req.body || {};

        // El cuerpo se limpia ACÁ, antes de todo lo demás: de aquí en adelante
        // se guarda en `correo_campana`, se combina por destinatario, se guarda
        // otra vez en `correo_envio` y se muestra en el historial. Sanearlo en
        // un solo punto de entrada evita tener que acordarse en los otros
        // cuatro.
        const cuerpo = limpiarCuerpo(cuerpoCrudo);
        const enHtml = esHtmlCorreo(cuerpo);

        // Quién manda y con qué firma. Si no vino firma en el cuerpo de la
        // petición, se usa la suya guardada: así no hay que reescribirla cada vez.
        const perfil = await perfilDe(req.user?.usuarioId);
        const remitente = armarRemitente(perfil);
        const firmaFinal = firma !== undefined ? firma : (perfil?.firma_texto || '');
        const firmaImgFinal = firmaImagen !== undefined ? firmaImagen : (perfil?.firma_imagen || null);

        // A DÓNDE CONTESTA EL CLIENTE.
        // El correo sale desde @vsvconsultores.com porque es el dominio verificado
        // y es lo que el cliente tiene que ver. Pero ese buzón vive en el hosting
        // y nadie lo abre: sin `Reply-To`, las respuestas caían ahí y se perdían
        // sin error ni rebote.
        const responderA = perfil?.correo_respuesta || null;

        // COPIA OCULTA a la casilla de archivo, para que el envío quede también
        // en el correo y no solo en la pantalla de Enviados. NO va en las
        // pruebas: esas ya llegan a esa misma casilla y solo gastarían cuota.
        const destinoCopia = perfil?.correo_copia || perfil?.correo_respuesta || null;
        const copiaA = (perfil?.copia_oculta && destinoCopia && !soloPrueba) ? destinoCopia : null;

        if (!correoConfigurado()) {
            return res.status(503).json({ success: false, message: 'Este servidor no tiene ninguna vía de correo configurada.' });
        }
        if (!asunto?.trim() || cuerpoVacio(cuerpo)) {
            return res.status(400).json({ success: false, message: 'Falta el asunto o el texto.' });
        }
        if (estadoCampana.activo) {
            return res.status(409).json({ success: false, message: 'Ya hay un envío en curso. Espera a que termine.' });
        }
        const problemaAdjuntos = validarAdjuntos(adjuntos);
        if (problemaAdjuntos) {
            return res.status(400).json({ success: false, message: problemaAdjuntos });
        }

        const org = req.user?.organizacionId || null;

        // Se respeta a quien pidió no recibir más. Va acá, en el servidor, y no
        // en la pantalla: es la única forma de que no se salte por descuido.
        const bajas = await bajasDe(org);

        // ------------------------------------------------------------------
        // A QUIÉN · dos orígenes, un solo formato
        // ------------------------------------------------------------------
        // Los datos pueden venir del CRM (los `empresaIds` de siempre) o de una
        // planilla (las `filas` del Excel). Se normalizan acá a la misma forma
        // —quién, a qué correos, con qué asunto y qué texto ya resueltos— para
        // que de esta línea hacia abajo el envío no sepa ni tenga que saber de
        // dónde salieron. Un `if` por origen dentro del bucle habría significado
        // dos caminos que se van separando con cada arreglo.
        const desdeExcel = Array.isArray(filas) && filas.length > 0;
        let conCorreo = [];

        if (desdeExcel) {
            const { destinatarios, columnaCorreo: colUsada } = desdePlanilla(filas, columnaCorreo);
            if (!colUsada) {
                return res.status(400).json({
                    success: false,
                    message: 'No encontré ninguna columna con correos en la planilla.',
                });
            }
            conCorreo = destinatarios
                .map(d => ({
                    empresaId: null,                  // no está en el CRM: es una fila del Excel
                    razonSocial: d.etiqueta,
                    correos: d.correos.filter(c => !bajas.has(c.toLowerCase())),
                    asuntoFinal: combinarFila(asunto, d.datos),
                    cuerpoFinal: combinarFila(cuerpo, d.datos, enHtml),
                }))
                .filter(d => d.correos.length > 0);
        } else {
            const empresas = await empresasDe(empresaIds, org);
            conCorreo = empresas
                .map(e => ({
                    empresaId: e.id,
                    razonSocial: e.razon_social,
                    correos: correosDe(e).filter(c => !bajas.has(c.toLowerCase())),
                    asuntoFinal: combinar(asunto, e),
                    cuerpoFinal: combinar(cuerpo, e, enHtml),
                }))
                .filter(e => e.correos.length > 0);
        }

        if (!conCorreo.length) {
            return res.status(400).json({
                success: false,
                message: desdeExcel
                    ? 'Ninguna fila de la planilla tiene un correo al que se pueda escribir (sin correo, o dado de baja).'
                    : 'Ninguna de las empresas seleccionadas tiene un correo al que se pueda escribir (sin correo, o dado de baja).',
            });
        }

        // ¿Esto mismo ya se mandó hace poco?  ·  RF-CO-43
        // Media hora es el rato en que uno duda de si apretó o no, y vuelve a
        // apretar. Más allá de eso, repetir suele ser a propósito.
        // Desde una planilla no hay ids de empresa, así que la huella se arma con
        // las direcciones: es lo que identifica el mismo envío a la misma gente.
        const huella = huellaDe(asunto, cuerpo,
            desdeExcel ? conCorreo.flatMap(d => d.correos) : empresaIds);
        if (!soloPrueba) {
            const { rows: repe } = await pool.query(
                `SELECT id, created_at, enviados FROM correo_campana
                  WHERE huella = $1 AND organizacion_id IS NOT DISTINCT FROM $2::uuid
                    AND created_at > now() - interval '30 minutes'
                    AND estado <> 'detenida'
                  ORDER BY created_at DESC LIMIT 1`, [huella, org]);
            if (repe.length && !req.body?.confirmarRepetida) {
                const hace = Math.round((Date.now() - new Date(repe[0].created_at)) / 60000);
                return res.status(409).json({
                    success: false,
                    repetida: true,
                    message: `Este mismo correo, a las mismas empresas, ya se envió hace ${hace} minuto(s) `
                           + `(${repe[0].enviados} salieron). Si de verdad quieres repetirlo, vuelve a confirmar.`,
                });
            }
        }

        // MODO PRUEBA: se arma todo igual —con los datos reales de la primera
        // empresa— pero se manda a la casilla interna. Es la forma de ver cómo
        // se ve de verdad en un cliente de correo antes de escribirle a 200.
        // La prueba se puede dirigir a otra casilla —para verla en Outlook, o
        // mandársela a un compañero— pero por omisión sigue siendo la interna.
        const destinoPrueba = (correoPrueba && CORREO_VALIDO.test(String(correoPrueba).trim()))
            ? String(correoPrueba).trim()
            : 'felipe.veram2001@gmail.com';

        // La cuota del día. No se bloquea el envío: se avisa y se pide confirmar,
        // porque el tope configurado puede no ser el real del plan y no tiene
        // sentido impedir trabajar por una suposición nuestra. Lo que sí se
        // evita es que se descubra a mitad de camino.
        const cuota = await cuotaDelDia(org);
        const gasto = conCorreo.length;
        if (!soloPrueba && gasto > cuota.quedan && !req.body?.confirmarCuota) {
            return res.status(409).json({
                success: false,
                excedeCuota: true,
                cuota,
                message: `Hoy ya salieron ${cuota.enviados} de ${cuota.limite} correos, así que quedan ${cuota.quedan}. `
                       + `Esta campaña son ${conCorreo.length}`
                       + `: se pasaría por ${gasto - cuota.quedan}. `
                       + `Los que sobren los va a rechazar el proveedor.`,
            });
        }

        const lista = soloPrueba ? conCorreo.slice(0, 1) : conCorreo;

        // La campaña queda registrada ANTES de mandar el primero: si el servidor
        // se cae a media corrida, al menos se sabe qué se estaba enviando y a
        // quiénes ya les había llegado.
        // Las PRUEBAS también se registran, marcadas con `es_prueba`. Antes no
        // se guardaban y por eso el contador diario no las veía, aunque el
        // proveedor sí las cobraba contra el tope. La marca hace que la cuota
        // las cuente y que el historial no las muestre.
        const { rows: c } = await pool.query(
            `INSERT INTO correo_campana
                (organizacion_id, asunto, cuerpo, firma, firma_imagen, remitente,
                 plantilla_id, estado, total, huella, enviado_por, es_prueba)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'enviando',$8,$9,$10,$11) RETURNING id`,
            [org, asunto.trim().slice(0, 300), cuerpo, firmaFinal, firmaImgFinal, remitente,
             plantillaId || null, lista.length,
             // Sin huella en las pruebas: si no, probar dos veces el mismo texto
             // dispararía el aviso de «campaña repetida».
             soloPrueba ? null : huella,
             req.user?.usuarioId || null, !!soloPrueba]);
        const campanaId = c[0].id;

        // Una fila por destinatario, en `pendiente`. Se van marcando al pasar.
        // Se guarda el id que devuelve cada INSERT porque es con eso que después
        // se marca el resultado: los destinatarios de una planilla no tienen
        // `empresa_id` y no habría otra forma de volver a encontrar su fila.
        for (const d of lista) {
            const { rows: env } = await pool.query(
                `INSERT INTO correo_envio
                    (campana_id, organizacion_id, empresa_id, razon_social, destinatario,
                     asunto_final, cuerpo_final, es_prueba, con_copia)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
                [campanaId, org, d.empresaId, d.razonSocial,
                 soloPrueba ? destinoPrueba : d.correos.join(', '),
                 d.asuntoFinal.slice(0, 300), d.cuerpoFinal, !!soloPrueba, !!copiaA]);
            d.envioId = env[0].id;
        }

        Object.assign(estadoCampana, {
            activo: true, total: lista.length, actual: 0,
            enviados: 0, fallidos: 0, empresaActual: null, finalizado: false, errores: [],
            iniciadoPor: req.user?.nombre || null, iniciadoAt: new Date().toISOString(),
            // Quién lo lanzó, para avisarle en la campana cuando termine. El envío
            // corre en el servidor y sigue aunque se cierre el navegador, así que
            // el aviso en pantalla no alcanza: si la persona se fue a otra cosa,
            // nunca se entera de cuántos salieron ni de si algo falló.
            iniciadoPorId: req.user?.usuarioId || null,
            organizacionId: req.user?.organizacionId || null,
            // La pantalla lo necesita para saber si vaciar el formulario al
            // terminar: una PRUEBA no debe borrar el correo que se está revisando.
            soloPrueba: !!soloPrueba,
            campanaId, detener: false,
        });

        res.json({
            success: true,
            total: estadoCampana.total,
            mensaje: soloPrueba
                ? `Correo de prueba en camino a ${destinoPrueba}.`
                : `Enviando a ${conCorreo.length} ${desdeExcel ? 'destinatario(s) de la planilla' : 'empresa(s)'} en segundo plano.`,
        });

        // La cuenta sube solo con el envío de verdad: si contara las pruebas,
        // «usada 40 veces» diría cuánto se ensayó, no cuánto sirvió.
        if (plantillaId && !soloPrueba) {
            pool.query(
                `UPDATE correo_plantilla SET veces_usada = veces_usada + 1, usada_at = NOW()
                  WHERE id = $1 AND organizacion_id IS NOT DISTINCT FROM $2::uuid`,
                [plantillaId, req.user?.organizacionId || null]
            ).catch(e => console.error('No se pudo contar el uso de la plantilla:', e.message));
        }

        await registrar(req, {
            modulo: 'correos', accion: soloPrueba ? 'campana_prueba' : 'campana_envio',
            entidad: 'campana', entidadId: null,
            descripcion: soloPrueba
                ? `Prueba de campaña «${asunto.slice(0, 60)}»`
                : `Campaña «${asunto.slice(0, 60)}» a ${conCorreo.length} `
                  + `${desdeExcel ? 'destinatarios desde planilla' : 'empresas'}`,
        });

        // ---- el envío propiamente tal, ya con la respuesta entregada ----
        (async () => {
            // Los adjuntos se escriben UNA vez en disco y se reusan para todos:
            // la cascada de envío los lee por ruta de archivo, y volver a
            // escribirlos por destinatario sería 130 veces el mismo trabajo.
            const rutasTemp = await guardarAdjuntos(adjuntos);
            // La firma se suma a los adjuntos, pero con `cid`: el cliente la
            // muestra dentro del correo en vez de listarla como archivo.
            const firmaAdj = await guardarFirmaInline(firmaImgFinal);
            const paraEnviar = firmaAdj ? [...rutasTemp, firmaAdj] : rutasTemp;

            try {
                for (const d of lista) {
                    if (estadoCampana.detener) {
                        console.log('🛑 [CAMPAÑA] Detenida por pedido del usuario.');
                        break;
                    }
                    estadoCampana.actual++;
                    estadoCampana.empresaActual = d.razonSocial;

                    const destino = soloPrueba ? destinoPrueba : d.correos.join(', ');
                    // Se guarda en una variable en vez de pasarlo en línea: el
                    // proveedor anota SOBRE este objeto el id del correo, y hay
                    // que poder leerlo después para registrarlo.
                    const opciones = {
                            // Sale desde la dirección de quien lo mandó, no desde una
                            // fija: si el cliente responde, le responde a esa persona.
                            from: remitente,
                            // Sin esto la respuesta del cliente va al buzón del
                            // hosting, que no lee nadie.
                            ...(responderA ? { replyTo: responderA } : {}),
                            ...(copiaA ? { bcc: copiaA } : {}),
                            to: destino,
                            // El texto ya viene resuelto de arriba, el MISMO que se
                            // guardó en `correo_envio`. Volver a combinarlo acá abría
                            // la puerta a que lo enviado y lo registrado difirieran.
                            subject: soloPrueba ? `[PRUEBA] ${d.asuntoFinal}` : d.asuntoFinal,
                            // El enlace de baja NO va en la prueba: daría de baja
                            // a la casilla interna y dejaría de recibir pruebas.
                            html: armarHtml(
                                d.cuerpoFinal, firmaFinal, firmaImgFinal,
                                soloPrueba ? null : urlBajaPara(d.correos[0], org)
                            ),
                            ...(paraEnviar.length ? { attachments: paraEnviar } : {}),
                    };
                    try {
                        await enviarCorreo(opciones);
                        estadoCampana.enviados++;
                        await marcarEnvio(d.envioId, 'enviado', null, opciones.proveedorId);
                    } catch (err) {
                        estadoCampana.fallidos++;
                        estadoCampana.errores.push({ razonSocial: d.razonSocial, error: err.message });
                        console.error(`❌ [CAMPAÑA] ${d.razonSocial}: ${err.message}`);
                        await marcarEnvio(d.envioId, 'fallido', err.message);
                    }
                    // Un respiro entre correos: Resend limita las peticiones por
                    // segundo, y 200 seguidas sin pausa empiezan a rebotar.
                    await new Promise(r => setTimeout(r, 600));
                }
            } finally {
                await borrarAdjuntos(paraEnviar);
            }

            await pool.query(
                `UPDATE correo_campana
                    SET estado = $2, enviados = $3, fallidos = $4, terminada_at = now()
                  WHERE id = $1`,
                [campanaId, estadoCampana.detener ? 'detenida' : 'terminada',
                 estadoCampana.enviados, estadoCampana.fallidos]).catch(() => {});
            estadoCampana.activo = false;
            estadoCampana.finalizado = true;
            estadoCampana.empresaActual = null;
            console.log(`✅ [CAMPAÑA] ${estadoCampana.detener ? 'DETENIDA' : 'Terminada'}. `
                + `Enviados: ${estadoCampana.enviados} · Fallidos: ${estadoCampana.fallidos}`);

            // AVISO EN LA CAMPANA · pedido de la subtarea NOTIFICACIÓN.
            //
            // El envío corre en el servidor y puede tardar minutos: quien lo lanzó
            // se va a hacer otra cosa y el mensajito en pantalla se pierde con el
            // cambio de página. Acá queda un aviso permanente con el resultado.
            //
            // Va SIN `actor` a propósito: `notificar()` descarta el aviso cuando el
            // actor es el mismo destinatario, y justamente hay que avisarle a quien
            // lo lanzó.
            const { enviados, fallidos, detener } = estadoCampana;
            // Una prueba es un correo a uno mismo para revisar cómo quedó: no
            // merece un aviso en la campana.
            if (!estadoCampana.soloPrueba) await notificar({
                para: estadoCampana.iniciadoPorId,
                organizacionId: estadoCampana.organizacionId,
                tipo: 'correo_masivo',
                titulo: detener
                    ? `Envío detenido · ${enviados} enviados`
                    : fallidos > 0
                        ? `Envío terminado con ${fallidos} ${fallidos === 1 ? 'fallo' : 'fallos'}`
                        : `Envío terminado · ${enviados} ${enviados === 1 ? 'correo' : 'correos'}`,
                descripcion: fallidos > 0
                    ? `Salieron ${enviados} y fallaron ${fallidos}. Revisa el detalle en Enviados.`
                    : `Salieron los ${enviados} correos sin problemas.`,
                entidad: 'correo_campana', entidadId: campanaId,
            });
        })().catch(async err => {
            estadoCampana.activo = false;
            estadoCampana.finalizado = true;
            console.error('❌ [CAMPAÑA] Se cortó:', err.message);
            if (campanaId) {
                await pool.query(`UPDATE correo_campana SET estado='fallida', terminada_at=now() WHERE id=$1`,
                    [campanaId]).catch(() => {});
            }
            // Que se corte a mitad es JUSTAMENTE lo que hay que avisar: sin esto,
            // el envío moría en silencio y solo se notaba al ver que no llegó nada.
            await notificar({
                para: estadoCampana.iniciadoPorId,
                organizacionId: estadoCampana.organizacionId,
                tipo: 'correo_masivo',
                titulo: 'El envío masivo se cortó',
                descripcion: `Alcanzaron a salir ${estadoCampana.enviados}. Motivo: ${err.message}`,
                entidad: 'correo_campana', entidadId: campanaId,
            }).catch(() => { /* el aviso no puede tumbar el cierre */ });
        });

    } catch (error) {
        estadoCampana.activo = false;
        console.error('❌ Error enviando la campaña:', error.message);
        if (!res.headersSent) res.status(500).json({ success: false, message: error.message });
    }
};
