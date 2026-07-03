import * as siiBase from '../lib/siiBase.js';
import * as utils from '../lib/utils.js';
import * as API_DTE from '../services/apiDTE.js';
import { crear_cliente } from '../controllers/clientes.controllers.js';

// ==========================================
// 🤖 IMPORTACIÓN DE ROBOTS PUPPETEER
// ==========================================
// Robots para Factura Electrónica (DTE 33)
import { emitirFacturaPuppeteer } from '../components/facturacion/scripts/factura_manual.mjs';
import { emitirLotePuppeteer, estadoRobot } from '../components/facturacion/scripts/factura_masiva.mjs';
import { reenviarCorreoIndividual, reenviarCorreosMasivo } from '../components/facturacion/scripts/revisar para envios/mensajes_facturador_masivo.mjs';
import { obtenerDestinatariosRecordatorio, enviarRecordatoriosPago, estadoRecordatorio } from '../components/facturacion/scripts/revisar para envios/recordatorio_pago.mjs';
import { pool } from '../database/db.js';

// Robots para Factura Exenta (DTE 34)
import { emitirExentaPuppeteer } from '../components/facturacion/scripts/exenta_manual.mjs';
import { emitirLoteExentaPuppeteer, estadoRobotExenta } from '../components/facturacion/scripts/exenta_masiva.mjs';

// Robot para Notas (DTE 61 y 56)
import { emitirNotaCDPuppeteer } from '../components/facturacion/scripts/nota_credito_debito.mjs';

// ==========================================
// 🚀 CONTROLADORES DTE 33 (FACTURA ELECTRÓNICA)
// ==========================================
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

        console.log("🤖 Iniciando Robot para FACTURA AFECTA (33)...");
        const result = await emitirFacturaPuppeteer(datosFactura);
        return res.status(200).json(result);

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

        console.log(`[INFO] Lote MASIVO AFECTO (33): ${facturas.length} registros. Iniciando...`);
        res.status(200).json({ ok: true, mensaje: "Lote recibido (33). Procesando en segundo plano." });

        emitirLotePuppeteer(facturas).catch(error => {
            console.error(`\n❌ Error en proceso masivo (33):`, error);
            // 🔓 Si el motor reventó, liberamos el candado para no bloquear las sincronizaciones del SII.
            estadoRobot.activo = false;
        });

    } catch (error) {
        if (!res.headersSent) res.status(500).json({ ok: false, error: error.message });
    }
};

// 🔒 Candado: solo un envío/reenvío de correos a la vez (misma cuenta SII = no concurrencia).
let correoEnCurso = false;

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
    // 🔒 El registro global de correos es una vista de administrador.
    // Esta tabla no tiene empresa_id, así que un cliente no puede verla acotada.
    if (req.user?.rol !== 'Administrador') {
        return res.json({ ok: true, correos: [] });
    }
    try {
        const { rows } = await pool.query(
            `SELECT folio, rut, razon_social AS "razonSocial", correo, estado, motivo, datos, fecha
             FROM correos_facturas
             ORDER BY fecha DESC
             LIMIT 2000`
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
        const { desde, hasta } = req.query;
        const destinatarios = await obtenerDestinatariosRecordatorio({
            desde: desde || undefined,
            hasta: hasta || null,
        });
        res.json({ ok: true, total: destinatarios.length, destinatarios });
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

        const { desde, hasta, fechaLimite } = req.body || {};

        correoEnCurso = true;
        console.log("[INFO] Envío de recordatorios de pago solicitado.");
        res.json({ ok: true, mensaje: "Envío de recordatorios iniciado. Sigue el progreso en pantalla." });

        enviarRecordatoriosPago({
            desde: desde || undefined,
            hasta: hasta || null,
            fechaLimite: fechaLimite || undefined,
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
export const getProgresoRecordatoriosController = (req, res) => {
    res.status(200).json(estadoRecordatorio);
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

        console.log("🤖 Iniciando Robot para FACTURA EXENTA (34)...");
        const result = await emitirExentaPuppeteer(datosFactura);
        return res.status(200).json(result);

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

        console.log(`[INFO] Lote MASIVO EXENTO (34): ${facturas.length} registros. Iniciando...`);
        res.status(200).json({ ok: true, mensaje: "Lote recibido (34). Procesando en segundo plano." });

        emitirLoteExentaPuppeteer(facturas).catch(error => {
            console.error(`\n❌ Error en proceso masivo (34):`, error);
        });

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
        console.log(`🚀 Iniciando motor Puppeteer en modo directo...`);
        const resultado = await emitirNotaCDPuppeteer(datos);

        if (resultado && resultado.ok) {
            return res.status(200).json(resultado);
        } else {
            throw new Error("Falla desconocida dentro del robot.");
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

       await API_DTE.guardarDocumentoEmitido(documentoData);
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