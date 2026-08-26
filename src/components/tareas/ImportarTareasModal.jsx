// =====================================================================
// 📥 IMPORTAR TAREAS DESDE EXCEL
// ---------------------------------------------------------------------
// Cargar veinte pedidos a mano son veinte veces el mismo formulario. Esto
// los sube de una planilla — que es donde igual se escriben primero, en la
// reunión o en el correo del cliente.
//
// TRES DECISIONES QUE VALE LA PENA CONOCER:
//
// · LOS ENCABEZADOS NO TIENEN QUE SER EXACTOS. Se reconocen por aproximación
//   («titulo», «título», «Tarea», «Asunto» son lo mismo), igual que hace el
//   importador del CRM. Exigir un encabezado literal obliga a corregir la
//   planilla en vez de leerla.
//
// · EL PROYECTO Y EL RESPONSABLE SE ESCRIBEN POR NOMBRE, no por id: nadie
//   tiene a mano un UUID. Se resuelven contra los que existen, y si un nombre
//   no calza, esa fila se avisa ANTES de importar en vez de crear la tarea
//   suelto y sin dueño.
//
// · SE MUESTRA LA PREVIA Y RECIÉN AHÍ SE IMPORTA. Crear treinta tareas es
//   difícil de deshacer —hay que borrarlos de a uno— así que primero se ve
//   qué va a entrar, con sus errores marcados.
// =====================================================================
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
    X, Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle,
    Play, Download,
} from 'lucide-react';
import { read, utils, write } from 'xlsx';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { crearTareaApi, listarProyectosApi, listarTareasApi, agregarComentarioApi } from '@/services/crmService';
import { getCatalogosApi as getCatalogosPersonasApi } from '@/services/personaService';

const getSessionId = () => {
    try { return JSON.parse(localStorage.getItem('user') || '{}').sessionId; }
    catch { return null; }
};

// Deben calzar con las del backend (`crm.controllers.js`): si acá se aceptara
// algo que allá no, el servidor lo cambiaría por el valor por omisión sin decir
// nada y la planilla diría una cosa y el sistema otra.
const PRIORIDADES = ['baja', 'media', 'alta', 'critica'];
const ESTADOS = ['pendiente', 'en_proceso', 'en_revision', 'completada', 'cancelada'];

// Lo que la gente escribe de verdad en una planilla -> lo que entiende el
// sistema. Sin esto, «REALIZADO» no calza con ningun estado y la tarea entra
// como pendiente: en la planilla real de la oficina eran 110 tareas ya hechas
// que habrian aparecido como trabajo por hacer. Y «URGENTE» caia a «media»,
// justo al reves de lo que dice.
const SINONIMOS_ESTADO = {
    realizado: 'completada', realizada: 'completada', hecho: 'completada', hecha: 'completada',
    listo: 'completada', lista: 'completada', terminado: 'completada', terminada: 'completada',
    completado: 'completada', finalizado: 'completada', finalizada: 'completada', ok: 'completada',
    pendiente: 'pendiente', por_hacer: 'pendiente', abierto: 'pendiente', nuevo: 'pendiente',
    en_curso: 'en_proceso', en_progreso: 'en_proceso', proceso: 'en_proceso',
    haciendo: 'en_proceso', trabajando: 'en_proceso',
    revision: 'en_revision', en_revision: 'en_revision', revisar: 'en_revision',
    cancelado: 'cancelada', cancelada: 'cancelada', anulado: 'cancelada', descartado: 'cancelada',
};
const SINONIMOS_PRIORIDAD = {
    urgente: 'critica', critico: 'critica', critica: 'critica', maxima: 'critica', muy_alta: 'critica',
    alta: 'alta', alto: 'alta',
    media: 'media', medio: 'media', normal: 'media', regular: 'media',
    baja: 'baja', bajo: 'baja', minima: 'baja',
};

// Los encabezados que valen como titulo. En una constante porque los usan dos
// cosas: el mapeo de cada fila y la deteccion de que hoja del libro sirve.
const CANDIDATOS_TITULO = ['titulo', 'ticket', 'tarea', 'asunto', 'nombre', 'resumen'];

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Busca en la fila el valor cuyo encabezado MEJOR se parezca a alguno de los
// candidatos.
//
// ⚠️ NO basta con el primer `includes`, y esto costó una importación entera.
// Con la planilla real de la oficina, buscando «tarea» el primer encabezado que
// lo contiene es «FECHA TERMINO TAREA» —va antes que «TAREAS VARIAS» entre las
// columnas—, así que los títulos salieron siendo fechas: «Wed Sep 10 2025
// 00:00:45 GMT-0300 — VERTICALCAM SPA». Y como esa columna estaba vacía en 215
// de 226 filas, el resto quedó sin título y no se importaba.
//
// Ahora se puntúa cada coincidencia y gana la mejor:
//
//     igual (3)  >  empieza por (2)  >  la contiene (1)
//
// y a igual puntaje gana el encabezado más corto, que es el más específico.
// Con eso «TAREAS VARIAS» (empieza por) le gana a «FECHA TERMINO TAREA» (la
// contiene), que es lo que cualquiera diría mirando la planilla.
//
// `excluir` es la segunda red: para un campo de texto se descartan de entrada
// los encabezados que hablan de fechas. Dos defensas para el mismo error, porque
// el síntoma —títulos que son fechas— no se parece en nada a su causa.
// Devuelve el VALOR CRUDO, sin convertir a texto: una celda de fecha tiene que
// seguir siendo un Date. Convertirla acá escribiría «Tue Sep 09 2025 00:00:45
// GMT-0300 (hora de verano de Chile)», que es exactamente el error que hizo que
// los títulos salieran siendo fechas largas.
const pickCrudo = (row, candidatos, { excluir } = {}) => {
    const keys = Object.keys(row).filter(k => !excluir || !excluir.test(norm(k)));
    for (const cand of candidatos) {
        const puntuadas = keys
            .map(k => {
                const nk = norm(k);
                const puntaje = nk === cand ? 3 : nk.startsWith(cand) ? 2 : nk.includes(cand) ? 1 : 0;
                return { k, puntaje, largo: nk.length };
            })
            .filter(x => x.puntaje > 0 && String(row[x.k] ?? '').trim() !== '')
            .sort((a, b) => b.puntaje - a.puntaje || a.largo - b.largo);
        if (puntuadas.length) return row[puntuadas[0].k];
    }
    return '';
};

const pick = (row, candidatos, opciones) => {
    const v = pickCrudo(row, candidatos, opciones);
    return v === '' || v == null ? '' : String(v).trim();
};

// Los encabezados de fecha no sirven para ningún campo de texto.
const ES_FECHA = /fecha|vence|termino|inicio|plazo|limite/;

// Una fecha para LEER, no para guardar: «09-09-2025». Excel entrega un objeto
// Date, y volcarlo tal cual en un texto escribe «Tue Sep 09 2025 00:00:45
// GMT-0300 (hora de verano de Chile)», que ya nos pasó una vez en los títulos.
const aFechaCorta = (valor) => {
    if (!valor) return '';
    const d = valor instanceof Date ? valor : new Date(String(valor));
    if (Number.isNaN(d.getTime())) return String(valor).trim();
    return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
};

// Cual de las columnas de fecha es el VENCIMIENTO.
//
// Una planilla real trae varias: «FECHA DE INICIO», «FECHA TERMINO TAREA»,
// «FECHA DE PAGO»... Tomar la primera que diga «fecha» es tomar la de inicio,
// y entonces TODA tarea nace vencida. Se busca por especificidad: primero lo
// que nombra un vencimiento, y solo al final un «fecha» a secas — y nunca una
// columna que hable de inicio.
const columnaVencimiento = (row) => {
    const keys = Object.keys(row);
    const noEsInicio = (k) => !/inicio|comienzo|creacion|creado/i.test(norm(k));
    const porOrden = [
        (k) => /vence|vencimiento/i.test(norm(k)),
        (k) => /termino|termina|fin|finaliza/i.test(norm(k)),
        (k) => /limite/i.test(norm(k)),
        (k) => /plazo|entrega/i.test(norm(k)),
        (k) => /fecha/i.test(norm(k)),
    ];
    for (const coincide of porOrden) {
        const k = keys.find(key => coincide(key) && noEsInicio(key));
        if (k && String(row[k]).trim() !== '') return row[k];
    }
    return '';
};

// Excel entrega las fechas como Date (con cellDates) o como texto. Se acepta
// además lo que la gente escribe: 31-12-2026, 31/12/2026.
const aFecha = (valor) => {
    if (!valor) return null;
    if (valor instanceof Date && !Number.isNaN(valor.getTime())) return valor.toISOString();
    const t = String(valor).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(t)) return new Date(`${t.slice(0, 10)}T18:00:00`).toISOString();
    const m = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
    if (m) {
        const [, d, mes, a] = m;
        const anio = a.length === 2 ? `20${a}` : a;
        const iso = `${anio}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const prueba = new Date(`${iso}T18:00:00`);
        if (!Number.isNaN(prueba.getTime())) return prueba.toISOString();
    }
    return null;   // no se entiende: mejor sin fecha que con una inventada
};

const ImportarTareasModal = ({ onClose, onImportado }) => {
    // `crudo` son las filas de la hoja elegida SIN mapear. El mapeo se hace en
    // un `useMemo` mas abajo, y no al leer el archivo, porque depende de los
    // catalogos de proyectos y usuarios: si llegan despues —y llegan por red—
    // el mapeo hecho al leer no los tendria y ningun nombre se resolveria.
    const [crudo, setCrudo] = useState([]);
    const [libro, setLibro] = useState(null);
    const [hojas, setHojas] = useState([]);
    const [hojaElegida, setHojaElegida] = useState('');
    const [nombreArchivo, setNombreArchivo] = useState('');
    const [leyendo, setLeyendo] = useState(false);
    const [importando, setImportando] = useState(false);
    const [avance, setAvance] = useState(0);
    const [resultado, setResultado] = useState(null);
    const [proyectos, setProyectos] = useState([]);
    const [usuarios, setUsuarios] = useState([]);
    const archivoRef = useRef(null);

    // ⚠️ CERROJO SINCRONO CONTRA EL DOBLE CLIC.
    //
    // `disabled={importando}` NO alcanza: `setImportando(true)` es una
    // actualizacion de estado de React, y hasta que no vuelve a dibujarse el
    // boton sigue habilitado. Un segundo clic dentro de esa ventana entra.
    //
    // Paso de verdad el 26-08-2026: dos clics rapidos crearon DOS tareas madre
    // llamadas igual —a las 00:33:34 y 00:33:37—. Las dos buscaron una madre
    // existente ANTES de que ninguna la hubiera creado, las dos concluyeron que
    // no habia, y las dos la crearon. La comprobacion de "ya existe" no sirve
    // contra uno mismo corriendo dos veces a la vez.
    //
    // Un `ref` se escribe en el acto, sin esperar a React: el segundo clic
    // encuentra el cerrojo puesto y se va.
    const enCurso = useRef(false);

    // ── AGRUPAR BAJO UNA TAREA MADRE ────────────────────────────────────────
    //
    // Viene ACTIVADO. Subir doscientas tareas sueltas deja la lista diaria
    // inservible; colgadas de una madre quedan juntas y se despliegan cuando
    // se las busca.
    //
    // Y resuelve solo el problema de la visibilidad: toda subtarea HEREDA el
    // proyecto de su madre (`crm.controllers.js`), así que basta con elegir el
    // proyecto UNA vez —acá— para que las doscientas queden dentro y el equipo
    // las vea. Sin madre, cada fila necesitaría su propia columna Proyecto en
    // el Excel, y la que se olvide queda invisible para todos menos su autor.
    //
    // ⚠️ El costo, que conviene tener presente: la lista pide `soloRaiz`, así
    // que las hijas NO aparecen sueltas en Tareas —se ven dentro de la madre o
    // en la vista Árbol— y el avance del proyecto solo cuenta tareas madre, así
    // que las doscientas suman como UNA.
    const [agrupar, setAgrupar] = useState(true);
    const [nombreMadre, setNombreMadre] = useState('');
    const [proyectoMadre, setProyectoMadre] = useState('');

    // ── RESPONSABLE PARA TODO EL LOTE ───────────────────────────────────────
    //
    // Una planilla de oficina casi nunca trae columna «Responsable»: se sabe de
    // quien es el trabajo por el contexto —«estas son las de Victor»— y no se
    // escribe en cada fila. Sin esto, doscientas tareas entran sin dueño y hay
    // que asignarlas de a una.
    //
    // Es un valor POR DEFECTO, no una imposicion: si la planilla SI trae la
    // columna, lo que diga cada fila manda.
    const [responsableLote, setResponsableLote] = useState('');

    // Los catálogos se piden al abrir: sin ellos no se puede resolver un nombre
    // de proyecto o de responsable, y la previa mentiría.
    useEffect(() => {
        (async () => {
            try {
                const [rp, ru] = await Promise.all([
                    listarProyectosApi(getSessionId()),
                    getCatalogosPersonasApi(getSessionId()),
                ]);
                const dp = await rp.json(); const du = await ru.json();
                if (dp.success) setProyectos(dp.proyectos || []);
                if (du.success) setUsuarios(du.ejecutivos || []);
            } catch { /* sin catálogos igual se puede importar sin proyecto ni responsable */ }
        })();
    }, []);

    const buscarPorNombre = (lista, texto) => {
        if (!texto) return null;
        const t = norm(texto);
        return lista.find(x => norm(x.nombre) === t)
            || lista.find(x => norm(x.nombre).includes(t))
            || null;
    };

    // Todo lo que parezca descripcion, comentario o nota, junto y en orden.
// LOS COMENTARIOS SON COMENTARIOS, NO DESCRIPCIÓN.
//
// Al principio se metían todos en la descripción, con su encabezado por
// delante. Se veía mal y además era mentira: la tarea mostraba
// «COMENTARIOS (0)» mientras su descripción decía «COMENTARIO 2: …». Y se
// perdía lo que un comentario aporta —queda con fecha y autor, se puede
// responder y se borra de a uno— además de mezclar el pedido original con
// todo el historial posterior.
//
// Ahora la descripción es SOLO el pedido y su ficha, y cada columna de
// comentario se sube como un comentario de verdad, en el orden de la planilla.
const comentariosDe = (row) => {
    const salida = [];
    for (const k of Object.keys(row)) {
        if (!/comentario|comentiario|nota|observacion/i.test(norm(k))) continue;
        const v = String(row[k] ?? '').trim();
        if (v) salida.push(v);
    }
    return salida;
};

const juntarDescripcion = (row) => {
    const partes = [];
    const base = pick(row, ['descripcion', 'detalle', 'solicitud', 'requerimiento'], { excluir: ES_FECHA });
    if (base) partes.push(base);

    // El contexto de la ficha: quién pidió la tarea y cómo ubicarlo. Sin esto
    // se perdía el SOLICITANTE, que estaba en 61 de las 226 filas de la planilla
    // real — y «quién pidió esto» es de lo primero que se busca al retomar una
    // tarea vieja.
    // LAS FECHAS DE LA PLANILLA, QUE SI NO SE PIERDEN.
    //
    // La tabla `tarea` solo tiene `vence_at`, `created_at` (que es cuándo se
    // creó ACÁ, o sea hoy) y `completed_at` (que `crearTarea` no recibe). O sea
    // que no hay dónde guardar «cuándo empezó» ni «cuándo se terminó».
    //
    // Sin esto, 224 fechas de inicio que van de septiembre de 2025 a agosto de
    // 2026 desaparecerían, y las 225 tareas parecerían creadas todas hoy. Se
    // escriben en la descripción: no es tan cómodo como una columna, pero el
    // dato queda y se puede leer.
    const inicio = aFechaCorta(pickCrudo(row, ['fecha de inicio', 'inicio', 'creacion']));
    const termino = aFechaCorta(pickCrudo(row, ['fecha termino', 'termino', 'finalizacion']));

    const contexto = [
        ['Iniciada', inicio],
        ['Terminada', termino],
        ['Solicitante', pick(row, ['solicitante', 'pedido por'], { excluir: ES_FECHA })],
        ['Teléfono', pick(row, ['telefono', 'fono', 'celular'], { excluir: ES_FECHA })],
        ['Correo', pick(row, ['correo', 'email', 'e-mail'], { excluir: ES_FECHA })],
        ['RUT', pick(row, ['rut'])],
    ].filter(([, v]) => v);
    for (const [etiqueta, valor] of contexto) partes.push(`${etiqueta}: ${valor}`);

    // ⚠️ Las claves NO se copian. La planilla trae una columna «CLAVE SII» con
    // la contraseña tributaria de cada cliente; meterla en la descripción de una
    // tarea la deja a la vista de todo el proyecto y dentro de las
    // notificaciones. Si alguna vez se necesita acá, que sea una decisión
    // explícita y no el efecto de un `for` sobre todas las columnas.

    return partes.join('\n\n') || null;
};

// Una fila de la planilla → una tarea, con sus avisos.
    const mapear = (row, indice) => {
        const tituloBase = pick(row, CANDIDATOS_TITULO, { excluir: ES_FECHA });
        // De quien es la tarea. En las planillas de la oficina el titulo suele
        // ser generico —«FINIQUITO UN TRABAJADOR» se repite decenas de veces—
        // y lo que distingue una fila de otra es el cliente. Sin esto, la lista
        // queda con doscientos titulos iguales.
        const cliente = pick(row, ['razon social', 'razonsocial', 'cliente', 'empresa', 'contribuyente'], { excluir: ES_FECHA });
        const titulo = tituloBase && cliente && !norm(tituloBase).includes(norm(cliente))
            ? `${tituloBase} — ${cliente}`
            : tituloBase;
        const proyectoTexto = pick(row, ['proyecto'], { excluir: ES_FECHA });
        const responsableTexto = pick(row, ['responsable', 'asignado', 'encargado'], { excluir: ES_FECHA });
        const prioridadTexto = norm(pick(row, ['prioridad', 'urgencia'], { excluir: ES_FECHA }));
        const estadoTexto = norm(pick(row, ['estado', 'situacion'], { excluir: ES_FECHA })).replace(/\s+/g, '_');

        const prioridad = SINONIMOS_PRIORIDAD[prioridadTexto] || (PRIORIDADES.includes(prioridadTexto) ? prioridadTexto : null);
        const estado = SINONIMOS_ESTADO[estadoTexto] || (ESTADOS.includes(estadoTexto) ? estadoTexto : null);

        const proyecto = buscarPorNombre(proyectos, proyectoTexto);
        const responsable = buscarPorNombre(usuarios, responsableTexto);

        const avisos = [];
        if (!titulo) avisos.push('sin título');
        if (proyectoTexto && !proyecto) avisos.push(`proyecto «${proyectoTexto}» no existe`);
        if (responsableTexto && !responsable) avisos.push(`responsable «${responsableTexto}» no existe`);
        if (prioridadTexto && !prioridad) avisos.push(`prioridad «${prioridadTexto}» no se entiende, va como media`);
        if (estadoTexto && !estado) avisos.push(`estado «${estadoTexto}» no se entiende, va como pendiente`);

        return {
            fila: indice + 2,   // +2: la 1 son los encabezados y Excel cuenta desde 1
            titulo,
            // Las planillas reales traen varias columnas de comentario
            // («COMENTARIOS», «COMENTARIO 2», «NOTAS»...). Se juntan todas en la
            // descripcion en vez de quedarse en el Excel: son el contexto de la
            // tarea, y perderlos es perder la mitad del pedido.
            descripcion: juntarDescripcion(row),
            comentarios: comentariosDe(row),
            proyectoId: proyecto?.id || null,
            proyectoNombre: proyecto?.nombre || proyectoTexto,
            responsableId: responsable?.id || responsableLote || null,
            responsableNombre: responsable?.nombre || responsableTexto
                || usuarios.find(u => u.id === responsableLote)?.nombre || '',
            prioridad: prioridad || 'media',
            estado: estado || 'pendiente',
            // LA FECHA DE TÉRMINO DE UNA TAREA YA HECHA NO ES UN VENCIMIENTO.
            //
            // En la planilla real las 11 filas con «FECHA TERMINO TAREA» están
            // todas en REALIZADO: esa fecha dice CUÁNDO SE TERMINÓ, no cuándo
            // vencía. Guardarla en `vence_at` las haría aparecer como vencidas
            // —una tarea cerrada en septiembre marcada en rojo por atrasada—.
            //
            // Así que solo es vencimiento si la tarea sigue viva. Para las
            // cerradas la fecha no se pierde: se escribe en la descripción
            // (ver `juntarDescripcion`), porque el modelo no tiene dónde más —
            // `completed_at` no lo recibe `crearTarea`.
            venceAt: (estado === 'completada' || estado === 'cancelada')
                ? null
                : aFecha(columnaVencimiento(row)),
            avisos,
            valida: !!titulo,
        };
    };

    // ¿Esta hoja tiene una columna que sirva de título?
    const hojaSirve = (json) => json.some(f => !!pick(f, CANDIDATOS_TITULO, { excluir: ES_FECHA }));

    const leerArchivo = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setLeyendo(true); setResultado(null); setNombreArchivo(file.name);
        try {
            const data = await file.arrayBuffer();
            // `cellDates` hace que las fechas lleguen como Date y no como el
            // número de serie de Excel, que sin esto se lee como 45.000 y pico.
            const wb = read(data, { type: 'array', cellDates: true });

            // UN LIBRO TIENE VARIAS HOJAS, y no siempre la primera es la buena.
            //
            // Se leía `SheetNames[0]` a secas. Con la planilla real de la oficina
            // —15 hojas, y las tareas en la segunda— eso significaba leer «rect
            // renta», no encontrar ninguna columna de título y decir «sin filas
            // que importar»: un mensaje que culpa al archivo cuando el problema
            // era estar mirando la hoja equivocada.
            const resumen = wb.SheetNames.map(nombre => {
                const json = utils.sheet_to_json(wb.Sheets[nombre], { defval: '' });
                return { nombre, filas: json.length, sirve: hojaSirve(json) };
            });
            setHojas(resumen);

            // Se preselecciona la primera que SIRVA, no la primera a secas.
            const mejor = resumen.find(h => h.sirve && h.filas > 0) || resumen[0];
            setHojaElegida(mejor?.nombre || '');
            setCrudo(mejor ? utils.sheet_to_json(wb.Sheets[mejor.nombre], { defval: '' }) : []);

            // La madre se propone con el nombre del archivo —y de la hoja, si hay
            // varias—: es lo que la persona ya eligió para llamar a este lote.
            if (!nombreMadre.trim()) {
                const base = file.name.replace(/\.(xlsx?|csv)$/i, '').trim();
                setNombreMadre((resumen.length > 1 && mejor ? `${base} · ${mejor.nombre}` : base).slice(0, 120));
            }

            setLibro(wb);
            if (!mejor?.sirve) {
                toast({ variant: 'destructive', title: 'No encuentro la columna de título',
                    description: resumen.length > 1
                        ? 'Elige otra hoja en el selector, o descarga la plantilla para ver el formato.'
                        : 'Descarga la plantilla para ver el formato esperado.' });
            }
        } catch (err) {
            toast({ variant: 'destructive', title: 'No se pudo leer el archivo', description: err.message });
        } finally { setLeyendo(false); }
    };

    // La plantilla de ejemplo. Es más rápido que explicar el formato por escrito,
    // y garantiza que los encabezados calcen a la primera.
    const descargarPlantilla = () => {
        const ejemplo = [{
            'Título': 'Ejemplo: corregir el cálculo del F29',
            'Descripción': 'Lo que hay que hacer, con el detalle que haga falta.',
            'Proyecto': proyectos[0]?.nombre || 'SOFTWARE SIMPLE PYME',
            'Responsable': usuarios[0]?.nombre || '',
            'Prioridad': 'alta',
            'Estado': 'pendiente',
            'Vence': '31-12-2026',
        }];
        const hoja = utils.json_to_sheet(ejemplo);
        hoja['!cols'] = [{ wch: 46 }, { wch: 60 }, { wch: 26 }, { wch: 28 }, { wch: 12 }, { wch: 14 }, { wch: 14 }];
        const libro = utils.book_new();
        utils.book_append_sheet(libro, hoja, 'Tareas');
        const buf = write(libro, { bookType: 'xlsx', type: 'array' });
        const url = URL.createObjectURL(new Blob([buf], { type: 'application/octet-stream' }));
        const a = document.createElement('a');
        a.href = url; a.download = 'plantilla-tareas.xlsx';
        a.click();
        URL.revokeObjectURL(url);
    };

    // Se recalcula solo cuando cambia la hoja o llegan los catalogos.
    const filas = useMemo(
        () => crudo.map(mapear).filter(f => f.titulo || f.descripcion),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [crudo, proyectos, usuarios, responsableLote]
    );

    const cambiarHoja = (nombre) => {
        setHojaElegida(nombre);
        setCrudo(libro ? utils.sheet_to_json(libro.Sheets[nombre], { defval: '' }) : []);
    };

    const importables = useMemo(() => filas.filter(f => f.valida), [filas]);
    const conAvisos = useMemo(() => filas.filter(f => f.avisos.length), [filas]);

    // La tarea madre: se REUSA si ya existe una con ese nombre, y si no se crea.
    //
    // Reusar importa: reimportar una planilla corregida no puede dejar dos
    // madres llamadas igual con la mitad de las hijas en cada una. Se busca
    // solo entre tareas raíz (`soloRaiz`) y por nombre exacto —sin distinguir
    // mayúsculas ni tildes— porque «Tareas Victor» y «TAREAS VICTOR» escritas
    // con dos días de diferencia son la misma.
    const resolverMadre = async (sessionId) => {
        const nombre = nombreMadre.trim();
        if (!agrupar || !nombre) return { id: null };

        try {
            // El parámetro de búsqueda del servidor se llama `q`, NO `busqueda`:
            // `listarTareasApi` arma la query con las claves tal cual, así que un
            // nombre equivocado no da error — simplemente no filtra, y la madre
            // se buscaría entre todas las raíces. Ahí es donde se crearía una
            // segunda madre duplicada sin que nadie se entere.
            const r = await listarTareasApi(sessionId, { q: nombre, soloRaiz: '1', limite: 200, estado: 'todas' });
            const d = await r.json();
            const yaEsta = (d.tareas || []).find(t => norm(t.titulo) === norm(nombre));
            if (yaEsta) return { id: yaEsta.id, reusada: true, titulo: yaEsta.titulo };
        } catch { /* si la búsqueda falla se crea una nueva: peor es no importar */ }

        const r = await crearTareaApi(sessionId, {
            titulo: nombre,
            descripcion: `Importadas desde «${nombreArchivo}» el ${new Date().toLocaleDateString('es-CL')}.`,
            prioridad: 'media',
            estado: 'pendiente',
            proyectoId: proyectoMadre || null,
            responsableId: responsableLote || null,
        });
        const d = await r.json();
        if (!d.success) throw new Error(d.message || 'No se pudo crear la tarea madre.');
        return { id: d.tarea?.id || d.id, reusada: false, titulo: nombre };
    };

    const importar = async () => {
        if (enCurso.current) return;   // el segundo clic no pasa de aqui
        enCurso.current = true;
        setImportando(true); setAvance(0);
        const sessionId = getSessionId();
        let creados = 0, comentados = 0;
        const errores = [];
        const comentariosPerdidos = [];

        // La madre va PRIMERO y aparte: si falla, no se crea ninguna hija. Con
        // doscientas colgando, una madre a medias es peor que no empezar.
        let madre = { id: null };
        try {
            madre = await resolverMadre(sessionId);
        } catch (e) {
            enCurso.current = false;
            setImportando(false);
            toast({ variant: 'destructive', title: 'No se pudo preparar la tarea madre', description: e.message });
            return;
        }
        for (let i = 0; i < importables.length; i++) {
            const f = importables[i];
            try {
                const r = await crearTareaApi(sessionId, {
                    titulo: f.titulo,
                    descripcion: f.descripcion || null,
                    prioridad: f.prioridad,
                    estado: f.estado,
                    // Con madre NO se manda proyecto: el servidor le pone el de
                    // ella. Mandar otro acá haría que la hija dijera un proyecto
                    // y su madre otro, y el servidor igual gana.
                    proyectoId: madre.id ? null : f.proyectoId,
                    parentId: madre.id || null,
                    responsableId: f.responsableId,
                    venceAt: f.venceAt,
                    origen: 'importacion',
                });
                const d = await r.json();
                if (d.success) {
                    creados++;
                    // Los comentarios, en orden y como comentarios de verdad.
                    // Si uno falla NO se pierde la tarea: se anota y se sigue.
                    // Perder el historial es malo; perder la tarea entera por
                    // un comentario es peor.
                    for (const texto of (f.comentarios || [])) {
                        // Un reintento antes de darlo por perdido. Una
                        // importacion son cientos de peticiones seguidas y
                        // alguna se cae por razones de red que no se repiten;
                        // volver a intentarla una vez, con una pausa corta,
                        // recupera casi todas.
                        let puesto = false;
                        for (let intento = 0; intento < 2 && !puesto; intento++) {
                            try {
                                if (intento) await new Promise(r => setTimeout(r, 400));
                                const rc = await agregarComentarioApi(sessionId, d.tarea?.id || d.id, texto);
                                if (rc.ok) { comentados++; puesto = true; }
                            } catch { /* se reintenta o se anota */ }
                        }
                        // ⚠️ Y si igual falla, SE ANOTA. Antes se descartaba en
                        // silencio: la importacion decia «225 creadas» y nadie
                        // se enteraba de que faltaban comentarios. Un dato que
                        // se pierde sin avisar es peor que un error a la vista.
                        if (!puesto) {
                            comentariosPerdidos.push({ fila: f.fila, titulo: f.titulo, texto: texto.slice(0, 60) });
                        }
                    }
                } else {
                    errores.push({ fila: f.fila, titulo: f.titulo, motivo: d.message || 'Error' });
                }
            } catch (err) {
                errores.push({ fila: f.fila, titulo: f.titulo, motivo: err.message });
            }
            setAvance(Math.round(((i + 1) / importables.length) * 100));
        }
        setResultado({ creados, comentados, errores, comentariosPerdidos, madre: madre.id ? madre : null });
        setImportando(false);
        enCurso.current = false;
        if (creados > 0) onImportado?.();
    };

    return (
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={onClose}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                className="w-full max-w-3xl bg-white border border-[#efe8dd] rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Encabezado */}
                <div className="p-5 border-b border-[#efe8dd] flex items-center justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-violet-500/15 flex items-center justify-center text-violet-600 shrink-0">
                            <FileSpreadsheet size={20} />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-sm font-black text-slate-900 uppercase tracking-tight">Importar tareas</h2>
                            <p className="text-[11px] text-slate-500">Desde una planilla de Excel o CSV</p>
                        </div>
                    </div>
                    <button onClick={onClose} aria-label="Cerrar"
                        className="p-2 rounded-xl bg-slate-50 text-slate-500 hover:text-red-500 shrink-0"><X size={18} /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
                    {/* Cargar */}
                    <div onClick={() => archivoRef.current?.click()}
                        className="border-2 border-dashed border-[#e5ddd0] hover:border-violet-400 rounded-2xl p-6 text-center cursor-pointer transition-colors">
                        <input ref={archivoRef} type="file" accept=".csv,.xls,.xlsx" className="hidden" onChange={leerArchivo} />
                        {leyendo
                            ? <Loader2 size={28} className="mx-auto text-violet-600 animate-spin" />
                            : <Upload size={28} className="mx-auto text-slate-400" />}
                        <p className="text-xs text-slate-700 mt-2 font-bold">{nombreArchivo || 'Pulsa para elegir la planilla'}</p>
                        <p className="text-[11px] text-slate-400 mt-1">
                            Columnas: <b>Título</b> (la única obligatoria), Descripción, Proyecto, Responsable, Prioridad, Estado, Vence
                        </p>
                    </div>

                    {/* ═══ QUÉ HOJA DEL LIBRO ═══
                        Solo cuando hay más de una. Con un archivo de una sola
                        hoja preguntar cuál sería ruido. */}
                    {hojas.length > 1 && !resultado && (
                        <div className="rounded-xl border border-[#efe8dd] bg-slate-50 px-4 py-3">
                            <label className="block">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                    Hoja del libro · el archivo tiene {hojas.length}
                                </span>
                                <select
                                    value={hojaElegida}
                                    onChange={(e) => cambiarHoja(e.target.value)}
                                    className="mt-1 w-full bg-white border border-[#efe8dd] rounded-lg px-3 py-2 text-xs text-slate-900 outline-none focus:border-violet-500"
                                >
                                    {hojas.map(h => (
                                        <option key={h.nombre} value={h.nombre}>
                                            {h.nombre} — {h.filas} fila{h.filas !== 1 ? 's' : ''}
                                            {h.sirve ? '' : ' · sin columna de título'}
                                        </option>
                                    ))}
                                </select>
                                <span className="block text-[10px] text-slate-400 mt-1">
                                    Se eligió sola la primera hoja con una columna de título. Cámbiala si no es esa.
                                </span>
                            </label>
                        </div>
                    )}

                    <button onClick={descargarPlantilla}
                        className="text-[11px] font-bold text-violet-700 hover:text-violet-900 inline-flex items-center gap-1.5">
                        <Download size={13} /> Descargar la plantilla de ejemplo
                    </button>

                    {/* ═══ RESPONSABLE DEL LOTE ═══
                        Aparte del agrupador: aplica se agrupe o no. */}
                    {!resultado && (
                        <div className="rounded-2xl border border-[#efe8dd] bg-white px-4 py-3.5">
                            <label className="block">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                    Responsable de todas
                                </span>
                                <select
                                    value={responsableLote}
                                    onChange={(e) => setResponsableLote(e.target.value)}
                                    className="mt-1 w-full bg-white border border-[#efe8dd] rounded-lg px-3 py-2 text-xs text-slate-900 outline-none focus:border-violet-500"
                                >
                                    <option value="">Sin asignar</option>
                                    {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                                </select>
                                <span className="block text-[10px] text-slate-400 mt-1">
                                    Si la planilla trae columna «Responsable», lo que diga cada fila manda sobre esto.
                                </span>
                            </label>
                        </div>
                    )}

                    {/* ═══ AGRUPAR BAJO UNA TAREA MADRE ═══ */}
                    {!resultado && (
                        <div className={`rounded-2xl border px-4 py-3.5 transition-colors ${
                            agrupar ? 'border-violet-300 bg-violet-50/50' : 'border-[#efe8dd] bg-white'}`}>
                            <label className="flex items-start gap-2.5 cursor-pointer">
                                <input type="checkbox" checked={agrupar}
                                    onChange={(e) => setAgrupar(e.target.checked)}
                                    className="accent-violet-600 mt-0.5 shrink-0" />
                                <span className="min-w-0">
                                    <span className="block text-[13px] font-bold text-slate-800">
                                        Agrupar todo bajo una tarea madre
                                    </span>
                                    <span className="block text-[11px] text-slate-500 leading-relaxed mt-0.5">
                                        Las filas entran como subtareas de una sola. Quedan juntas y no llenan
                                        la lista diaria.
                                    </span>
                                </span>
                            </label>

                            {agrupar && (
                                <div className="mt-3 space-y-2.5 pl-6">
                                    <label className="block">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                            Nombre de la tarea madre
                                        </span>
                                        <input
                                            value={nombreMadre}
                                            onChange={(e) => setNombreMadre(e.target.value)}
                                            placeholder="Ej: Tareas Victor"
                                            className="mt-1 w-full bg-white border border-[#efe8dd] rounded-lg px-3 py-2 text-xs text-slate-900 outline-none focus:border-violet-500"
                                        />
                                        <span className="block text-[10px] text-slate-400 mt-1">
                                            Si ya existe una tarea con ese nombre, las nuevas se le cuelgan en vez
                                            de crear una segunda igual.
                                        </span>
                                    </label>

                                    <label className="block">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                            Proyecto de la madre
                                        </span>
                                        <select
                                            value={proyectoMadre}
                                            onChange={(e) => setProyectoMadre(e.target.value)}
                                            className="mt-1 w-full bg-white border border-[#efe8dd] rounded-lg px-3 py-2 text-xs text-slate-900 outline-none focus:border-violet-500"
                                        >
                                            <option value="">Sin proyecto</option>
                                            {proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                                        </select>
                                        <span className="block text-[10px] text-slate-400 mt-1">
                                            Las subtareas <b>heredan el proyecto de su madre</b>: eligiéndolo acá una
                                            vez, quedan todas dentro y el equipo las ve. Sin proyecto, solo las ve
                                            quien las crea.
                                        </span>
                                    </label>

                                    {/* La contra, dicha antes y no después. */}
                                    <p className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 leading-relaxed">
                                        <b>Ojo:</b> las subtareas no aparecen sueltas en la lista de Tareas —se ven
                                        dentro de la madre o en la vista <b>Árbol</b>— y el avance del proyecto solo
                                        cuenta tareas madre, así que estas suman como <b>una</b>.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Avisos de las filas con algo raro */}
                    {conAvisos.length > 0 && !resultado && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3">
                            <p className="text-[11px] font-bold text-amber-800 flex items-center gap-1.5 mb-1">
                                <AlertTriangle size={13} /> {conAvisos.length} fila{conAvisos.length !== 1 ? 's' : ''} con algo que revisar
                            </p>
                            <ul className="text-[11px] text-amber-800/90 space-y-0.5 max-h-24 overflow-y-auto">
                                {conAvisos.slice(0, 8).map(f => (
                                    <li key={f.fila}>Fila {f.fila}: {f.avisos.join(' · ')}</li>
                                ))}
                                {conAvisos.length > 8 && <li>…y {conAvisos.length - 8} más.</li>}
                            </ul>
                        </div>
                    )}

                    {/* La previa: qué va a entrar exactamente */}
                    {filas.length > 0 && !resultado && (
                        <div>
                            <p className="text-[11px] font-bold text-slate-700 mb-2">
                                {importables.length} de {filas.length} se van a crear
                                {filas.length !== importables.length && <span className="text-slate-400"> · las demás no tienen título</span>}
                            </p>
                            <div className="overflow-x-auto border border-[#efe8dd] rounded-xl">
                                <table className="w-full min-w-[40rem]">
                                    <thead className="bg-slate-50">
                                        <tr className="text-left">
                                            {['#', 'Título', 'Proyecto', 'Responsable', 'Prioridad', 'Estado'].map(h => (
                                                <th key={h} className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap border-b border-[#efe8dd]">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filas.slice(0, 40).map(f => (
                                            <tr key={f.fila} className={`border-b border-[#f5f0e8] last:border-0 ${f.valida ? '' : 'opacity-40'}`}>
                                                <td className="px-3 py-1.5 text-[10px] text-slate-400 tabular-nums">{f.fila}</td>
                                                <td className="px-3 py-1.5 text-[11px] font-bold text-slate-800 max-w-[18rem] truncate">{f.titulo || '—'}</td>
                                                <td className="px-3 py-1.5 text-[11px] text-slate-500 whitespace-nowrap">
                                                    {f.proyectoNombre || <span className="text-slate-300 italic">sin proyecto</span>}
                                                </td>
                                                <td className="px-3 py-1.5 text-[11px] text-slate-500 whitespace-nowrap">
                                                    {f.responsableNombre || <span className="text-slate-300 italic">sin asignar</span>}
                                                </td>
                                                <td className="px-3 py-1.5 text-[11px] text-slate-500">{f.prioridad}</td>
                                                <td className="px-3 py-1.5 text-[11px] text-slate-500">{f.estado}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {filas.length > 40 && (
                                <p className="text-[10px] text-slate-400 mt-1.5">Se muestran las primeras 40; se importan las {importables.length}.</p>
                            )}
                        </div>
                    )}

                    {/* Barra de avance */}
                    {importando && (
                        <div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-violet-600 transition-all" style={{ width: `${avance}%` }} />
                            </div>
                            <p className="text-[11px] text-slate-500 mt-1.5 tabular-nums">{avance}%</p>
                        </div>
                    )}

                    {/* Resultado */}
                    {resultado && (
                        <div className="space-y-3">
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 flex items-start gap-2.5">
                                <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                                <div className="min-w-0">
                                    <p className="text-[13px] text-slate-800">
                                        Se crearon <b>{resultado.creados}</b> tarea{resultado.creados !== 1 ? 's' : ''}
                                        {resultado.comentados > 0 && <> con <b>{resultado.comentados}</b> comentarios</>}.
                                    </p>
                                    {resultado.madre && (
                                        <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                                            Colgando de <b>«{resultado.madre.titulo}»</b>
                                            {resultado.madre.reusada
                                                ? ', que ya existía y se reutilizó.'
                                                : ', creada ahora.'}
                                            {' '}Para verlas, abre esa tarea o usa la vista <b>Árbol</b> —
                                            en la lista no salen sueltas.
                                        </p>
                                    )}
                                </div>
                            </div>
                            {resultado.comentariosPerdidos?.length > 0 && (
                                <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3">
                                    <p className="text-[11px] font-bold text-amber-800 mb-1 flex items-center gap-1.5">
                                        <AlertTriangle size={13} />
                                        {resultado.comentariosPerdidos.length} comentario{resultado.comentariosPerdidos.length !== 1 ? 's' : ''} no se pudo guardar
                                    </p>
                                    <p className="text-[10px] text-amber-800/80 mb-1.5 leading-relaxed">
                                        Las tareas sí quedaron creadas. Estos comentarios hay que agregarlos a mano
                                        desde la tarea, o volver a importar solo esas filas.
                                    </p>
                                    <ul className="text-[11px] text-amber-800/90 space-y-0.5 max-h-28 overflow-y-auto">
                                        {resultado.comentariosPerdidos.slice(0, 10).map((c, i) => (
                                            <li key={i}>Fila {c.fila} «{c.titulo}»: {c.texto}…</li>
                                        ))}
                                        {resultado.comentariosPerdidos.length > 10 && (
                                            <li>…y {resultado.comentariosPerdidos.length - 10} más.</li>
                                        )}
                                    </ul>
                                </div>
                            )}

                            {resultado.errores.length > 0 && (
                                <div className="rounded-xl border border-red-200 bg-red-50/70 px-4 py-3">
                                    <p className="text-[11px] font-bold text-red-700 mb-1">
                                        {resultado.errores.length} no se pudo crear:
                                    </p>
                                    <ul className="text-[11px] text-red-700/90 space-y-0.5 max-h-32 overflow-y-auto">
                                        {resultado.errores.map((e, i) => (
                                            <li key={i}>Fila {e.fila} «{e.titulo}»: {e.motivo}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Pie */}
                <div className="p-4 border-t border-[#efe8dd] flex flex-wrap items-center justify-end gap-2 bg-white shrink-0">
                    <Button variant="ghost" onClick={onClose}
                        className="text-xs font-bold text-slate-500 bg-slate-50 hover:bg-slate-100 h-10 rounded-xl px-4">
                        {resultado ? 'Cerrar' : 'Cancelar'}
                    </Button>
                    {!resultado && (
                        <Button onClick={importar} disabled={importando || importables.length === 0}
                            className="bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-xs font-bold h-10 rounded-xl px-4">
                            {importando
                                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creando…</>
                                : <><Play className="h-4 w-4 mr-2" /> Crear {importables.length || ''} tarea{importables.length !== 1 ? 's' : ''}</>}
                        </Button>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
};

export default ImportarTareasModal;
