import { createClient } from '@supabase/supabase-js';
import { empresasDeLaOrganizacion, empresaPermitida, empresasVisibles, veSoloAsignadas } from '../utils/scope.js';
// Nuevas herramientas de Node.js nativas para ejecutar el script
import { exec } from 'child_process';
import util from 'util';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const execPromise = util.promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_KEY);

// =============================================================================
// EL PORTERO — el mismo criterio que Contabilidad y Remuneraciones
// -----------------------------------------------------------------------------
// Estos endpoints tomaban `empresaId` del query y lo usaban tal cual: no
// comprobaban ni que la empresa fuera de la organización de quien pregunta, ni
// que la tuviera asignada. Con el id a mano se leía —y se escribía— la cartola
// bancaria de cualquier empresa. El filtro por organización existía SOLO en la
// vista global, no al elegir una empresa concreta.
// =============================================================================
const puedeVerEmpresa = async (req, empresaId) => {
    if (!empresaId) return null;                 // vista global: se acota aparte
    return (await empresaPermitida(req, empresaId)) ? null : 'No tienes acceso a los movimientos de esa empresa.';
};
const sinAcceso = (res, motivo) => res.status(403).json({ message: motivo });

// 1. VER BANCOS CONECTADOS
export const getConnectedBanks = async (req, res) => {
    try {
        const { empresaId } = req.query;
        if (!empresaId) return res.status(200).json([]);
        const motivo = await puedeVerEmpresa(req, empresaId);
        if (motivo) return sinAcceso(res, motivo);

        const { data } = await supabase
            .from('movimientos_bancarios')
            .select('banco')
            .eq('empresa_id', empresaId)
            .limit(1);

        const bancosConectados = data && data.length > 0 ? ['bci'] : [];
        return res.status(200).json(bancosConectados);
    } catch (error) {
        return res.status(500).json({ message: "Error al recuperar bancos conectados." });
    }
};

// 2. OBTENER MOVIMIENTOS (Modo Global solo para Admin, Clientes solo su empresa)
export const getMovimientosBancarios = async (req, res) => {
    try {
        let { empresaId } = req.query;
        const esAdmin = req.user?.rol === 'Administrador';
        const query = supabase.from('movimientos_bancarios').select('*');

        const empresaValida = empresaId && empresaId !== 'undefined' && empresaId !== 'null' && empresaId !== '' && empresaId !== 'ALL';

        if (empresaValida) {
            // Hay empresa seleccionada: filtramos por ella (aplica a admin y cliente).
            // Antes se confiaba en el id recibido; ahora se comprueba primero.
            const motivo = await puedeVerEmpresa(req, empresaId);
            if (motivo) return sinAcceso(res, motivo);
            query.eq('empresa_id', empresaId);
        } else if (esAdmin) {
            // El ADMIN sin empresa seleccionada ve la Bóveda "global", pero global
            // significa TODAS SUS empresas, no todas las del sistema: antes esta rama
            // iba sin filtro y le mostraba también los movimientos bancarios de otras
            // organizaciones.
            //
            // Y para quien empieza desde cero, "sus empresas" son las que tenga
            // asignadas, no las de toda la oficina.
            const visibles = await empresasVisibles(req);
            const idsDeMiOrganizacion = visibles ?? await empresasDeLaOrganizacion(req);
            if (idsDeMiOrganizacion.length === 0) {
                // Organización sin empresas (un tenant nuevo): no hay nada que mostrar.
                return res.status(200).json([]);
            }
            console.log(`📊 Vista global/admin: ${idsDeMiOrganizacion.length} empresas de la organización.`);
            query.in('empresa_id', idsDeMiOrganizacion);
        } else {
            // 🔒 Un CLIENTE sin empresa NO puede ver datos globales del búnker
            console.log("🔒 Cliente sin empresa seleccionada: devolviendo espacio vacío.");
            return res.status(200).json([]);
        }

        const { data, error } = await query.order('fecha', { ascending: false });

        if (error) throw error;

        console.log(`[BACKEND] Devolviendo ${data.length} movimientos al Frontend.`);
        res.status(200).json(data);
    } catch (error) {
        console.error("Error al obtener movimientos:", error);
        res.status(500).json({ message: "Error al recuperar movimientos." });
    }
};
// 3. CONECTAR ROBOT (BCI)
export const connectBank = async (req, res) => {
    try {
        let { empresaId } = req.query;
        const { banco, rut, clave } = req.body;

        // Limpiamos el ID para aceptar el Modo Global (Admin)
        if (empresaId === 'null' || empresaId === 'undefined' || empresaId === '') {
            empresaId = null;
        }
        // Este endpoint ESCRIBE movimientos bancarios. Sin la comprobación, con el
        // id a mano se podía cargar una cartola en la cuenta de otra empresa.
        const motivoConn = await puedeVerEmpresa(req, empresaId);
        if (motivoConn) return sinAcceso(res, motivoConn);
        if (!empresaId && veSoloAsignadas(req)) {
            return sinAcceso(res, 'Selecciona una de tus empresas antes de conectar el banco.');
        }

        console.log(`\n🤖 [ORQUESTADOR] Preparando ejecución de script para: ${banco || 'BCI'}`);

        if (!rut || !clave) {
            return res.status(400).json({ message: "Se requieren credenciales (RUT y Clave) para iniciar el robot." });
        }

        // ==========================================
        // FASE 1: PREPARAR Y EJECUTAR EL INDEX.MJS
        // ==========================================
        // Nota: Corregí "scrpits" a "scripts" en la ruta, cámbialo si tu carpeta realmente tiene el typo
        const scriptPath = path.resolve(__dirname, '../components/bancos/scripts/index.mjs');
        const jsonResultPath = path.resolve(__dirname, '../components/bancos/scripts/cartolas_bci.json');

        // Separamos el RUT y el DV para inyectarlos (ej: 12345678-9)
        const rutLimpio = rut.replace(/[^0-9kK]/gi, '');
        const rutCuerpo = rutLimpio.slice(0, -1);
        const rutDv = rutLimpio.slice(-1);

        // Creamos un entorno temporal con las credenciales de la web
        const envTemporal = {
            ...process.env,
            BANCO_RUT: rutCuerpo,
            BANCO_DV: rutDv,
            BANCO_PASS: clave
        };

        console.log(`🚀 [ORQUESTADOR] Disparando comando: node ${scriptPath}`);
        
        // Ejecutamos tu script como si lo escribieras en la terminal
        // maxBuffer aumentado por si el robot imprime muchos logs
        const { stdout, stderr } = await execPromise(`node "${scriptPath}"`, { 
            env: envTemporal,
            maxBuffer: 1024 * 1024 * 10 
        });

        console.log("--- 📜 LOGS DEL SCRIPT INDEX.MJS ---");
        console.log(stdout);

        if (stderr && !stderr.includes('Debugger attached')) {
            console.warn("--- ⚠️ ADVERTENCIAS DEL SCRIPT ---", stderr);
        }

        // ==========================================
        // FASE 2: LEER EL JSON GENERADO
        // ==========================================
        console.log("📂 [ORQUESTADOR] Leyendo JSON resultante...");
        const dataArchivo = await fs.readFile(jsonResultPath, 'utf8');
        const movimientosPorMes = JSON.parse(dataArchivo);

        const batch = [];
        let totalExtraidos = 0;

        for (const mes in movimientosPorMes) {
            movimientosPorMes[mes].forEach(m => {
                if (m.fecha && !m.fecha.includes("Desde") && !m.fecha.includes("AAAA")) {
                    const [d, mon, a] = m.fecha.split('-');
                    batch.push({
                        empresa_id: empresaId,
                        banco: (banco || 'BCI').toUpperCase(), 
                        fecha: `${a}-${mon}-${d}`,
                        oficina: m.oficina || '',
                        descripcion: m.movimiento,
                        documento: m.documento || '0',
                        cargo: parseFloat(m.cargo) || 0,
                        abono: parseFloat(m.abono) || 0,
                        saldo: parseFloat(m.saldo) || 0
                    });
                    totalExtraidos++;
                }
            });
        }

        if (totalExtraidos === 0) {
             return res.status(200).json({ message: "Robot finalizó, pero no encontró movimientos." });
        }

        // ==========================================
        // FASE 3: FILTRO ANTI-DUPLICADOS Y SUBIDA
        // ==========================================
        console.log(`🔍 [ORQUESTADOR] Filtrando duplicados en Supabase...`);
        const queryExistentes = supabase.from('movimientos_bancarios').select('fecha, descripcion, cargo, abono, saldo');
        
        if (empresaId) queryExistentes.eq('empresa_id', empresaId);
        else queryExistentes.is('empresa_id', null);

        const { data: existentes, error: errorExistentes } = await queryExistentes;
        if (errorExistentes) throw errorExistentes;

        const movimientosNuevos = [];
        let duplicadosEncontrados = 0;

        for (const m of batch) {
            const yaExiste = existentes.some(ext => 
                ext.fecha === m.fecha && 
                ext.descripcion === m.descripcion &&
                parseFloat(ext.cargo) === m.cargo &&
                parseFloat(ext.abono) === m.abono &&
                parseFloat(ext.saldo) === m.saldo
            );

            if (yaExiste) duplicadosEncontrados++;
            else movimientosNuevos.push(m);
        }

        if (movimientosNuevos.length > 0) {
            const { error } = await supabase.from('movimientos_bancarios').insert(movimientosNuevos);
            if (error) throw error;
        }

        // Limpieza: Borramos el archivo JSON para no dejar basura
        await fs.unlink(jsonResultPath).catch(() => {});

        console.log(`✅ [ORQUESTADOR] Proceso completado. Nuevos: ${movimientosNuevos.length} | Repetidos: ${duplicadosEncontrados}`);
        res.status(200).json({ 
            message: `Sincronización exitosa. Se guardaron ${movimientosNuevos.length} nuevos y se ignoraron ${duplicadosEncontrados} repetidos.` 
        });
        
    } catch (error) {
        console.error("❌ [ORQUESTADOR] Error en la ejecución:", error);
        res.status(500).json({ message: "Falló la ejecución del script externo.", detalle: error.message });
    }
};
export const uploadCartola = async (req, res) => {
    try {
        let empresaId = req.query.empresaId || req.body.empresaId;
        const { movimientos } = req.body;

        if (empresaId === 'null' || empresaId === 'undefined' || empresaId === '') {
            empresaId = null;
        }

        // Igual que al conectar el banco: esto ESCRIBE movimientos, así que la
        // empresa se comprueba antes de tocar nada.
        const motivoCartola = await puedeVerEmpresa(req, empresaId);
        if (motivoCartola) return sinAcceso(res, motivoCartola);
        if (!empresaId && veSoloAsignadas(req)) {
            return sinAcceso(res, 'Selecciona una de tus empresas antes de subir la cartola.');
        }

        console.log("\n📥 [BACKEND] === RECIBIENDO PETICIÓN DE EXCEL ===");
        console.log("🏢 Empresa ID:", empresaId ? empresaId : "NULL (Modo Global)");
        
        if (!movimientos || movimientos.length === 0) {
            return res.status(400).json({ message: "No se detectaron movimientos válidos." });
        }

        // 1. OBTENER MOVIMIENTOS YA EXISTENTES EN LA BASE DE DATOS
        console.log("🔍 Consultando base de datos para buscar posibles repetidos...");
        const queryExistentes = supabase.from('movimientos_bancarios').select('fecha, descripcion, cargo, abono, saldo');
        
        if (empresaId) {
            queryExistentes.eq('empresa_id', empresaId);
        } else {
            queryExistentes.is('empresa_id', null);
        }

        const { data: existentes, error: errorExistentes } = await queryExistentes;
        if (errorExistentes) throw errorExistentes;

        // 2. FILTRO INTELIGENTE: Separar Nuevos de Duplicados
        const movimientosNuevos = [];
        let duplicadosEncontrados = 0;

        for (const m of movimientos) {
            const cargoNum = parseFloat(m.cargo) || 0;
            const abonoNum = parseFloat(m.abono) || 0;
            const saldoNum = parseFloat(m.saldo) || 0;
            const descripcionLimpia = m.descripcion || 'Sin descripción';
            
            // "Huella dactilar": ¿Existe ya este movimiento en la BD?
            const yaExiste = existentes.some(ext => 
                ext.fecha === m.fecha && 
                ext.descripcion === descripcionLimpia &&
                parseFloat(ext.cargo) === cargoNum &&
                parseFloat(ext.abono) === abonoNum &&
                parseFloat(ext.saldo) === saldoNum
            );

            if (yaExiste) {
                duplicadosEncontrados++; // Lo ignoramos y sumamos al contador
            } else {
                // Es nuevo, lo empaquetamos para subir
                movimientosNuevos.push({
                    empresa_id: empresaId, 
                    banco: m.banco || 'BCI',
                    fecha: m.fecha,
                    oficina: m.oficina || '',
                    descripcion: descripcionLimpia,
                    documento: m.documento || '0',
                    cargo: cargoNum,
                    abono: abonoNum,
                    saldo: saldoNum
                });
            }
        }

        console.log(`📊 Resumen del Excel: ${movimientos.length} filas leídas.`);
        console.log(`⚠️  Repetidos bloqueados: ${duplicadosEncontrados}`);
        console.log(`🚀 Nuevos a inyectar: ${movimientosNuevos.length}`);

        // 3. GUARDAR SÓLO LOS NUEVOS
        if (movimientosNuevos.length > 0) {
            const { error } = await supabase.from('movimientos_bancarios').insert(movimientosNuevos);
            if (error) throw error;
            console.log("✅ [BACKEND] ¡Inyección exitosa!");
        } else {
            console.log("✅ [BACKEND] No hubo nada que subir, todos los datos ya existían.");
        }

        // Devolvemos el mensaje dinámico al Frontend
        res.status(201).json({ 
            message: `Cartola analizada. Se guardaron ${movimientosNuevos.length} nuevos y se ignoraron ${duplicadosEncontrados} repetidos.` 
        });

    } catch (error) {
        console.error("\n❌ [BACKEND] ERROR FATAL AL GUARDAR EN BD:");
        console.error("Detalle del error:", error);
        res.status(500).json({ message: "Error interno al guardar en BD.", error: error.message });
    }
};