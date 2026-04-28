import * as siiBase from '../lib/siiBase.js';
import * as utils from '../lib/utils.js';
import * as API_DTE from '../services/apiDTE.js';
import { crear_cliente } from '../controllers/clientes.controllers.js';

// Importamos el script de Puppeteer para la factura manual, masiva y exenta
import { emitirFacturaPuppeteer } from '../components/facturacion/scripts/factura_manual.mjs';
import { emitirExentaPuppeteer } from '../components/facturacion/scripts/exenta_manual.mjs';
import { emitirLotePuppeteer, estadoRobot } from '../components/facturacion/scripts/factura_masiva.mjs';


// ==========================================
// CONTROLADOR: Emisión Manual Puppeteer
// ==========================================
export const emitirManualController = async (req, res) => {
    try {
        const datosFactura = req.body; 
        
        // 1. Extraemos el ID de la empresa que viene desde el Frontend
        const empresaId = req.body.empresa_id; 

        // Verificamos que lleguen los datos mínimos
        if (!datosFactura.rutReceptor || !datosFactura.producto) {
            return res.status(400).json({ ok: false, error: "Faltan datos obligatorios para emitir la factura." });
        }

        if (!empresaId) {
            return res.status(400).json({ ok: false, error: "Falta el ID de la empresa emisora para guardar el registro." });
        }

        const tipoDoc = datosFactura.tipo_documento || "33"; // Por si acaso no viene, asumimos 33
        console.log(`🚀 Solicitud recibida para DTE Tipo: ${tipoDoc}`);

        let result;

        // ==========================================
        // 2. EL CEREBRO: ELEGIR EL ROBOT CORRECTO
        // ==========================================
        if (tipoDoc === "34") {
            console.log("🤖 Iniciando Robot para FACTURA EXENTA...");
            result = await emitirExentaPuppeteer(datosFactura);
        } else {
            console.log("🤖 Iniciando Robot para FACTURA AFECTA...");
            result = await emitirFacturaPuppeteer(datosFactura);
        }

        // Devolvemos el resultado (Folio, etc.) al Frontend
        return res.status(200).json(result);

    } catch(error) {
        console.error("❌ Error en emitirManualController:", error);
        return res.status(500).json({ ok: false, error: error.message });
    }
};

// ==========================================
// NUEVO CONTROLADOR: Emisión Masiva Puppeteer
// ==========================================
export const emitirMasivoController = async (req, res) => {
    try {
        const { facturas } = req.body; 

        if (!facturas || !Array.isArray(facturas) || facturas.length === 0) {
            return res.status(400).json({ ok: false, error: "No se proporcionó un array de facturas válido." });
        }

        console.log(`[INFO] Recepción de lote MASIVO para ${facturas.length} registros. Iniciando en 2do plano...`);

        // 1. RESPONDEMOS INMEDIATAMENTE AL FRONTEND (Libera la página web)
        res.status(200).json({ 
            ok: true, 
            mensaje: "Lote recibido correctamente. Procesando facturas en segundo plano." 
        });

        // 2. EJECUTAMOS PUPPETEER POR DEBAJO (Sin "await")
        emitirLotePuppeteer(facturas)
            .then(resultado => {
                console.log(`\n✅ Lote masivo completado en segundo plano.`);
            })
            .catch(error => {
                console.error(`\n❌ Error en proceso masivo en 2do plano:`, error);
            });

    } catch (error) {
        console.error("Error en emitirMasivoController:", error);
        // Si hay un error antes de responder, lo enviamos
        if (!res.headersSent) {
            res.status(500).json({ ok: false, error: error.message || "Error interno al iniciar el lote." });
        }
    }
};

// ==========================================
// CONTROLADORES ORIGINALES
// ==========================================

export const emitirDTE = async (req, res) => {
  try {
    const { dteJson } = req.body;
    const empresaId = req.empresaId;
    
    console.log('--- Nueva Petición de Emisión DTE ---');
    console.log('Empresa ID:', empresaId);
    console.log('DTE JSON Recibido:', JSON.stringify(dteJson, null, 2));

    if (!empresaId) {
      console.warn('Error: No se proporcionó ID de empresa');
      return res.status(400).json({ 
        ok: false, 
        error: 'No se ha seleccionado una empresa activa en el sistema.' 
      });
    }

    if (!dteJson || !dteJson.Encabezado) {
       console.warn('Error: DTE JSON inválido o incompleto');
       return res.status(400).json({ ok: false, error: 'Datos de DTE inválidos o incompletos' });
    }

    const receptor = dteJson.Encabezado.Receptor;
    console.log('Datos del Receptor extraídos:', receptor);

    // 1. Emitir el DTE en el SII
    console.log('Iniciando emisión en SII...');
    const resultSii = await siiBase.emitirDTE(dteJson);
    console.log('Resultado de emisión en SII:', resultSii);
    
    if (!resultSii || !resultSii.ok) {
       console.warn('Error devuelto por siiBase.emitirDTE:', resultSii?.error);
       return res.status(500).json({ 
           ok: false, 
           error: resultSii?.error || 'Error desconocido al emitir el documento en el SII' 
       });
    }

    const numeroDocumento = resultSii.numeroDocumento || resultSii.folio;
    console.log('Folio obtenido:', numeroDocumento);

    // 2. Crear Cliente (CRM) si corresponde
    let clienteId = null;
    try {
        console.log('Intentando registrar cliente en CRM...');
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
                     console.log(`Respuesta interna crear_cliente (${code}):`, data);
                     if (code === 201 || code === 200) {
                        clienteId = data.id || data.cliente?.id;
                     }
                 }
             })
        };
        
        await crear_cliente(reqCliente, resCliente);
        console.log('ID de cliente obtenido/creado:', clienteId);

    } catch(err) {
         console.warn('Advertencia: No se pudo registrar el cliente en el CRM. La emisión del DTE continuará.', err);
    }
    
    // 3. Obtener el PDF del SII (Opcional, pero recomendado)
     let downloadUrl = resultSii.downloadUrl;
     let fileName = resultSii.fileName;
     
     if(!downloadUrl && numeroDocumento && dteJson.Encabezado.IdDoc.TipoDTE) {
          console.log(`Intentando obtener PDF para folio ${numeroDocumento}...`);
          try{
               const reqPDF = {
                    body: {
                         rutEmisor: dteJson.Encabezado.Emisor.RUTEmisor,
                         tipoDocumento: dteJson.Encabezado.IdDoc.TipoDTE,
                         folio: numeroDocumento
                    }
               }
               const resPDF = {
                    json: (data) => data,
                    status: () => resPDF
               }
               
               const pdfResult = await siiBase.obtenerPDF(reqPDF, resPDF);
               if(pdfResult && pdfResult.ok){
                    downloadUrl = pdfResult.downloadUrl;
                    fileName = pdfResult.fileName;
                    console.log('PDF obtenido con éxito:', downloadUrl);
               }
          }catch(err){
               console.warn("Advertencia: No se pudo obtener el PDF del DTE recién emitido", err)
          }
     }

    // 4. Guardar Documento Emitido en la BD Principal (Documentos_Emitidos)
    console.log('Intentando guardar documento en BD Principal...');
    try {
       const montoTotalStr = dteJson.Detalle?.PrcItem || dteJson.Encabezado?.Totales?.MntTotal || '0';
       const montoTotal = utils.parseSiiMonto(montoTotalStr);

       const documentoData = {
           empresa_id: empresaId,
           tipo_documento_id: 33, // TODO: Mapear según dteJson.Encabezado.IdDoc.TipoDTE (Factura Electrónica)
           numero_documento: numeroDocumento,
           fecha_emision: dteJson.Encabezado.IdDoc.FchEmis || new Date().toISOString().split('T')[0],
           receptor_rut: receptor.RUTRecep || '',
           receptor_razon_social: receptor.RznSocRecep || 'Sin Razón Social',
           monto_neto: montoTotal, // Simplificación: asumiendo que el item price es el total neto
           monto_exento: 0,
           monto_iva: Math.round(montoTotal * 0.19),
           monto_total: Math.round(montoTotal * 1.19),
           archivo_xml: resultSii.xml || '',
           archivo_pdf: fileName || '',
           estado: 'Emitido'
       };

       console.log('Datos a insertar en Documentos_Emitidos:', documentoData);
       const docId = await API_DTE.guardarDocumentoEmitido(documentoData);
       console.log('Documento guardado en BD con ID:', docId);

    } catch (err) {
        console.error('Error Crítico: Fallo al guardar el documento emitido en la BD Principal:', err);
        // NOTA: No detenemos el flujo retornando error 500, porque el DTE ya se emitió en el SII.
        // Lo ideal sería encolar este reintento o notificar al admin.
    }

    console.log('--- Emisión Completada Exitosamente ---');
    return res.status(200).json({
      ok: true,
      mensaje: 'DTE emitido, cliente actualizado y registrado en BD correctamente',
      numeroDocumento: numeroDocumento,
      downloadUrl: downloadUrl,
      fileName: fileName,
      siiData: resultSii
    });

  } catch (error) {
    console.error('❌ Error no controlado en emitirDTE:', error);
    return res.status(500).json({ 
        ok: false, 
        error: error.message || 'Error interno al procesar la emisión del documento' 
    });
  }
};

export const getDtesEmitidos = async (req, res) => {
    try {
        const result = await siiBase.getDtes(req.body);
        if (result.ok) {
            res.json(result);
        } else {
             res.status(500).json(result);
        }
    } catch (error) {
        console.error("Error en getDtesEmitidos (Controller):", error);
        res.status(500).json({ ok: false, error: error.message });
    }
};

export const testConnection = async (req, res) => {
    try {
         const result = await siiBase.testConexion();
         res.json(result);
    } catch (error) {
         res.status(500).json({ ok: false, error: error.message });
    }
}

export const loginDTE = async (req, res) => {
    try {
        const { rut, clave } = req.body;
        
        if (!rut || !clave) {
            return res.status(400).json({ 
                ok: false, 
                error: "El RUT y la clave son obligatorios para el login." 
            });
        }
        
        const result = await siiBase.loginDTE(rut, clave);
        
        if (result.ok) {
            return res.status(200).json(result);
        } else {
            return res.status(401).json(result);
        }
        
    } catch (error) {
        console.error("Error en loginDTE controller:", error);
        return res.status(500).json({ 
            ok: false, 
            error: "Error interno del servidor durante el login en el SII." 
        });
    }
};

export const checkSIIStatus = async (req, res) => {
    try {
        const result = await siiBase.checkSIIStatus();
        return res.status(200).json(result);
    } catch (error) {
        console.error("Error en checkSIIStatus controller:", error);
        return res.status(500).json({ 
            ok: false, 
            error: "No se pudo verificar el estado de la conexión con el SII." 
        });
    }
};

export const getSessionData = async (req, res) => {
    try {
        const sessionData = await siiBase.getSessionData();
        return res.status(200).json({ ok: true, data: sessionData });
    } catch (error) {
         console.error("Error en getSessionData controller:", error);
         return res.status(500).json({ ok: false, error: "Error al obtener datos de sesión del SII." });
    }
};

export const verificarSesion = async (req, res) => {
    try {
        const result = await siiBase.verificarSesion();
        res.json(result);
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
};

export const cerrarSesion = async (req, res) => {
    try {
        const result = await siiBase.cerrarSesion();
        res.json(result);
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
};

export const obtenerPDF = async (req, res) => {
     try {
          const result = await siiBase.obtenerPDF(req.body);
          if (result.ok) {
               res.json(result);
          } else {
               res.status(500).json(result);
          }
     } catch (error) {
          console.error("Error en obtenerPDF (Controller):", error);
          res.status(500).json({ ok: false, error: error.message });
     }
}

export const emitirBoletaHonorarios = async (req, res) => {
     try {
          const result = await siiBase.emitirBoletaHonorarios(req.body);
          if(result.ok) {
               res.json(result);
          } else {
               res.status(500).json(result);
          }
     } catch(error) {
          console.error("Error en emitirBoletaHonorarios (Controller):", error);
          res.status(500).json({ ok: false, error: error.message });
     }
}

// ==========================================
// NUEVO: Obtener Historial desde la BD (Supabase)
// ==========================================
export const getHistorialController = async (req, res) => {
    try {
        const { empresa_id, mes, anio } = req.query;

        if (!empresa_id) {
            return res.status(400).json({ ok: false, error: "Se requiere el ID de la empresa." });
        }

        // Construimos la consulta a Supabase
        let query = supabase
            .from('documentos_emitidos')
            .select('*')
            .eq('empresa_id', empresa_id);

        // Si el usuario filtró por mes/año en la interfaz, lo aplicamos
        if (mes && anio) {
            const inicioMes = `${anio}-${mes}-01`;
            const finMes = `${anio}-${mes}-31`; // Simplificado
            query = query.gte('fecha_emision', inicioMes).lte('fecha_emision', finMes);
        }

        const { data, error } = await query.order('fecha_emision', { ascending: false });

        if (error) throw error;

        res.status(200).json({ ok: true, documentos: data });
    } catch (error) {
        console.error("Error al obtener historial:", error);
        res.status(500).json({ ok: false, error: error.message });
    }
};

// ==========================================
// NUEVO: Consultar Progreso Masivo en Vivo
// ==========================================
export const obtenerProgresoMasivoController = (req, res) => {
    res.status(200).json(estadoRobot);
};