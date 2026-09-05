// ============================================================================
// PERSONAS DE UNA EMPRESA · quién pagó, últimas facturas, tickets vinculados
// ----------------------------------------------------------------------------
// Del pedido del 04-09-2026:
//   · «añadir a una empresa nombres de personas externas o internas, para no
//     tener problemas de quién me pagó por esa factura»
//   · «buscar en el CRM con el RUT de la empresa, del representante y de quien
//     me pagó»
//   · «una empresa puede ser facturada hasta 4 veces al mes, y si se le hizo una
//     nota de crédito debe salir que fue anulada»
//   · «si creo una tarea poder vincular una empresa, para saber a quién le debo
//     trabajar»
//
// Lo que más se cuida acá es que el registro de QUIÉN PAGÓ no se pueda perder:
// es dato contable, y si se borra el contacto no puede desaparecer con él.
// ============================================================================
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { pedir, pool, cerrar, alTerminar } from '../arnes.mjs';

after(cerrar);

const MARCA = `QA-cto-${Date.now().toString(36)}`;

const unaEmpresa = async () => {
  const { rows } = await pool.query(
    `SELECT id, razon_social FROM empresa WHERE es_principal = false AND activo LIMIT 1`);
  return rows[0] || null;
};

describe('Personas de una empresa', () => {
  let empresa = null, contactoId = null;

  test('1 · se agrega una persona externa', async () => {
    empresa = await unaEmpresa();
    if (!empresa) return;
    alTerminar(async () => {
      await pool.query('DELETE FROM empresa_contacto WHERE nombre LIKE $1', [`${MARCA}%`]);
    });

    const r = await pedir(`/clientes/crm/${empresa.id}/contactos`, {
      metodo: 'POST',
      cuerpo: { nombre: `${MARCA} contador`, rol: 'pagador', externo: true,
                rut: '11111111-1', email: 'x@qa.local', telefono: '+56911111111' },
    });
    assert.ok([200, 201].includes(r.estado), `respondió ${r.estado}: ${JSON.stringify(r.datos)}`);
    contactoId = r.datos?.contacto?.id;
    assert.ok(contactoId, 'no devolvió el id');
  });

  test('2 · aparece en la lista de la empresa', async () => {
    if (!empresa || !contactoId) return;
    const r = await pedir(`/clientes/crm/${empresa.id}/contactos`);
    assert.equal(r.estado, 200);
    const c = (r.datos.contactos || []).find(x => x.id === contactoId);
    assert.ok(c, 'se creó pero no aparece en la lista');
    assert.equal(c.rol, 'pagador');
    assert.equal(c.externo, true, 'no guardó que es una persona externa');
    assert.equal(c.rut, '11111111-1', 'el RUT no se devuelve descifrado');
  });

  test('3 · un rol inventado se rechaza', async () => {
    if (!contactoId) return;
    const r = await pedir(`/clientes/crm/contactos/${contactoId}`, {
      metodo: 'PUT', cuerpo: { rol: 'jefe_supremo' },
    });
    assert.equal(r.estado, 400, `aceptó un rol que no existe (${r.estado})`);
  });

  test('4 · una empresa de otra organización no deja ver sus contactos', async () => {
    const { rows } = await pool.query(
      `SELECT e.id FROM empresa e
        WHERE e.organizacion_id IS DISTINCT FROM
              (SELECT organizacion_id FROM usuario WHERE activo LIMIT 1) LIMIT 1`);
    if (!rows.length) return;
    const r = await pedir(`/clientes/crm/${rows[0].id}/contactos`);
    assert.equal(r.estado, 404, `se pudieron ver contactos de otra organización (${r.estado})`);
  });

  test('5 · sin nombre no se crea', async () => {
    if (!empresa) return;
    const r = await pedir(`/clientes/crm/${empresa.id}/contactos`, {
      metodo: 'POST', cuerpo: { nombre: '   ' },
    });
    assert.equal(r.estado, 400, `respondió ${r.estado}`);
  });
});

describe('Quién pagó esta factura', () => {
  let empresa = null, contactoId = null, cobroId = null, estadoOriginal = null;

  test('1 · preparación', async () => {
    empresa = await unaEmpresa();
    if (!empresa) return;
    alTerminar(async () => {
      await pool.query('DELETE FROM empresa_contacto WHERE nombre LIKE $1', [`${MARCA}%`]);
    });

    const c = await pedir(`/clientes/crm/${empresa.id}/contactos`, {
      metodo: 'POST', cuerpo: { nombre: `${MARCA} pagador`, rol: 'pagador' },
    });
    contactoId = c.datos?.contacto?.id;

    const { rows } = await pool.query(
      `SELECT id, estado, fecha_pago FROM cobro_mensual
        WHERE empresa_id = $1 AND folio IS NOT NULL LIMIT 1`, [empresa.id]);
    if (rows.length) {
      cobroId = rows[0].id;
      estadoOriginal = rows[0];
      // Lo que se toque acá se devuelve a como estaba: son cobros de verdad.
      alTerminar(async () => {
        await pool.query(
          `UPDATE cobro_mensual SET estado = $1, fecha_pago = $2,
                  pagado_por_contacto_id = NULL, pagado_por_nombre = NULL, medio_pago = NULL
            WHERE id = $3`,
          [estadoOriginal.estado, estadoOriginal.fecha_pago, cobroId]);
      });
    }
  });

  test('2 · se marca pagada diciendo quién pagó', async () => {
    if (!cobroId || !contactoId) return;
    const r = await pedir(`/clientes/crm/cobros/${cobroId}/pago`, {
      metodo: 'PATCH',
      cuerpo: { contactoId, medioPago: 'transferencia', fechaPago: '2026-09-04' },
    });
    assert.equal(r.estado, 200, `respondió ${r.estado}: ${JSON.stringify(r.datos)}`);

    const { rows } = await pool.query(
      `SELECT estado, pagado_por_nombre, medio_pago, pagado_por_contacto_id
         FROM cobro_mensual WHERE id = $1`, [cobroId]);
    assert.equal(rows[0].estado, 'PAGADA');
    assert.equal(rows[0].pagado_por_nombre, `${MARCA} pagador`,
      'no guardó el nombre de quien pagó');
    assert.equal(rows[0].medio_pago, 'transferencia');
  });

  test('3 · un medio de pago inventado se rechaza', async () => {
    if (!cobroId) return;
    const r = await pedir(`/clientes/crm/cobros/${cobroId}/pago`, {
      metodo: 'PATCH', cuerpo: { medioPago: 'criptomonedas' },
    });
    assert.equal(r.estado, 400, `aceptó un medio de pago que no existe (${r.estado})`);
  });

  test('4 · no se puede poner como pagador a alguien de OTRA empresa', async () => {
    if (!cobroId) return;
    const { rows } = await pool.query(
      `SELECT c.id FROM empresa_contacto c WHERE c.empresa_id <> $1 LIMIT 1`, [empresa.id]);
    if (!rows.length) return;
    const r = await pedir(`/clientes/crm/cobros/${cobroId}/pago`, {
      metodo: 'PATCH', cuerpo: { contactoId: rows[0].id },
    });
    assert.equal(r.estado, 400, `aceptó un pagador ajeno a la empresa (${r.estado})`);
  });

  test('5 · borrar al pagador NO borra el registro del pago', async () => {
    // Lo más importante de esta suite. Quien pagó en marzo pagó en marzo: si al
    // borrar el contacto se perdiera el dato, el registro contable cambiaría
    // hacia atrás.
    if (!cobroId || !contactoId) return;
    const r = await pedir(`/clientes/crm/contactos/${contactoId}`, { metodo: 'DELETE' });
    assert.equal(r.estado, 200, `respondió ${r.estado}`);
    assert.equal(r.datos.desactivado, true,
      'borró de verdad a alguien que figura como pagador');

    const { rows } = await pool.query(
      `SELECT pagado_por_nombre FROM cobro_mensual WHERE id = $1`, [cobroId]);
    assert.equal(rows[0].pagado_por_nombre, `${MARCA} pagador`,
      'se perdió el nombre de quien pagó al borrar el contacto');
  });
});

describe('Las últimas facturas de una empresa', () => {
  test('devuelve las últimas, no solo la del mes', async () => {
    const empresa = await unaEmpresa();
    if (!empresa) return;
    const r = await pedir(`/clientes/crm/${empresa.id}/facturas?limite=3`);
    assert.equal(r.estado, 200, `respondió ${r.estado}`);
    assert.ok(Array.isArray(r.datos.facturas), 'no devolvió la lista');
    assert.ok((r.datos.facturas || []).length <= 3, 'no respetó el límite');
  });

  test('vienen de la más nueva a la más vieja', async () => {
    const { rows } = await pool.query(
      `SELECT empresa_id FROM cobro_mensual WHERE folio IS NOT NULL
        GROUP BY empresa_id HAVING COUNT(*) > 2 LIMIT 1`);
    if (!rows.length) return;
    const r = await pedir(`/clientes/crm/${rows[0].empresa_id}/facturas?limite=5`);
    if (r.estado !== 200) return;
    const fechas = (r.datos.facturas || [])
      .map(f => new Date(f.fechaEmision || f.periodo).getTime());
    assert.deepEqual(fechas, [...fechas].sort((a, b) => b - a),
      'las facturas no vienen ordenadas de la más nueva a la más vieja');
  });

  test('una factura ANULADA se marca como tal', async () => {
    // «Si se le hizo una nota de crédito debe salir que fue anulada.»
    const { rows } = await pool.query(
      `SELECT empresa_id FROM cobro_mensual
        WHERE estado = 'ANULADA' OR monto_anulado > 0 LIMIT 1`);
    if (!rows.length) {
      console.log('      ℹ no hay facturas anuladas para comprobarlo');
      return;
    }
    const r = await pedir(`/clientes/crm/${rows[0].empresa_id}/facturas?limite=12`);
    if (r.estado !== 200) return;
    const anuladas = (r.datos.facturas || []).filter(f => f.anulada);
    assert.ok(anuladas.length > 0,
      'la empresa tiene facturas anuladas y ninguna viene marcada como anulada');
  });

  test('el límite no se puede forzar a un número absurdo', async () => {
    const empresa = await unaEmpresa();
    if (!empresa) return;
    const r = await pedir(`/clientes/crm/${empresa.id}/facturas?limite=99999`);
    if (r.estado !== 200) return;
    assert.ok((r.datos.facturas || []).length <= 12,
      'se pudo pedir una cantidad ilimitada de facturas');
  });
});

describe('Buscar en el CRM por quien pagó', () => {
  test('la lista trae los pagadores y los contactos', async () => {
    const r = await pedir('/clientes/crm');
    if (r.estado !== 200) return;
    const c = (r.datos.clients || [])[0];
    if (!c) return;
    for (const campo of ['pagadores', 'contactosNombres', 'ultimoPagador']) {
      assert.ok(Object.hasOwn(c, campo),
        `la lista no trae «${campo}»: no se podría buscar por quien pagó`);
    }
  });

  test('el buscador liviano de empresas responde', async () => {
    const r = await pedir('/clientes/crm/buscar?q=spa');
    assert.equal(r.estado, 200, `respondió ${r.estado}`);
    assert.ok(Array.isArray(r.datos.empresas));
    // Devuelve solo lo necesario: nombre, RUT y si está activa.
    for (const e of r.datos.empresas) {
      assert.ok(e.id && e.razonSocial !== undefined, 'faltan campos básicos');
      assert.ok(!Object.hasOwn(e, 'claveSII'), 'el buscador expone credenciales');
    }
  });

  test('con menos de dos letras no busca', async () => {
    const r = await pedir('/clientes/crm/buscar?q=a');
    if (r.estado !== 200) return;
    assert.equal((r.datos.empresas || []).length, 0,
      'busca con una sola letra: devolvería media cartera en cada tecla');
  });
});

describe('Vincular un ticket a una empresa', () => {
  test('una tarea se puede crear ligada a una empresa', async () => {
    const empresa = await unaEmpresa();
    if (!empresa) return;

    const r = await pedir('/crm/tareas', {
      metodo: 'POST',
      cuerpo: { titulo: `${MARCA} ticket de empresa`, empresaId: empresa.id },
    });
    alTerminar(async () => {
      await pool.query('DELETE FROM tarea WHERE titulo LIKE $1', [`${MARCA}%`]);
    });
    assert.ok([200, 201].includes(r.estado), `respondió ${r.estado}: ${JSON.stringify(r.datos)}`);
    const id = r.datos?.tarea?.id || r.datos?.id;
    if (!id) return;

    const { rows } = await pool.query('SELECT empresa_id FROM tarea WHERE id = $1', [id]);
    assert.equal(rows[0].empresa_id, empresa.id,
      'la tarea se creó pero no quedó ligada a la empresa');
  });

  test('una empresa inventada se rechaza, no se guarda a medias', async () => {
    const r = await pedir('/crm/tareas', {
      metodo: 'POST',
      cuerpo: { titulo: `${MARCA} mala`, empresaId: '00000000-0000-0000-0000-000000000000' },
    });
    assert.ok(r.estado >= 400 && r.estado < 500,
      `respondió ${r.estado} con una empresa que no existe`);
    assert.notEqual(r.estado, 500, 'devolvió 500 en vez de un error de validación');
  });

  test('el vínculo se puede quitar después', async () => {
    const empresa = await unaEmpresa();
    if (!empresa) return;
    const c = await pedir('/crm/tareas', {
      metodo: 'POST', cuerpo: { titulo: `${MARCA} desvincular`, empresaId: empresa.id },
    });
    if (![200, 201].includes(c.estado)) return;
    const id = c.datos?.tarea?.id || c.datos?.id;
    if (!id) return;

    const r = await pedir(`/crm/tareas/${id}`, { metodo: 'PUT', cuerpo: { empresaId: null } });
    assert.ok([200, 201].includes(r.estado), `respondió ${r.estado}`);
    const { rows } = await pool.query('SELECT empresa_id FROM tarea WHERE id = $1', [id]);
    assert.equal(rows[0].empresa_id, null, 'no se pudo desligar la tarea de la empresa');
  });
});

describe('Lo que esto revela del negocio', () => {
  test('cuántas tareas están ligadas a un cliente', async () => {
    const { rows: [b] } = await pool.query(
      `SELECT COUNT(*) FILTER (WHERE empresa_id IS NOT NULL)::int AS con_empresa,
              COUNT(*)::int AS total FROM tarea WHERE archivada_at IS NULL`);
    if (b.con_empresa === 0) {
      console.log(`      ℹ ${b.total} tareas y ninguna ligada a una empresa: ` +
                  'no se puede saber para qué cliente es cada trabajo');
    } else {
      console.log(`      ℹ ${b.con_empresa} de ${b.total} tareas ligadas a una empresa`);
    }
  });

  test('cuántas facturas no dicen quién pagó', async () => {
    const { rows: [b] } = await pool.query(
      `SELECT COUNT(*) FILTER (WHERE pagado_por_nombre IS NULL)::int AS sin_pagador,
              COUNT(*)::int AS pagadas
         FROM cobro_mensual WHERE estado = 'PAGADA'`);
    if (b.sin_pagador) {
      console.log(`      ℹ ${b.sin_pagador} de ${b.pagadas} facturas pagadas no dicen quién pagó ` +
                  '(se registra desde ahora; las anteriores no se pueden reconstruir)');
    }
  });
});
