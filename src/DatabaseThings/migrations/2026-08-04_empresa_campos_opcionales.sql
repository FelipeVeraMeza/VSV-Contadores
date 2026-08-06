-- ===================================================================================
-- 2026-08-04 · Giro y régimen tributario pasan a ser opcionales
-- ===================================================================================
-- POR QUÉ
-- RF-CL-23 dice que se debe poder VACIAR un campo, y la ficha ofrece hacerlo.
-- Pero `giro` y `regimen_tributario` estaban declarados NOT NULL, así que al
-- borrar el contenido el servidor intentaba escribir nulo y la base lo rechazaba:
-- el usuario veía un error genérico y el dato quedaba como estaba.
--
-- Se detectó el 04-08-2026 recorriendo el módulo como usuario.
--
-- Que sean obligatorios tampoco se sostiene: hoy hay clientes cargados con
-- «Sin Giro Especifico» y «Sin Regimen», que es un nulo escrito a mano y peor,
-- porque parece un dato de verdad.
--
-- `razon_social` se deja NOT NULL a propósito: es el nombre con el que se
-- identifica al cliente en toda la aplicación, y al crear ya se rellena con el
-- RUT si viene vacío. El servidor ahora avisa con un mensaje claro en vez de
-- dejar que reviente la base.
-- ===================================================================================

BEGIN;

ALTER TABLE empresa ALTER COLUMN giro               DROP NOT NULL;
ALTER TABLE empresa ALTER COLUMN regimen_tributario DROP NOT NULL;

-- Los marcadores escritos a mano pasan a ser nulos de verdad, que es lo que son.
UPDATE empresa SET giro = NULL
 WHERE giro IS NOT NULL AND TRIM(giro) ILIKE ANY (ARRAY['sin giro', 'sin giro especifico', 'sin giro específico', '-', 'n/a']);

UPDATE empresa SET regimen_tributario = NULL
 WHERE regimen_tributario IS NOT NULL AND TRIM(regimen_tributario) ILIKE ANY (ARRAY['sin regimen', 'sin régimen', '-', 'n/a']);

COMMENT ON COLUMN empresa.giro IS
    'Actividad económica. Opcional: nulo significa "no registrado", no "sin giro".';
COMMENT ON COLUMN empresa.regimen_tributario IS
    'Régimen ante el SII. Opcional: nulo significa "no registrado".';

COMMIT;
