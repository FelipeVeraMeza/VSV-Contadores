import { Router } from 'express';
import multer from 'multer';
import {
    getAccountingMetrics,
    getChartOfAccounts,
    getJournalEntries,
    runBankReconciliationIA,
    uploadAccountingExcel,
    guardarComprobante,
    getComprobantes,
    crearCuenta,
    editarCuenta,
    eliminarCuenta
} from '../controllers/accounting.controllers.js';
import { requireSession } from "../middleware/auth.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(requireSession);

router.get('/metrics',           getAccountingMetrics);
router.get('/chart-of-accounts', getChartOfAccounts);
router.get('/journal-entries',   getJournalEntries);
router.post('/reconcile-ia',     runBankReconciliationIA);
router.post('/importar-excel',   upload.single('archivo'), uploadAccountingExcel);
router.post('/comprobantes',     guardarComprobante);
router.get('/comprobantes',      getComprobantes);

// Plan de Cuentas CRUD
router.post('/plan-cuentas',       crearCuenta);
router.put('/plan-cuentas/:id',    editarCuenta);
router.delete('/plan-cuentas/:id', eliminarCuenta);

export default router;
