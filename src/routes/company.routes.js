import { Router } from 'express';

import {
  getAssignedCompanies,
  getCompanies,
  listCompaniesLista,
  getCompanyById,
  createCompany, 
  updateCompany, 
  deleteCompany 
} from '../controllers/companies.controllers.js';

import { requireSession, requireAdmin } from "../middleware/auth.js";
import { validateSchema } from "../middleware/validator.middleware.js";

import { 
  createCompanySchema, 
  updateCompanySchema, 
  deleteCompanySchema 
} from "../schemas/company.schema.js";

const router = Router();

router.get('/assigned', requireSession, getAssignedCompanies);
// Lista canónica de empresas de la organización (fuente única de los selectores).
// Va ANTES de '/:id' para que no la capture la ruta con parámetro.
router.get('/lista', requireSession, listCompaniesLista);
router.get('/', requireSession, getCompanies);
router.get('/:id', requireSession, requireAdmin, getCompanyById);

router.post('/', 
  requireSession, 
  requireAdmin, 
  validateSchema(createCompanySchema), 
  createCompany
);

router.put('/:id', 
  requireSession, 
  requireAdmin, 
  validateSchema(updateCompanySchema), 
  updateCompany
);

router.delete('/:id', 
  requireSession, 
  requireAdmin, 
  validateSchema(deleteCompanySchema), 
  deleteCompany
);

export default router;