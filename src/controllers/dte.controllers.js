import * as siiBase from '../lib/siiBase.js';
import * as utils from '../lib/utils.js';
import { crear_cliente } from '../controllers/clientes.controllers.js';

// ==========================================
// 🤖 IMPORTACIÓN DE ROBOTS PUPPETEER
// ==========================================
// Robots para Factura Electrónica (DTE 33)
import { emitirFacturaPuppeteer } from '../components/facturacion/scripts/factura_manual.mjs';
import { emitirLotePuppeteer, estadoRobot } from '../components/facturacion/scripts/factura_masiva.mjs';
import { reenviarCorreoIndividual, reenviarCorreosMasivo } from '../components/facturacion/scripts/revisar para envios/mensajes_facturador_masivo.mjs';
import { obtenerDestinatariosRecordatorio, enviarRecordatoriosPago, estadoRecordatorio } from '../components/facturacion/scripts/revisar para envios/recordatorio_pago.mjs';
import { credencialesParaFacturar, describirCredenciales } from '../utils/credencialesFacturacion.js';
import { registrar } from '../utils/bitacora.js';
import { ultimoProceso } from '../utils/procesoEnCurso.js';
import { claveDeCuenta, cuentaOcupada, tomarCuenta, soltarCuenta, motivoOcupada } from '../utils/candadoSii.js';
import { pool } from '../database/db.js';

// Robots para Factura Exenta (DTE 34)
import { emitirExentaPuppeteer } from '../components/facturacion/scripts/exenta_manual.mjs';
import { emitirLoteExentaPuppeteer, estadoRobotExenta } from '../components/facturacion/scripts/exenta_masiva.mjs';

// Robot para Notas (DTE 61 y 56)
import { emitirNotaCDPuppeteer } from '../components/facturacion/scripts/nota_credito_debito.mjs';

// ==========================================
// 🚀 CONTROLADORES DTE 33 (FACTURA ELECTRÓNICA)
// ==========================================
// Credenciales del SII con las que se va a emitir: las del usuario que apretó el
// botón si las tiene cargadas en su perfil, y si no las del sistema. Queda
// escrito en el log con cuál salió, que hasta ahora era imposible de saber.
const credencialesDe = async (req) => {
    const resuelto = await credencialesParaFacturar(req.user?.usuarioId, req.user?.nombre);
    console.log(describirCredenciales(resuelto, req.user?.nombre));
    return resuelto.credenciales;
};

// ============================================================================
// 🔒 UN NAVEGADOR POR CUENTA DEL SII
// ----------------------------------------------------------------------------
// El portal del SII no admite dos sesiones abiertas con la MISMA cuenta. Con
// cuentas distintas no hay conflicto, así que el candado va por cuenta: si
// Victor factura con su RUT, Mati puede facturar con el suyo al mismo tiempo.
//
// El detalle está en utils/candadoSii.js.
// ============================================================================
// Candado del envío de correos: es por la cuenta de GMAIL, no por el SII, así
// que NO impide emitir. Antes sí lo hacía, y mandar los 92 recordatorios dejaba
// la facturación parada media hora sin necesidad.
let correoEnCurso = false;

/**
 * Resuelve las credenciales del que factura y toma el candado de ESA cuenta.
 * Devuelve null (y ya respondió 409) si la cuenta está ocupada.
 */
const tomarSiiPara = async (req, res, etiqueta) => {
    const credenciales = await credencialesDe(req);
    const clave = claveDeCuenta(credenciales);

    const uso = cuentaOcupada(clave);
    if (uso) {
        res.status(409).json({ ok: false, error: `No se puede emitir ahora: ${motivoOcupada(uso)}. Espera a que termine.` });
        return null;
    }

    tomarCuenta(clave, etiqueta, req.user?.nombre || null);
    return { credenciales, clave };
};

export const emitirManualController = async (req, res) => {
    try {
        const datosFactura = req.body; 
        const empresaId = req.body.empresa_id; 

        if (!datosFactura.rutReceptor || !datosFactura.producto) {
            return res.status(400).json({ ok: false, error: "Faltan datos obligatorios para emitir la factura." });
        }
        if (!empresaId) {
            return res.status(400).json({ ok: false, error: "Falta el ID de la empresa emisora." });
        }

        const sii = await tomarSiiPara(req, res, 'factura afecta (33)');
        if (!sii) return;

        console.log("🤖 Iniciando Robot para FACTURA AFECTA (33)...");
        try {
        // La organización del usuario viaja al robot: si crea un cliente externo,
        // la empresa nueva debe quedar en la misma organización o el CRM no la mostrará.
        const result = await emitirFacturaPuppeteer({ ...datosFactura, organizacion_id: req.user?.organizacionId || null }, sii.credenciales);
        await registrar(req, {
            modulo: 'facturacion', accion: 'emitir_factura',
            entidad: 'documento', entidadId: result?.folio || result?.numeroDocumento || null,
            descripcion: `Factura afecta (33) a ${datosFactura.rutReceptor}`,
            resultado: result?.ok === false ? 'error' : 'ok',
            detalle: { tipoDte: 33, rutReceptor: datosFactura.rutReceptor, empresaId },
        });
        return res.status(200).json(result);
        } finally {
            soltarCuenta(sii.clave);
        }

    } catch(error) {
        console.error("❌ Error en emitirManualController:", error);
        return res.status(500).json({ ok: false, error: error.message });
    }
};

export const emitirMasivoController = async (req, res) => {
    try {
        const { facturas } = req.body; 
        if (!facturas || !Array.isArray(facturas) || facturas.length === 0) {
            return res.status(400).json({ ok: false, error: "Array de facturas inválido." });
        }

        // Se resuelve ANTES de responder: después de `res.json` ya no hay a quién
        // avisarle si la cuenta está ocupada o si no tiene credenciales.
        const sii = await tomarSiiPara(req, res, `lote de ${facturas.length} factura(s) afecta(s)`);
        if (!sii) return;

        console.log(`[INFO] Lote MASIVO AFECTO (33): ${facturas.length} registros. Iniciando...`);
        await registrar(req, {
            modulo: 'facturacion', accion: 'emitir_lote',
            descripcion: `Lote de ${facturas.length} factura(s) afecta(s)`,
            detalle: { tipoDte: 33, cantidad: facturas.length },
        });
        res.status(200).json({ ok: true, mensaje: "Lote recibido (33). Procesando en segundo plano." });

        emitirLotePuppeteer(facturas, sii.credenciales)
            .catch(error => {
                console.error(`\n❌ Error en proceso masivo (33):`, error);
                // 🔓 Si el motor reventó, liberamos para no bloquear las sincronizaciones del SII.
                estadoRobot.activo = false;
            })
            // El lote corre en segundo plano: la cuenta se suelta cuando TERMINA,
            // no cuando se le responde al navegador.
            .finally(() => soltarCuenta(sii.clave));

    } catch (error) {
        if (!res.headersSent) res.status(500).json({ ok: false, error: error.message });
    }
};

// ==========================================
// 📧 REENVÍO MANUAL DE UN CORREO (desde el registro)
// ==========================================
export const reenviarCorreoController = async (req, res) => {
    try {
        const { folio, datos } = req.body;
        if (!folio) {
            return res.status(400).json({ ok: false, error: "Falta el número de folio." });
        }
        // No reenviar mientras el facturador masivo está usando el SII (misma cuenta).
        if (estadoRobot.activo) {
            return res.status(409).json({ ok: false, error: "El facturador masivo está en ejecución. Espera a que termine para reenviar correos." });
        }
        if (correoEnCurso) {
            return res.status(409).json({ ok: false, error: "Ya hay un envío de correos en curso. Espera a que termine." });
        }

        correoEnCurso = true;
        console.log(`[INFO] Reenvío manual de correo solicitado para folio ${folio}`);
        // Respondemos de inmediato y procesamos en segundo plano (tarda ~1 min: login SII + PDF + envío).
        res.json({ ok: true, mensaje: `Reenvío del folio ${folio} iniciado. Refresca el registro en ~1 minuto para ver el resultado.` });

        await registrar(req, {
            modulo: 'correos', accion: 'reenviar_factura',
            entidad: 'correo', entidadId: folio,
            descripcion: `Reenvío del correo de la factura ${folio}`,
        });

        reenviarCorreoIndividual(folio, datos || {}, true)
            .catch(err => console.error(`❌ Error reenviando correo del folio ${folio}:`, err.message))
            .finally(() => { correoEnCurso = false; });

    } catch (error) {
        correoEnCurso = false;
        console.error("❌ Error en reenviarCorreoController:", error);
        if (!res.headersSent) res.status(500).json({ ok: false, error: error.message });
    }
};

// 📒 Leer el registro de correos desde la BASE DE DATOS
export const getCorreosLogController = async (req, res) => {
    // 🔒 Vista de administrador. Desde el 31-jul la tabla SÍ guarda
    // `organizacion_id`, así que la consulta ya no cruza firmas: cada
    // administrador ve solo los correos de la suya.
    if (req.user?.rol !== 'Administrador') {
        return res.json({ ok: true, correos: [] });
    }
    try {
        // Se adjunta el estado del COBRO de cada folio para poder separar en
        // pantalla a quien ya pagó de quien no. `correos_facturas` solo sabe si
        // el correo salió; quién debe está en `cobro_mensual`, y el folio es la
        // llave común entre las dos.
        const { rows } = await pool.query(
            `SELECT cf.folio, cf.rut, cf.razon_social AS "razonSocial", cf.correo,
                    cf.estado, cf.motivo, cf.datos, cf.fecha,
                    cm.estado                       AS "estadoPago",
                    cm.monto_facturado              AS "montoCobro",
                    to_char(cm.periodo, 'YYYY-MM')  AS "periodoCobro"
               FROM correos_facturas cf
               LEFT JOIN LATERAL (
                    SELECT c.estado, c.monto_facturado, c.periodo
                      FROM cobro_mensual c
                     WHERE TRIM(c.folio) = TRIM(cf.folio)
                     ORDER BY c.periodo DESC
                     LIMIT 1
               ) cm ON true
             WHERE cf.organizacion_id IS NOT DISTINCT FROM $1::uuid
               -- UN SOLO PERIODO A LA VEZ.
               --
               -- Sin este filtro la pantalla traía TODOS los correos jamás
               -- registrados y mezclaba meses: el 04-08-2026 mostraba 169 filas
               -- —81 pendientes y 12 pagados de julio, más 75 pagados de junio—
               -- y el contador "Ya pagaron" decía 87. Nadie podía cuadrar ese
               -- número contra la realidad de julio, que son 93 cobros.
               --
               -- Por defecto se muestra el periodo que se está cobrando: el
               -- último con deuda, el MISMO criterio que usa el recordatorio,
               -- para que la lista y el envío no puedan discrepar.
               AND (
                    cm.periodo = COALESCE(
                        $2::date,
                        (SELECT MAX(c2.periodo) FROM cobro_mensual c2
                          WHERE c2.estado = 'PENDIENTE_PAGO'
                            AND c2.organizacion_id IS NOT DISTINCT FROM $1::uuid)
                    )
                    -- Un correo sin cobro asociado no tiene periodo propio: se
                    -- ubica por su fecha de envío para que no desaparezca.
                    OR (cm.periodo IS NULL AND date_trunc('month', cf.fecha)::date = COALESCE(
                        $2::date,
                        (SELECT MAX(c2.periodo) FROM cobro_mensual c2
                          WHERE c2.estado = 'PENDIENTE_PAGO'
                            AND c2.organizacion_id IS NOT DISTINCT FROM $1::uuid)
                    ))
               )
             ORDER BY cf.fecha DESC
             LIMIT 2000`,
            [req.user?.organizacionId || null, req.query.periodo || null]
        );
        res.json({ ok: true, correos: rows });
    } catch (e) {
        console.error("❌ Error leyendo correos_facturas:", e.message);
        res.json({ ok: true, correos: [], error: e.message });
    }
};

// 📧 Reenvío MASIVO de los correos seleccionados (en segundo plano)
export const reenviarCorreosMasivoController = async (req, res) => {
    try {
        const { items } = req.body; // [{ folio, datos }]
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ ok: false, error: "No hay correos seleccionados." });
        }
        if (estadoRobot.activo) {
            return res.status(409).json({ ok: false, error: "El facturador masivo está en ejecución. Espera a que termine." });
        }
        if (correoEnCurso) {
            return res.status(409).json({ ok: false, error: "Ya hay un envío de correos en curso. Espera a que termine." });
        }

        correoEnCurso = true;
        console.log(`[INFO] Reenvío MASIVO de ${items.length} correo(s) solicitado.`);
        // Respondemos de inmediato; el proceso corre en segundo plano (puede tardar minutos).
        res.json({ ok: true, mensaje: `Reenvío masivo iniciado para ${items.length} correo(s). Refresca el registro en unos minutos.` });

        reenviarCorreosMasivo(items, true)
            .catch(err => console.error("❌ Error en reenvío masivo de correos:", err))
            .finally(() => { correoEnCurso = false; });

    } catch (error) {
        correoEnCurso = false;
        console.error("❌ Error en reenviarCorreosMasivoController:", error);
        if (!res.headersSent) res.status(500).json({ ok: false, error: error.message });
    }
};

// ==========================================
// 📢 RECORDATORIOS DE PAGO (módulo aparte)
// ==========================================

// 👀 Vista previa: a cuántas empresas y a qué correos se enviaría (sin enviar nada).
export const previewRecordatoriosController = async (req, res) => {
    try {
        // `periodo`: primer día del mes a cobrar. Sin él, el mes en curso.
        // `folios`: lista separada por comas para acotar a lo que el usuario marcó.
        const { periodo, folios } = req.query;
        const { destinatarios, excluidos } = await obtenerDestinatariosRecordatorio({
            periodo: periodo || null,
            folios: folios ? String(folios).split(',').filter(Boolean) : null,
            organizacionId: req.user?.organizacionId || null,
        });
        res.json({
            ok: true,
            total: destinatarios.length,
            destinatarios,
            periodo: destinatarios[0]?.periodo || null,
            deuda: destinatarios.reduce((a, d) => a + Number(d.monto || 0), 0),
            // Para que la confirmación diga a quiénes se está dejando fuera y por qué.
            totalExcluidos: excluidos.length,
            excluidos,
        });
    } catch (error) {
        console.error("❌ Error en previewRecordatoriosController:", error.message);
        res.status(500).json({ ok: false, error: error.message });
    }
};

// 🚀 Dispara el envío de recordatorios en segundo plano (botón en Facturación).
export const enviarRecordatoriosController = async (req, res) => {
    try {
        // Mismos candados que el reenvío de correos (misma cuenta de Gmail / SII).
        if (estadoRobot.activo) {
            return res.status(409).json({ ok: false, error: "El facturador masivo está en ejecución. Espera a que termine." });
        }
        if (correoEnCurso || estadoRecordatorio.activo) {
            return res.status(409).json({ ok: false, error: "Ya hay un envío de correos en curso. Espera a que termine." });
        }

        const { periodo, fechaLimite, folios } = req.body || {};

        correoEnCurso = true;
        console.log("[INFO] Envío de recordatorios de pago solicitado.");
        res.json({ ok: true, mensaje: "Envío de recordatorios iniciado. Sigue el progreso en pantalla." });

        enviarRecordatoriosPago({
            periodo: periodo || null,
            fechaLimite: fechaLimite || undefined,
            folios: Array.isArray(folios) && folios.length ? folios : null,
            // Viaja el usuario porque el envío sigue corriendo DESPUÉS de
            // responder: para entonces ya no existe `req`.
            usuario: req.user || null,
        })
            .catch(err => {
                console.error("❌ Error en envío de recordatorios:", err);
                estadoRecordatorio.activo = false;
                estadoRecordatorio.finalizado = true;
                estadoRecordatorio.error = err.message;
            })
            .finally(() => { correoEnCurso = false; });

    } catch (error) {
        correoEnCurso = false;
        console.error("❌ Error en enviarRecordatoriosController:", error.message);
        if (!res.headersSent) res.status(500).json({ ok: false, error: error.message });
    }
};

// 📊 Progreso en vivo del envío de recordatorios.
export const getProgresoRecordatoriosController = async (req, res) => {
    // La memoria manda mientras el proceso vive en ESTE servidor.
    if (estadoRecordatorio.activo || estadoRecordatorio.total > 0) {
        return res.status(200).json(estadoRecordatorio);
    }

    // Si la memoria está vacía puede ser que nunca se haya enviado nada, o que
    // el servidor se reiniciara a media corrida. Se responde desde la base para
    // que la pantalla muestre dónde quedó en vez de verse quieta.
    const p = await ultimoProceso('recordatorio_pago', req.user?.organizacionId || null);
    if (!p) return res.status(200).json(estadoRecordatorio);

    return res.status(200).json({
        activo: p.estado === 'activo',
        total: p.total,
        actual: p.actual,
        enviados: p.exitos,
        fallidos: p.fallidos,
        ultimoCorreo: p.ultimo || '',
        finalizado: p.estado === 'finalizado',
        error: p.estado === 'abandonado'
            ? 'El envío se interrumpió (el servidor se reinició). Revisa la bitácora para ver a quiénes alcanzó a llegar.'
            : p.error,
        // Extra respecto de la memoria: de dónde salió y quién lo disparó.
        origen: 'base',
        iniciadoPor: p.usuario_nombre,
        iniciadoAt: p.iniciado_at,
    });
};

// ==========================================
// 🌟 CONTROLADORES DTE 34 (FACTURA EXENTA)
// ==========================================
export const emitirExentaManualController = async (req, res) => {
    try {
        const datosFactura = req.body; 
        const empresaId = req.body.empresa_id; 

        if (!datosFactura.rutReceptor || !datosFactura.producto) {
            return res.status(400).json({ ok: false, error: "Faltan datos obligatorios." });
        }
        if (!empresaId) {
            return res.status(400).json({ ok: false, error: "Falta el ID de la empresa emisora." });
        }

        const sii = await tomarSiiPara(req, res, 'factura exenta (34)');
        if (!sii) return;

        console.log("🤖 Iniciando Robot para FACTURA EXENTA (34)...");
        try {
        const result = await emitirExentaPuppeteer({ ...datosFactura, organizacion_id: req.user?.organizacionId || null }, sii.credenciales);
        await registrar(req, {
            modulo: 'facturacion', accion: 'emitir_exenta',
            entidad: 'documento', entidadId: result?.folio || null,
            descripcion: `Factura exenta (34) a ${datosFactura.rutReceptor}`,
            resultado: result?.ok === false ? 'error' : 'ok',
            detalle: { tipoDte: 34, rutReceptor: datosFactura.rutReceptor, empresaId },
        });
        return res.status(200).json(result);
        } finally {
            soltarCuenta(sii.clave);
        }

    } catch(error) {
        console.error("❌ Error en emitirExentaManualController:", error);
        return res.status(500).json({ ok: false, error: error.message });
    }
};

export const emitirExentaMasivaController = async (req, res) => {
    try {
        const { facturas } = req.body; 
        if (!facturas || !Array.isArray(facturas) || facturas.length === 0) {
            return res.status(400).json({ ok: false, error: "Array de exentas inválido." });
        }

        const sii = await tomarSiiPara(req, res, `lote de ${facturas.length} factura(s) exenta(s)`);
        if (!sii) return;

        console.log(`[INFO] Lote MASIVO EXENTO (34): ${facturas.length} registros. Iniciando...`);
        await registrar(req, {
            modulo: 'facturacion', accion: 'emitir_lote',
            descripcion: `Lote de ${facturas.length} factura(s) exenta(s)`,
            detalle: { tipoDte: 34, cantidad: facturas.length },
        });
        res.status(200).json({ ok: true, mensaje: "Lote recibido (34). Procesando en segundo plano." });

        emitirLoteExentaPuppeteer(facturas, sii.credenciales)
            .catch(error => { console.error(`\n❌ Error en proceso masivo (34):`, error); })
            .finally(() => soltarCuenta(sii.clave));

    } catch (error) {
        if (!res.headersSent) res.status(500).json({ ok: false, error: error.message });
    }
};

// =========================================================================
// 🔄 CONTROLADORES DTE 61 / 56 (NOTAS C/D) - VERSIÓN ROBUSTA
// =========================================================================
export const emitirNotaController = async (req, res) => {
    try {
        const datos = req.body;

        console.log(`\n==================================================`);
        console.log(`📥 PETICIÓN DIRECTA PARA EMITIR DTE ${datos.tipo_documento}`);
        console.log(`==================================================`);
        console.log(`👤 RUT Destino: ${datos.rutReceptor}-${datos.dvReceptor}`);
        console.log(`🔗 Afectando al Folio: ${datos?.referencia?.folio}`);

        // Validación Ultra Básica (Solo RUT y Folio)
        if (!datos.rutReceptor || !datos.referencia?.folio) {
            console.error("❌ Petición rechazada: Falta el RUT o el Folio.");
            return res.status(400).json({ 
                ok: false, 
                error: "Faltan datos. Se requiere al menos RUT del cliente y Folio a afectar." 
            });
        }

        // Llamamos al robot de Puppeteer directamente
        const sii = await tomarSiiPara(req, res, `nota ${datos.tipo_documento}`);
        if (!sii) return;

        console.log(`🚀 Iniciando motor Puppeteer en modo directo...`);
        try {
        const resultado = await emitirNotaCDPuppeteer(datos, sii.credenciales);
        await registrar(req, {
            modulo: 'facturacion', accion: 'emitir_nota',
            entidad: 'documento', entidadId: resultado?.folio || null,
            descripcion: `Nota ${datos.tipo_documento} a ${datos.rutReceptor}-${datos.dvReceptor}, afecta folio ${datos?.referencia?.folio}`,
            resultado: resultado?.ok ? 'ok' : 'error',
            detalle: { tipoDte: datos.tipo_documento, folioAfectado: datos?.referencia?.folio },
        });

        if (resultado && resultado.ok) {
            return res.status(200).json(resultado);
        } else {
            throw new Error("Falla desconocida dentro del robot.");
        }
        } finally {
            soltarCuenta(sii.clave);
        }

    } catch (error) {
        console.error("❌ Error en emitirNotaController:", error.message);
        return res.status(500).json({ ok: false, error: error.message });
    }
};

// ==========================================
// CONTROLADORES ORIGINALES (MANTENIDOS INTACTOS)
// ==========================================

export const emitirDTE = async (req, res) => {
  try {
    const { dteJson } = req.body;
    const empresaId = req.empresaId;
    
    console.log('--- Nueva Petición de Emisión DTE ---');
    console.log('Empresa ID:', empresaId);

    if (!empresaId) {
      return res.status(400).json({ ok: false, error: 'No se ha seleccionado una empresa activa.' });
    }

    if (!dteJson || !dteJson.Encabezado) {
       return res.status(400).json({ ok: false, error: 'Datos de DTE inválidos o incompletos' });
    }

    const receptor = dteJson.Encabezado.Receptor;

    console.log('Iniciando emisión en SII...');
    const resultSii = await siiBase.emitirDTE(dteJson);
    
    if (!resultSii || !resultSii.ok) {
       return res.status(500).json({ ok: false, error: resultSii?.error || 'Error desconocido' });
    }

    const numeroDocumento = resultSii.numeroDocumento || resultSii.folio;

    let clienteId = null;
    try {
        const rutReceptorCompleto = receptor.RUTRecep || '';
        const rutReceptor = rutReceptorCompleto.split('-')[0];
        
        const reqCliente = {
            empresaId: empresaId,
            body: {
                rut: rutReceptor,
                nombre: receptor.RznSocRecep || 'Sin Razón Social',
                email: receptor.Contacto || '',
                tipo_cliente: 'empresa'
            }
        };

        const resCliente = {
             status: (code) => ({
                 json: (data) => {
                     if (code === 201 || code === 200) clienteId = data.id || data.cliente?.id;
                 }
             })
        };
        
        await crear_cliente(reqCliente, resCliente);
    } catch(err) {
         console.warn('Advertencia: No se pudo registrar el cliente en el CRM.', err);
    }
    
     let downloadUrl = resultSii.downloadUrl;
     let fileName = resultSii.fileName;
     
     if(!downloadUrl && numeroDocumento && dteJson.Encabezado.IdDoc.TipoDTE) {
          try{
               const reqPDF = { body: { rutEmisor: dteJson.Encabezado.Emisor.RUTEmisor, tipoDocumento: dteJson.Encabezado.IdDoc.TipoDTE, folio: numeroDocumento } }
               const resPDF = { json: (data) => data, status: () => resPDF }
               const pdfResult = await siiBase.obtenerPDF(reqPDF, resPDF);
               if(pdfResult && pdfResult.ok){
                    downloadUrl = pdfResult.downloadUrl;
                    fileName = pdfResult.fileName;
               }
          }catch(err){}
     }

    try {
       const montoTotalStr = dteJson.Detalle?.PrcItem || dteJson.Encabezado?.Totales?.MntTotal || '0';
       const montoTotal = utils.parseSiiMonto(montoTotalStr);

       const documentoData = {
           empresa_id: empresaId,
           tipo_documento_id: 33, 
           numero_documento: numeroDocumento,
           fecha_emision: dteJson.Encabezado.IdDoc.FchEmis || new Date().toISOString().split('T')[0],
           receptor_rut: receptor.RUTRecep || '',
           receptor_razon_social: receptor.RznSocRecep || 'Sin Razón Social',
           monto_neto: montoTotal, 
           monto_exento: 0,
           monto_iva: Math.round(montoTotal * 0.19),
           monto_total: Math.round(montoTotal * 1.19),
           archivo_xml: resultSii.xml || '',
           archivo_pdf: fileName || '',
           estado: 'Emitido'
       };

       // Antes esto llamaba a `API_DTE.guardarDocumentoEmitido`, que NO EXISTE:
       // reventaba con un TypeError que el catch de abajo se tragaba, así que
       // ningún documento emitido por esta ruta se guardaba. Ahora se inserta
       // con los nombres reales de la tabla `documentos_emitidos`.
       await pool.query(
           `INSERT INTO documentos_emitidos
               (id, empresa_id, rut_cliente, razon_social_cliente, tipo_dte, folio,
                monto_neto, monto_iva, monto_total, fecha_emision, url_pdf)
            VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
           [
               documentoData.empresa_id,
               documentoData.receptor_rut,
               documentoData.receptor_razon_social,
               33,
               documentoData.numero_documento,
               documentoData.monto_neto,
               documentoData.monto_iva,
               documentoData.monto_total,
               documentoData.fecha_emision,
               documentoData.archivo_pdf || null,
           ]
       );
    } catch (err) {
        console.error('Error Crítico: Fallo al guardar el documento:', err);
    }

    return res.status(200).json({
      ok: true, mensaje: 'DTE emitido', numeroDocumento, downloadUrl, fileName, siiData: resultSii
    });

  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
};

export const getDtesEmitidos = async (req, res) => {
    try {
        const result = await siiBase.getDtes(req.body);
        if (result.ok) res.json(result); else res.status(500).json(result);
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
};

export const testConnection = async (req, res) => {
    try { res.json(await siiBase.testConexion()); } 
    catch (error) { res.status(500).json({ ok: false, error: error.message }); }
}

export const loginDTE = async (req, res) => {
    try {
        const { rut, clave } = req.body;
        if (!rut || !clave) return res.status(400).json({ ok: false, error: "RUT y clave obligatorios." });
        const result = await siiBase.loginDTE(rut, clave);
        if (result.ok) return res.status(200).json(result); else return res.status(401).json(result);
    } catch (error) {
        return res.status(500).json({ ok: false, error: "Error interno en login." });
    }
};

export const checkSIIStatus = async (req, res) => {
    try { res.status(200).json(await siiBase.checkSIIStatus()); } 
    catch (error) { res.status(500).json({ ok: false, error: "No se pudo verificar el estado." }); }
};

export const getSessionData = async (req, res) => {
    try { res.status(200).json({ ok: true, data: await siiBase.getSessionData() }); } 
    catch (error) { res.status(500).json({ ok: false, error: "Error de sesión." }); }
};

export const verificarSesion = async (req, res) => {
    try { res.json(await siiBase.verificarSesion()); } 
    catch (error) { res.status(500).json({ ok: false, error: error.message }); }
};

export const cerrarSesion = async (req, res) => {
    try { res.json(await siiBase.cerrarSesion()); } 
    catch (error) { res.status(500).json({ ok: false, error: error.message }); }
};

export const obtenerPDF = async (req, res) => {
     try {
          const result = await siiBase.obtenerPDF(req.body);
          if (result.ok) res.json(result); else res.status(500).json(result);
     } catch (error) { res.status(500).json({ ok: false, error: error.message }); }
}

export const emitirBoletaHonorarios = async (req, res) => {
     try {
          const result = await siiBase.emitirBoletaHonorarios(req.body);
          if(result.ok) res.json(result); else res.status(500).json(result);
     } catch(error) { res.status(500).json({ ok: false, error: error.message }); }
}

export const getHistorialController = async (req, res) => {
    try {
        const { empresa_id, mes, anio } = req.query;
        if (!empresa_id) return res.status(400).json({ ok: false, error: "Se requiere ID de empresa." });

        let query = supabase.from('documentos_emitidos').select('*').eq('empresa_id', empresa_id);
        if (mes && anio) {
            const inicioMes = `${anio}-${mes}-01`;
            const finMes = `${anio}-${mes}-31`; 
            query = query.gte('fecha_emision', inicioMes).lte('fecha_emision', finMes);
        }

        const { data, error } = await query.order('fecha_emision', { ascending: false });
        if (error) throw error;
        res.status(200).json({ ok: true, documentos: data });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
};

export const obtenerProgresoMasivoController = (req, res) => {
    res.status(200).json(estadoRobot);
};
