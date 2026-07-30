import { Router } from 'express';
import { loginUser } from '../controllers/auth.controllers.js';
import { validateSchema } from "../middleware/validator.middleware.js";
import { loginSchema, createUserSchema } from "../schemas/user.schema.js";
import { registerPublicUser } from '../controllers/users.controllers.js';

const router = Router();

router.post('/login', validateSchema(loginSchema), loginUser);
// Ruta pública: usa registerPublicUser, que fuerza rol 'Cliente'. Llamar a
// `createUser` acá permitía registrarse como Administrador sin sesión.
router.post('/register', validateSchema(createUserSchema), registerPublicUser);

export default router;