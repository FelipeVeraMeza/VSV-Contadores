import { z } from 'zod';
import { rutSchema, emailSchema, uuidParamsSchema } from './baseSchemas.js';

const userBase = z.object({
  nombre: z.string().min(3, "Nombre muy corto").trim(),
  rut: rutSchema,
  email: emailSchema,
  clave: z.string().min(8, "Mínimo 8 caracteres").max(128).optional().or(z.literal('')),
  rol: z.enum(['Administrador', 'Consultor', 'Cliente']),
  activo: z.boolean().optional(),
  assignedCompanies: z.array(z.string().uuid("ID de compañía no válido")).optional()
});

// Al login se entra con el RUT sin dígito verificador. La cuenta master sigue
// entrando con su correo, así que acá NO se puede validar formato de email:
// el controlador decide qué es según el texto traiga o no una arroba.
//
// Se aceptan las dos llaves (`identificador` y `email`) a propósito: si el
// frontend se despliega antes que el backend —o al revés— el login sigue
// funcionando en vez de caerse con un 400.
export const loginSchema = z.object({
  body: z.object({
    identificador: z.string().min(1).max(120).trim().optional(),
    email: z.string().min(1).max(120).trim().optional(),
    clave: z.string().min(1, "La clave es requerida")
  }).refine((b) => b.identificador || b.email, {
    message: "Ingresa tu RUT",
    path: ["identificador"]
  })
});

export const createUserSchema = z.object({ body: userBase });

export const updateUserSchema = z.object({
  body: userBase.partial().extend({
    clave: z.string().min(8).optional().or(z.literal(''))
  })
});

export const deleteUserSchema = uuidParamsSchema;