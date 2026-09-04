import { Router } from 'express';
import multer from 'multer';
import {
    getAccountingMetrics,
    getChartOfAccounts,
    getJournalEntries,
    getBalance,
    getBalancePdf,
    runBankReconciliationIA,
    uploadAccountingExcel,
    guardarComprobante,
    getComprobantes,
    getDocumentosAfectables,
    eliminarComprobante,
    revisarComprobante,
    crearCuenta,
    editarCuenta,
    eliminarCuenta
} from '../controllers/accounting.controllers.js';
import { requireSession, requireModulo } from "../middleware/auth.js";
import { uuidValido } from "../middleware/uuid.middleware.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(requireSession);

router.get('/metrics',           getAccountingMetrics);
router.get('/chart-of-accounts', getChartOfAccounts);
router.get('/journal-entries',   getJournalEntries);
router.get('/balance',           getBalance);
router.get('/balance/pdf',       getBalancePdf);
router.post('/reconcile-ia',     runBankReconciliationIA);
router.post('/importar-excel',   upload.single('archivo'), uploadAccountingExcel);
router.post('/comprobantes',        guardarComprobante);
router.get('/comprobantes',         getComprobantes);
router.get('/documentos-afectables', getDocumentosAfectables);
router.delete('/comprobantes/:id', uuidValido('id'),  eliminarComprobante);
// Aprobar o rechazar. Es PATCH y no PUT: cambia el estado de la revisión, no
// reemplaza el comprobante. Quién puede hacerlo lo decide el controlador —nadie
// revisa lo suyo—, no la ruta.
router.patch('/comprobantes/:id/revision', uuidValido('id'), revisarComprobante);

// Plan de Cuentas CRUD
router.post('/plan-cuentas',       crearCuenta);
router.put('/plan-cuentas/:id', uuidValido('id'),    editarCuenta);
router.delete('/plan-cuentas/:id', uuidValido('id'), eliminarCuenta);

export default router;
