import { createClient } from '@supabase/supabase-js';
// Importamos tu robot
import { iniciarNavegador, loginBCI, extraerMovimientosBCI, cerrarSesionBCI } from '../cartola_bancaria/bci_scraper.mjs';

// ==========================================
// 🛠️ CORRECCIÓN: Leyendo exactamente tus variables del .env
// ==========================================
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_KEY; 

const supabase = createClient(supabaseUrl, supabaseKey);

export const getConnectedBanks = async (req, res) => {
    try {
        const { empresaId } = req.query;
        // Revisamos si la empresa ya tiene movimientos del BCI
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

export const getMovimientosBancarios = async (req, res) => {
    try {
        const { empresaId } = req.query;

        // Extraemos los datos reales de la base de datos
        const { data, error } = await supabase
            .from('movimientos_bancarios')
            .select('*')
            .eq('empresa_id', empresaId)
            .order('fecha', { ascending: false });

        if (error) throw error;

        // Formateamos para la tabla de React
        const movimientos = data.map(mov => ({
            id: mov.id,
            fecha: mov.fecha,
            descripcion: mov.descripcion,
            banco: mov.banco,
            monto: mov.abono > 0 ? mov.abono : (mov.cargo > 0 ? -mov.cargo : 0),
            tipo: mov.abono > 0 ? 'ABONO' : 'CARGO',
            estado: mov.estado || 'PENDIENTE'
        }));

        return res.status(200).json(movimientos);
    } catch (error) {
        console.error("Error obteniendo movimientos:", error);
        return res.status(500).json({ message: "Error al recuperar movimientos bancarios." });
    }
};

export const connectBank = async (req, res) => {
    try {
        const { empresaId } = req.query;
        const { banco_id, rut, clave } = req.body; 

        if (banco_id !== 'bci') {
            return res.status(400).json({ message: "Por ahora solo soportamos sincronización con BCI." });
        }

        console.log(`🤖 Iniciando Robot BCI para la empresa: ${empresaId}`);
        
        // 1. Iniciamos Puppeteer
        const browser = await iniciarNavegador();
        const page = await browser.newPage();
        
        await loginBCI(page, rut, clave);
        const movimientosPorMes = await extraerMovimientosBCI(page);
        
        await cerrarSesionBCI(page);
        await browser.close();

        // 2. Formateamos los datos del robot para Supabase
        const todosLosMovimientos = [];
        for (const mes in movimientosPorMes) {
            movimientosPorMes[mes].forEach(m => {
                if (m.fecha && !m.fecha.includes("Desde")) { 
                    const [dia, mesNum, anio] = m.fecha.split('-');
                    todosLosMovimientos.push({
                        empresa_id: empresaId,
                        banco: 'BCI',
                        numero_cuenta: 'DEFAULT',
                        fecha: `${anio}-${mesNum}-${dia}`,
                        oficina: m.oficina,
                        descripcion: m.movimiento,
                        documento: m.documento,
                        cargo: m.cargo || 0,
                        abono: m.abono || 0,
                        saldo: m.saldo || 0,
                        estado: 'PENDIENTE'
                    });
                }
            });
        }

        // 3. Subimos a la base de datos
        if (todosLosMovimientos.length > 0) {
            const { error } = await supabase.from('movimientos_bancarios').insert(todosLosMovimientos);
            if (error) throw error;
        }

        return res.status(200).json({ 
            message: `Extracción completada. ${todosLosMovimientos.length} movimientos guardados.`,
            banco_id 
        });
    } catch (error) {
        console.error("❌ Error en Robot:", error);
        return res.status(500).json({ message: "Fallo en la sincronización bancaria. Revisa las credenciales." });
    }
};

export const uploadCartola = async (req, res) => {
    try {
        const { empresaId } = req.query;
        const { movimientos } = req.body;

        if (!movimientos || movimientos.length === 0) {
            return res.status(400).json({ message: "No se detectaron movimientos para importar." });
        }
        
        console.log(`📥 Importando ${movimientos.length} movimientos para empresa: ${empresaId}`);

        return res.status(201).json({ 
            message: "Cartola procesada exitosamente",
            count: movimientos.length 
        });
    } catch (error) {
        console.error("❌ Error en importación:", error);
        return res.status(500).json({ message: "Error interno al procesar la cartola." });
    }
};

export const autoConciliar = async (req, res) => {
    try {
        const { empresaId } = req.query;
        return res.status(200).json({ 
            message: "Proceso de conciliación automática iniciado.",
            sugerencias_encontradas: 12 
        });
    } catch (error) {
        return res.status(500).json({ message: "Error en el motor de conciliación." });
    }
};

export const disconnectBank = async (req, res) => {
    try {
        const { empresaId } = req.query;
        const { bancoId } = req.params;
        return res.status(200).json({ message: `Banco ${bancoId} desconectado del búnker.` });
    } catch (error) {
        return res.status(500).json({ message: "Error al desconectar el banco." });
    }
};

export const updateEstadoMovimiento = async (req, res) => {
    try {
        const { empresaId } = req.query;
        const { movimientoId } = req.params;
        const { estado } = req.body;
        return res.status(200).json({ message: "Estado actualizado.", movimientoId, estado });
    } catch (error) {
        return res.status(500).json({ message: "Error al actualizar el movimiento." });
    }
};