// =====================================================================
// ENVÍO DE CORREOS PERSONALIZADOS
// ---------------------------------------------------------------------
// Escribir UNA vez y que a cada empresa le llegue con sus propios datos:
//
//     Hola {{empresa}}, su plan {{plan}} tiene un valor de {{valor_plan}}.
//
// Dos columnas, como un cliente de correo de verdad:
//
//   REDACTAR      · de, para, asunto, plantilla, texto con formato y adjuntos
//   DESTINATARIOS · a quién se le manda, con buscador y casillas
//
// LA VISTA PREVIA NO ES UN ADORNO y por eso tiene su propio botón: los datos
// los resuelve el SERVIDOR con lo que hay en la base HOY, así que es la única
// forma de ver el correo real —con los datos de cada cliente ya puestos— antes
// de mandarlo. Un envío a 200 clientes no se puede deshacer.
// =====================================================================
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
    Mail, Search, Send, Users, Eye, Loader2, AlertTriangle, CheckCircle2,
    X, ChevronLeft, ChevronRight, FlaskConical, Building2, Sparkles,
    LayoutTemplate, Save, Trash2, Check, PenLine, Users2, Lock,
    Paperclip, Square, FileSpreadsheet, Upload, Table2, History,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import LogoUploader from '@/components/ui/LogoUploader';
import HistorialCorreosModal from '@/components/crm/modals/HistorialCorreosModal';
import EditorRico from '@/components/comunicaciones/EditorRico';
import CuerpoCorreo, { aHtmlEditor } from '@/components/comunicaciones/CuerpoCorreo';
import { getCrmDataApi } from '@/services/crmService';
import {
    camposCorreoApi, previewCampanaApi, enviarCampanaApi, progresoCampanaApi,
    listarPlantillasCorreoApi, guardarPlantillaCorreoApi, eliminarPlantillaCorreoApi,
    miPerfilCorreoApi, guardarPerfilCorreoApi, detenerCampanaApi, cuotaCorreoApi,
    empresasImpagasApi,
} from '@/services/correosService';

const getUser = () => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } };
const getSessionId = () => getUser().sessionId;

const CORREO_VALIDO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const tieneCorreo = (c) => String(c.correo || '')
    .split(/[;,\s]+/).some(x => CORREO_VALIDO.test(x.trim()));

const inp = 'w-full bg-slate-50 border border-[#efe8dd] rounded-lg px-3 py-2 text-xs text-slate-900 outline-none focus:border-emerald-500';

// ¿El cuerpo tiene texto de verdad?
//
// Con el editor de formato, un correo en blanco NO es una cadena vacía: es
// «<p><br></p>», que tiene 12 caracteres. Con `.trim()` el botón de enviar se
// habilitaba y se mandaba un correo vacío a la cartera entera. El servidor
// hace esta misma comprobación —ahí está el candado— pero acá evita que el
// botón mienta.
const HTML_CORREO = /<(p|br|div|span|strong|b|em|i|u|s|a|ul|ol|li|h[1-3]|blockquote|table)\b[^>]*>/i;
const conTexto = (v) => {
    const s = String(v || '');
    if (!HTML_CORREO.test(s)) return !!s.trim();
    return !!s.replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim();
};

// Iniciales para el recuadro de cada fila: «A&L SOLUCIONES Y SERVICIOS» → «AS».
// Se saltan las palabras de relleno (Y, DE, SPA…) para que dos empresas del
// mismo rubro no queden con la misma sigla.
const RELLENO = new Set(['y', 'de', 'del', 'la', 'el', 'los', 'las', 'spa', 'ltda', 'limitada', 'eirl', 'e', 'sa']);
const iniciales = (nombre) => {
    const palabras = String(nombre || '')
        .split(/[\s.,&]+/)
        .filter(p => p && !RELLENO.has(p.toLowerCase()));
    // Si al filtrar el relleno no queda nada —una razón social que es solo
    // «SPA», o puro símbolo— se usa el nombre crudo. Un recuadro vacío en la
    // lista se ve como un error de la pantalla.
    if (!palabras.length) {
        const crudo = String(nombre || '').replace(/[^\p{L}\p{N}]/gu, '');
        return crudo ? crudo.slice(0, 2).toUpperCase() : '—';
    }
    // Con una sola palabra útil se toman DOS letras de ella: «AMIL SPA» daba
    // solo «A» —al filtrar SPA— y un recuadro con una letra se ve incompleto.
    if (palabras.length === 1) return palabras[0].slice(0, 2).toUpperCase();
    return (palabras[0][0] + palabras[1][0]).toUpperCase();
};

// Color por plan. Los nombres salen de la base y pueden cambiar, así que lo que
// no calza cae a un gris neutro en vez de quedar sin estilo.
// Los 6 planes que existen hoy en la cartera, medidos contra la base:
// FREE · OFICINA VIRTUAL · FULL EMPRENDEDOR · GO · EXECUTIVE · EMPRENDEDOR.
// El orden importa: «FULL EMPRENDEDOR» tiene que evaluarse ANTES que
// «EMPRENDEDOR», o el más caro se pintaría como el más barato.
const colorPlan = (plan) => {
    const p = String(plan || '').toUpperCase();
    if (p.includes('FULL') || p.includes('EXECUTIVE')) return 'text-violet-700 bg-violet-500/10 border-violet-500/30';
    if (p.includes('OFICINA')) return 'text-amber-700 bg-amber-500/10 border-amber-500/30';
    if (p.includes('EMPRENDEDOR')) return 'text-blue-700 bg-blue-500/10 border-blue-500/30';
    if (p.includes('GO')) return 'text-emerald-700 bg-emerald-500/10 border-emerald-500/30';
    // FREE y cualquier plan nuevo que aparezca: gris neutro en vez de sin estilo.
    return 'text-slate-500 bg-slate-500/10 border-slate-400/30';
};

// =====================================================================
// EL OTRO ORIGEN DE DATOS: UNA PLANILLA
// ---------------------------------------------------------------------
// Hay envíos cuyos datos NO están en el sistema. El del F29 es el caso:
// 46 clientes, cada uno con sus compras, sus ventas y su impuesto a
// pagar, calculados aparte y guardados en un Excel.
//
// Cada COLUMNA de la planilla se convierte en un dato insertable, así
// que {{impuesto_a_pagar}} funciona igual que {{plan}} sin configurar
// nada. De acá para adelante todo lo demás es idéntico: misma vista
// previa, misma cuota, mismo registro, mismas bajas.
//
// Estas tres funciones son un espejo de las del servidor. Está
// duplicado a propósito y con un motivo acotado: mostrar en pantalla
// cuántas filas tienen correo ANTES de escribir el asunto, cuando
// todavía no hay a quién pedirle una vista previa. Quien manda sigue
// siendo el servidor.
// =====================================================================
const normalizarMarca = (columna) => String(columna || '')
    .trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

// Primero por nombre (CORREO / MAIL / EMAIL); si no aparece, la primera columna
// cuyos valores tengan una arroba. Adivinar mal significa no mandarle a nadie,
// por eso la pantalla muestra cuál se eligió y deja cambiarla.
const detectarColumnaCorreo = (filas, columnas) =>
    columnas.find(c => /^(correo|mail|e[-_ ]?mail)/i.test(String(c).trim()))
    || columnas.find(c => filas.some(f => CORREO_VALIDO.test(String(f?.[c] ?? '').trim())))
    || '';

const correosDeFila = (fila, col) => String(fila?.[col] ?? '')
    .split(/[;,\s]+/).map(x => x.trim()).filter(x => CORREO_VALIDO.test(x));

// El nombre para mostrar: la primera columna de texto que no sea el correo.
const etiquetaDeFila = (fila, columnas, col, i) => columnas
    .filter(c => c !== col)
    .map(c => String(fila?.[c] ?? '').trim())
    .find(v => v && !/^\d+([.,]\d+)?$/.test(v)) || `Fila ${i + 2}`;

const EnvioCorreos = () => {
    const [clientes, setClientes] = useState([]);
    const [campos, setCampos] = useState([]);
    const [cargando, setCargando] = useState(true);

    const [busqueda, setBusqueda] = useState('');
    const [soloConCorreo, setSoloConCorreo] = useState(true);
    const [seleccion, setSeleccion] = useState([]);

    // ---- de dónde salen los destinatarios: la cartera o una planilla ----
    const [modo, setModo] = useState('cartera');        // 'cartera' | 'planilla'
    const [libro, setLibro] = useState(null);           // { nombre, hojas: [] }
    const [hoja, setHoja] = useState('');
    const [filas, setFilas] = useState([]);
    const [columnas, setColumnas] = useState([]);
    const [colCorreo, setColCorreo] = useState('');
    const [filasSel, setFilasSel] = useState([]);       // índices dentro de `filas`
    const libroRef = useRef(null);                      // el libro abierto, para cambiar de hoja
    const plaRef = useRef(null);

    const filasAEnviar = useMemo(
        () => filasSel.map(i => filas[i]).filter(Boolean),
        [filas, filasSel]);

    // Cuántos destinatarios hay elegidos, venga de donde venga. Lo usan el
    // contador de arriba, el botón de enviar y la vista previa.
    const elegidos = modo === 'planilla' ? filasAEnviar.length : seleccion.length;

    // ESCONDER LO NO ELEGIDO.
    // Pasados unos cuantos, los no elegidos estorban para repasar a quién le vas
    // a escribir. Se enciende SOLO al pasar de 10, que es cuando la lista deja
    // de caber de una mirada.
    //
    // Es un filtro y no un «desaparecen y ya»: escondiendo lo no elegido sin
    // vuelta atrás, no habría forma de agregar al número 11. Por eso queda el
    // botón para apagarlo, y apagado a mano NO se vuelve a encender solo.
    const [soloElegidos, setSoloElegidos] = useState(false);
    const yaSaltó = useRef(false);
    useEffect(() => {
        if (elegidos > 10 && !yaSaltó.current) { yaSaltó.current = true; setSoloElegidos(true); }
        // Bajo 10 se ve la lista entera igual: el filtro no aporta y se rearma
        // para la próxima vez que se pase.
        if (elegidos <= 10) { yaSaltó.current = false; setSoloElegidos(false); }
    }, [elegidos]);

    const [asunto, setAsunto] = useState('');
    const [cuerpo, setCuerpo] = useState('');
    const [firma, setFirma] = useState('');
    const [firmaImagen, setFirmaImagen] = useState(null);

    // Mi remitente y mi firma guardados. La firma se carga sola al entrar: es la
    // misma siempre y reescribirla en cada envío no tiene sentido.
    const [perfil, setPerfil] = useState(null);
    const [editandoPerfil, setEditandoPerfil] = useState(false);
    const [perfilBorrador, setPerfilBorrador] = useState({
        correoRemitente: '', firmaTexto: '', firmaImagen: null,
    });
    const [guardandoPerfil, setGuardandoPerfil] = useState(false);

    const [previa, setPrevia] = useState(null);
    const [cargandoPrevia, setCargandoPrevia] = useState(false);
    const [indicePrevia, setIndicePrevia] = useState(0);

    // ---- abrir la planilla ----
    // Van acá abajo, y no junto a su estado, porque tocan `previa`: al cambiar
    // los destinatarios la vista previa anterior deja de valer y hay que
    // borrarla, o se quedaría en pantalla un correo que ya no corresponde.
    const abrirHoja = (wb, nombre) => {
        const datos = XLSX.utils.sheet_to_json(wb.Sheets[nombre], { defval: null });
        // Las columnas se toman de TODAS las filas: si la primera trae celdas
        // vacías, esas columnas no aparecerían mirando solo la primera.
        const cols = [...new Set(datos.flatMap(f => Object.keys(f || {})))];
        const col = detectarColumnaCorreo(datos, cols);
        setHoja(nombre);
        setFilas(datos);
        setColumnas(cols);
        setColCorreo(col);
        // Se marcan solas las filas que tienen correo. Las otras no se pueden
        // enviar igual, y dejarlas marcadas solo hace que el número de arriba
        // prometa más envíos de los que van a salir.
        setFilasSel(datos.map((_, i) => i).filter(i => correosDeFila(datos[i], col).length > 0));
        setPrevia(null);
        if (!datos.length) {
            toast({ variant: 'destructive', title: 'Hoja vacía', description: `«${nombre}» no tiene filas.` });
        }
    };

    // Se lee con `arrayBuffer`: en el navegador no hay sistema de archivos, y la
    // build ESM de xlsx tampoco lo trae en Node, así que `XLSX.readFile` no
    // funciona en ninguno de los dos lados.
    const leerPlanilla = async (file) => {
        if (!file) return;
        if (plaRef.current) plaRef.current.value = '';   // poder volver a elegir el mismo archivo
        try {
            const wb = XLSX.read(await file.arrayBuffer());
            if (!wb.SheetNames.length) throw new Error('El archivo no tiene ninguna hoja.');
            libroRef.current = wb;
            setLibro({ nombre: file.name, hojas: wb.SheetNames });
            abrirHoja(wb, wb.SheetNames[0]);
        } catch (e) {
            toast({ variant: 'destructive', title: 'No se pudo leer la planilla', description: e.message });
        }
    };

    const quitarPlanilla = () => {
        libroRef.current = null;
        setLibro(null); setHoja(''); setFilas([]); setColumnas([]);
        setColCorreo(''); setFilasSel([]); setPrevia(null);
    };

    // Cambiar la columna de correo rehace la selección: con otra columna, otras
    // filas son las que tienen a quién escribirle.
    const cambiarColCorreo = (col) => {
        setColCorreo(col);
        setFilasSel(filas.map((_, i) => i).filter(i => correosDeFila(filas[i], col).length > 0));
        setPrevia(null);
    };

    const [enviando, setEnviando] = useState(false);
    const [progreso, setProgreso] = useState(null);
    const [deteniendo, setDeteniendo] = useState(false);
    // Cuánto queda del tope diario del proveedor. Se refresca con cada vista
    // previa y al terminar un envío.
    const [cuota, setCuota] = useState(null);

    // Adjuntos: viajan en base64 y el servidor los escribe una vez a disco para
    // reusarlos en todos los destinatarios.
    const [adjuntos, setAdjuntos] = useState([]);
    const adjRef = useRef(null);
    const [correoPrueba, setCorreoPrueba] = useState('');
    // El registro de lo enviado. Vive acá porque los correos NO pasan por Gmail
    // —salen por Resend, por HTTPS— y en «Enviados» de Gmail no van a aparecer.
    const [verEnviados, setVerEnviados] = useState(false);
    // La vista previa pasó de ser una tercera columna fija a abrirse por botón.
    // La columna solo aparecía en pantallas anchas (`hidden xl:flex`), así que
    // en un notebook la revisión previa —lo único que atrapa un «{{plan}}» sin
    // reemplazar antes de mandarlo a 130 clientes— simplemente no existía.
    const [previaAbierta, setPreviaAbierta] = useState(false);
    // Quiénes deben. Se carga al entrar para poder marcarlas de una: buscarlas a
    // mano entre 137 clientes es donde se cuela el «le cobré a uno que ya pagó».
    const [impagas, setImpagas] = useState([]);

    const MAX_ADJ = 7 * 1024 * 1024;
    const kb = (n) => n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;

    const agregarAdjunto = async (e) => {
        const files = [...(e.target.files || [])];
        if (adjRef.current) adjRef.current.value = '';
        for (const f of files) {
            if (f.size > MAX_ADJ) {
                toast({ variant: 'destructive', title: 'Archivo muy grande', description: `«${f.name}» pesa ${kb(f.size)} y el máximo es 7 MB.` });
                continue;
            }
            const dataBase64 = await new Promise((res, rej) => {
                const fr = new FileReader();
                fr.onload = () => res(fr.result);
                fr.onerror = rej;
                fr.readAsDataURL(f);
            });
            setAdjuntos(p => [...p, { nombre: f.name, tamano: f.size, dataBase64 }]);
        }
    };

    const detener = async () => {
        if (!window.confirm('¿Detener el envío?\n\nLo que ya salió no se puede volver atrás; se corta lo que falta.')) return;
        setDeteniendo(true);
        try {
            const r = await detenerCampanaApi(getSessionId());
            const d = await r.json();
            toast({ title: d.success ? 'Deteniendo…' : 'No se pudo', description: d.message });
        } catch (e) {
            toast({ variant: 'destructive', title: 'Error', description: e.message });
        } finally { setDeteniendo(false); }
    };

    // ---- plantillas ----
    // `plantillaId` recuerda de cuál se partió: sirve para contar cuántas veces
    // se usó de verdad y para que «Guardar» actualice esa misma en vez de crear
    // una copia cada vez que se corrige una coma.
    const [plantillas, setPlantillas] = useState([]);
    const [plantillaId, setPlantillaId] = useState(null);
    const [guardando, setGuardando] = useState(false);

    const cargarPlantillas = useCallback(async () => {
        try {
            const r = await listarPlantillasCorreoApi(getSessionId());
            const d = await r.json();
            if (d.success) setPlantillas(d.plantillas || []);
        } catch { /* la lista queda como estaba */ }
    }, []);
    useEffect(() => { cargarPlantillas(); }, [cargarPlantillas]);

    const usarPlantilla = (p) => {
        setPlantillaId(p.id);
        setAsunto(p.asunto || '');
        // Las plantillas de antes del editor son texto plano: hay que convertirlas
        // a párrafos o el editor las muestra como un solo bloque corrido.
        setCuerpo(aHtmlEditor(p.cuerpo || ''));
        // La firma de la plantilla solo pisa la propia si trae una. Una plantilla
        // compartida por otra persona NO debería cambiarte la firma sin avisar.
        if (p.firma) setFirma(p.firma);
        if (p.firmaImagen) setFirmaImagen(p.firmaImagen);
        toast({ title: `Plantilla «${p.nombre}»`, description: 'Puedes editar el texto antes de enviar.' });
    };

    // ---- mi remitente y mi firma ----
    const guardarPerfil = async () => {
        setGuardandoPerfil(true);
        try {
            const r = await guardarPerfilCorreoApi(getSessionId(), perfilBorrador);
            const d = await r.json();
            if (!d.success) throw new Error(d.message);
            setPerfil(p => ({ ...p, ...perfilBorrador, remitenteEfectivo: d.remitenteEfectivo }));
            setFirma(perfilBorrador.firmaTexto || '');
            setFirmaImagen(perfilBorrador.firmaImagen || null);
            setEditandoPerfil(false);
            toast({ title: 'Guardado', description: `Tus correos saldrán desde ${d.remitenteEfectivo}` });
        } catch (e) {
            toast({ variant: 'destructive', title: 'No se pudo guardar', description: e.message, duration: 10000 });
        } finally { setGuardandoPerfil(false); }
    };

    const guardarPlantilla = async () => {
        if (!asunto.trim() || !conTexto(cuerpo)) {
            return toast({ variant: 'destructive', title: 'Falta el asunto o el texto' });
        }
        const actual = plantillas.find(p => p.id === plantillaId);
        // Con una plantilla cargada, el nombre viene puesto: aceptar sin
        // cambiarlo actualiza esa. Escribir otro nombre crea una nueva, que es
        // la forma natural de hacer «guardar como».
        const nombre = window.prompt(
            actual
                ? 'Nombre de la plantilla.\n\nDéjalo igual para actualizar esta, o escribe otro para crear una nueva.'
                : 'Nombre de la plantilla (ej: Recordatorio de pago)',
            actual?.nombre || ''
        );
        if (nombre === null) return;
        if (!nombre.trim()) return toast({ variant: 'destructive', title: 'Falta el nombre' });

        const mismaDeAntes = actual && nombre.trim().toLowerCase() === actual.nombre.toLowerCase();
        setGuardando(true);
        try {
            const r = await guardarPlantillaCorreoApi(
                getSessionId(),
                {
                    nombre: nombre.trim(), asunto, cuerpo, firma, firmaImagen,
                    // Se conserva si era del equipo; una nueva nace propia.
                    compartida: mismaDeAntes ? !!actual?.compartida : false,
                    // Las columnas de la planilla abierta. El servidor rechaza las
                    // marcas que no conoce, y las del Excel no están en el CRM: sin
                    // esto no se podría guardar la plantilla del F29.
                    marcasExtra: modo === 'planilla' ? columnas : undefined,
                },
                mismaDeAntes ? plantillaId : null
            );
            const d = await r.json();
            if (!d.success) throw new Error(d.message);
            setPlantillaId(d.plantillaId);
            await cargarPlantillas();
            toast({ title: mismaDeAntes ? 'Plantilla actualizada' : 'Plantilla guardada' });
        } catch (e) {
            toast({ variant: 'destructive', title: 'No se pudo guardar', description: e.message });
        } finally { setGuardando(false); }
    };

    const borrarPlantilla = async (p, e) => {
        e.stopPropagation();
        if (!window.confirm(`¿Eliminar la plantilla «${p.nombre}»?\n\nEsto NO se puede deshacer.`)) return;
        try {
            const r = await eliminarPlantillaCorreoApi(getSessionId(), p.id);
            const d = await r.json();
            if (!d.success) throw new Error(d.message);
            if (plantillaId === p.id) setPlantillaId(null);
            await cargarPlantillas();
            toast({ title: 'Plantilla eliminada' });
        } catch (err) {
            toast({ variant: 'destructive', title: 'No se pudo eliminar', description: err.message });
        }
    };

    // Dónde estaba el cursor la última vez, para insertar el dato ahí y no
    // siempre al final del texto. El cuerpo ya no es un textarea sino el editor
    // con formato, que expone su propio `insertar`: la posición del cursor
    // dentro de HTML no se puede calcular con `selectionStart`.
    const refAsunto = useRef(null);
    const refEditor = useRef(null);
    const ultimoCampo = useRef('cuerpo');

    // ---- carga inicial ----
    useEffect(() => {
        (async () => {
            try {
                const [rc, rcampos, rperfil, rcuota, rimp] = await Promise.all([
                    getCrmDataApi(getSessionId()),
                    camposCorreoApi(getSessionId()),
                    miPerfilCorreoApi(getSessionId()),
                    cuotaCorreoApi(getSessionId()),
                    empresasImpagasApi(getSessionId()),
                ]);
                const dimp = await rimp.json().catch(() => ({}));
                if (dimp.success) setImpagas(dimp.empresas || []);
                const dc = await rc.json();
                const dcampos = await rcampos.json();
                const dperfil = await rperfil.json();
                // La cuota se muestra desde que se entra, sin esperar a que haya
                // una vista previa: es un dato del día, no de esta campaña.
                const dcuota = await rcuota.json().catch(() => ({}));
                if (dcuota.success) setCuota(dcuota);
                setClientes(dc.clients || dc.clientes || []);
                if (dcampos.success) setCampos(dcampos.campos || []);
                if (dperfil.success) {
                    setPerfil(dperfil);
                    // Su firma entra ya puesta en el redactor.
                    setFirma(dperfil.firmaTexto || '');
                    setFirmaImagen(dperfil.firmaImagen || null);
                    setPerfilBorrador({
                        correoRemitente: dperfil.correoRemitente || '',
                        firmaTexto: dperfil.firmaTexto || '',
                        firmaImagen: dperfil.firmaImagen || null,
                    });
                }
            } catch (e) {
                toast({ variant: 'destructive', title: 'No se pudo cargar', description: e.message });
            } finally { setCargando(false); }
        })();
    }, []);

    // Si al entrar hay un envío corriendo en el servidor, se retoma la barra:
    // el envío vive en el backend y sigue aunque se cierre el navegador.
    useEffect(() => {
        (async () => {
            try {
                const r = await progresoCampanaApi(getSessionId());
                const d = await r.json();
                if (d.activo) { setProgreso(d); setEnviando(true); }
            } catch { /* se muestra la pantalla normal */ }
        })();
    }, []);

    // ---- avance en vivo ----
    useEffect(() => {
        if (!enviando) return;
        const id = setInterval(async () => {
            try {
                const r = await progresoCampanaApi(getSessionId());
                const d = await r.json();
                setProgreso(d);
                if (!d.activo && d.finalizado) {
                    setEnviando(false);
                    // El contador cambió: hay que releerlo. Vale también para la
                    // prueba, que gasta cuota aunque sea un solo correo.
                    cuotaCorreoApi(getSessionId())
                        .then(res => res.json())
                        .then(c => { if (c.success) setCuota(c); })
                        .catch(() => { /* se actualiza en la próxima previa */ });
                    toast({
                        title: '✅ Envío terminado',
                        description: `Enviados: ${d.enviados} · Fallidos: ${d.fallidos}`,
                        duration: 12000,
                    });
                }
            } catch { /* solo es el indicador */ }
        }, 2000);
        return () => clearInterval(id);
    }, [enviando]);

    // ---- lista filtrada ----
    const lista = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        return clientes.filter(c => {
            if (soloConCorreo && !tieneCorreo(c)) return false;
            // Con la lista llena de elegidos, los demás estorban para repasar a
            // quién le vas a escribir.
            if (soloElegidos && !seleccion.includes(c.id)) return false;
            if (!q) return true;
            return String(c.razonSocial || '').toLowerCase().includes(q)
                || String(c.correo || '').toLowerCase().includes(q)
                || String(c.plan || '').toLowerCase().includes(q)
                || String(c.rut || '').replace(/[.\-]/g, '').includes(q.replace(/[.\-]/g, ''));
        });
    }, [clientes, busqueda, soloConCorreo, soloElegidos, seleccion]);

    const sinCorreo = clientes.filter(c => !tieneCorreo(c)).length;
    const alternar = (id) => setSeleccion(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
    const todosVisibles = lista.length > 0 && lista.every(c => seleccion.includes(c.id));

    // Un Set y no `filasSel.includes(...)`: dentro del map sería recorrer la
    // selección entera por cada fila dibujada.
    const selSet = useMemo(() => new Set(filasSel), [filasSel]);

    // ---- lo mismo, para las filas de la planilla ----
    // Se busca en TODAS las columnas: uno se acuerda del RUT o del correo, no de
    // en qué columna estaba.
    const filasVisibles = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        let idx = filas.map((_, i) => i);
        if (soloElegidos) idx = idx.filter(i => selSet.has(i));
        if (!q) return idx;
        return idx.filter(i => Object.values(filas[i] || {})
            .some(v => String(v ?? '').toLowerCase().includes(q)));
    }, [filas, busqueda, soloElegidos, selSet]);
    const alternarFila = (i) => setFilasSel(p => p.includes(i) ? p.filter(x => x !== i) : [...p, i]);
    const todasFilasVisibles = filasVisibles.length > 0 && filasVisibles.every(i => selSet.has(i));
    const filasConCorreo = useMemo(
        () => filas.filter(f => correosDeFila(f, colCorreo).length > 0).length,
        [filas, colCorreo]);

    // ---- insertar un dato en el punto del cursor ----
    const insertar = (marca) => {
        const texto = `{{${marca}}}`;
        if (ultimoCampo.current === 'asunto') {
            const el = refAsunto.current;
            const pos = el?.selectionStart ?? asunto.length;
            setAsunto(`${asunto.slice(0, pos)}${texto}${asunto.slice(pos)}`);
            // Devolver el foco y dejar el cursor DESPUÉS de lo insertado, para
            // poder seguir escribiendo sin volver a pulsar en el campo.
            requestAnimationFrame(() => {
                el?.focus();
                const p = pos + texto.length;
                el?.setSelectionRange?.(p, p);
            });
            return;
        }
        refEditor.current?.insertar(texto);
    };

    // A quién se le manda, en la forma que espera el servidor. Es lo único que
    // cambia entre los dos orígenes: la vista previa y el envío mandan esto y
    // todo lo demás va igual.
    const destinos = useMemo(
        () => modo === 'planilla'
            ? { filas: filasAEnviar, columnaCorreo: colCorreo || undefined }
            : { empresaIds: seleccion },
        [modo, filasAEnviar, colCorreo, seleccion]);

    // ---- vista previa ----
    const verPrevia = useCallback(async () => {
        if (!elegidos || !asunto.trim() || !conTexto(cuerpo)) return;
        setCargandoPrevia(true);
        try {
            const r = await previewCampanaApi(getSessionId(), { ...destinos, asunto, cuerpo });
            const d = await r.json();
            if (!d.success) throw new Error(d.message);
            setPrevia(d);
            if (d.cuota) setCuota(d.cuota);
            setIndicePrevia(0);
        } catch (e) {
            toast({ variant: 'destructive', title: 'No se pudo calcular', description: e.message });
        } finally { setCargandoPrevia(false); }
    }, [destinos, elegidos, asunto, cuerpo]);

    // La previa se recalcula sola al cambiar el texto, con un respiro para no
    // pedirla en cada tecla.
    useEffect(() => {
        if (!elegidos || !asunto.trim() || !cuerpo.trim()) { setPrevia(null); return; }
        const t = setTimeout(verPrevia, 700);
        return () => clearTimeout(t);
    }, [verPrevia, elegidos, asunto, cuerpo]);

    // ---- enviar ----
    const enviar = async (soloPrueba) => {
        if (!previa?.total) return;

        if (!soloPrueba) {
            const ok = window.confirm(
                `Se va a enviar el correo a ${previa.total} `
                + `${modo === 'planilla' ? 'destinatario(s) de la planilla' : 'empresa(s)'} DE VERDAD.\n\n`
                + `Asunto: ${asunto}\n`
                + `Remitente: ${previa.remitente}\n\n`
                + (previa.totalExcluidas ? `Quedan fuera ${previa.totalExcluidas} sin correo.\n\n` : '')
                + (previa.totalConDatosVacios
                    ? `⚠️ ${previa.totalConDatosVacios} lo recibirían con algún dato en blanco o en cero.\n\n`
                    : '')
                + `Esto NO se puede deshacer. ¿Continuar?`
            );
            if (!ok) return;
        }

        setEnviando(true);
        setProgreso(null);
        const cuerpoPeticion = {
            ...destinos, asunto, cuerpo, firma, firmaImagen, soloPrueba, plantillaId,
            adjuntos,
            correoPrueba: soloPrueba ? (correoPrueba.trim() || undefined) : undefined,
        };
        try {
            let r = await enviarCampanaApi(getSessionId(), cuerpoPeticion);
            let d = await r.json();

            // El servidor detecta que esto mismo ya se envió hace poco. No lo
            // bloquea: pregunta. A veces repetir es a propósito.
            // El servidor puede frenar por DOS motivos distintos: pasarse del tope
            // diario, o ser la misma campaña de hace un rato. Las confirmaciones
            // se ACUMULAN: si se pidieran de a una sin recordar la anterior, al
            // confirmar la segunda volvería a saltar la primera y quedaría dando
            // vueltas sin poder enviar nunca.
            const confirmado = {};
            while (!d.success && (d.excedeCuota || d.repetida)) {
                setEnviando(false);
                if (!window.confirm(`${d.message}\n\n¿Enviar igual?`)) return;
                if (d.excedeCuota) confirmado.confirmarCuota = true;
                if (d.repetida)    confirmado.confirmarRepetida = true;
                setEnviando(true);
                r = await enviarCampanaApi(getSessionId(), { ...cuerpoPeticion, ...confirmado });
                d = await r.json();
            }
            if (!d.success) throw new Error(d.message);
            toast({ title: soloPrueba ? '🧪 Prueba en camino' : '📧 Envío iniciado', description: d.mensaje, duration: 9000 });
        } catch (e) {
            setEnviando(false);
            toast({ variant: 'destructive', title: 'No se pudo iniciar', description: e.message });
        }
    };

    const listo = elegidos > 0 && asunto.trim() && conTexto(cuerpo) && previa?.total > 0;
    const actual = previa?.destinatarios?.[indicePrevia];

    // Los datos que se pueden insertar. Con una planilla abierta son SUS
    // columnas, no los campos del CRM: {{plan}} no existe en el Excel del F29 y
    // ofrecerlo sería empujar a escribir una marca que no se va a reemplazar.
    // Antes de la primera vista previa se arman con las columnas leídas acá; una
    // vez que responde el servidor, mandan las suyas.
    const camposActivos = modo !== 'planilla' ? campos
        : (previa?.camposPlanilla?.length
            ? previa.camposPlanilla
            : columnas.map(c => ({ marca: normalizarMarca(c), etiqueta: c, ejemplo: '' })));

    if (cargando) return (
        <div className="flex items-center justify-center py-20 text-slate-400"><Loader2 className="animate-spin" /></div>
    );

    return (
      <div className="flex-1 min-h-0 flex flex-col gap-3 h-full">

        {/* ═══ BARRA SUPERIOR ═══ */}
        <div className="shrink-0 flex items-center justify-between gap-3 bg-white border border-[#efe8dd] rounded-2xl px-4 py-2.5">
            <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                    <Mail size={15} className="text-emerald-600" />
                </div>
                <span className="text-sm font-black text-slate-900 tracking-tight">Correo Masivo</span>
                {/* Lo que reemplaza a la carpeta «Enviados» de Gmail, donde estos
                    correos nunca van a aparecer porque no pasan por ahí. */}
                <button onClick={() => setVerEnviados(true)}
                    title="Qué se envió, a quién llegó y qué decía exactamente"
                    className="ml-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-emerald-600 inline-flex items-center gap-1 border border-[#efe8dd] rounded-lg px-2 py-1">
                    <History size={11} /> Enviados
                </button>
                {/* El correo REAL de cada cliente, con sus datos ya puestos. Se
                    habilita recién cuando hay a quién y qué mandar: antes de eso
                    no hay nada que previsualizar. */}
                <button onClick={() => { setIndicePrevia(0); setPreviaAbierta(true); }}
                    disabled={!previa?.total}
                    title="Ver el correo tal como le va a llegar a cada cliente"
                    className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-emerald-600 disabled:opacity-40 disabled:hover:text-slate-500 inline-flex items-center gap-1 border border-[#efe8dd] rounded-lg px-2 py-1">
                    {cargandoPrevia ? <Loader2 size={11} className="animate-spin" /> : <Eye size={11} />} Vista previa
                </button>
            </div>
            {/* Los tres números que importan antes de apretar enviar. Se
                muestran acá arriba porque son la respuesta a «¿a cuántos le
                estoy escribiendo de verdad?», y esa pregunta se hace mirando
                la pantalla completa, no una columna. */}
            <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest">
                <span className="text-slate-400">
                    Seleccionados <span className="text-slate-900 tabular-nums">{elegidos}</span>
                </span>
                {previa && (
                    <>
                        <span className="text-slate-400">
                            Válidos <span className="text-emerald-600 tabular-nums">{previa.total}</span>
                        </span>
                        {previa.totalExcluidas > 0 && (
                            <span className="text-slate-400">
                                Fuera <span className="text-red-500 tabular-nums">{previa.totalExcluidas}</span>
                            </span>
                        )}
                    </>
                )}
                {adjuntos.length > 0 && (
                    <span className="text-slate-400">
                        Adjuntos <span className="text-slate-900 tabular-nums">{adjuntos.length}</span>
                    </span>
                )}

                {/* CUOTA DEL DÍA. El proveedor limita los envíos diarios y la
                    cartera con correo (132) supera el tope del plan gratuito
                    (~100). Sin esto, los que sobran se rechazan en silencio. */}
                {cuota && (
                    <span className={`px-2 py-1 rounded-lg border tabular-nums ${
                        cuota.quedan === 0        ? 'text-red-700 bg-red-500/10 border-red-500/30'
                      : cuota.quedan < (previa?.total ?? 0) ? 'text-amber-700 bg-amber-500/10 border-amber-500/40'
                      : 'text-slate-500 bg-slate-50 border-[#efe8dd]'}`}
                        title={`Hoy salieron ${cuota.enviados} de ${cuota.limite}`
                            + (cuota.pruebas ? ` (${cuota.reales} reales + ${cuota.pruebas} de prueba)` : '')
                            + `. Las pruebas gastan cuota igual, porque salen por el mismo proveedor.`
                            + ` El tope se ajusta con CORREOS_LIMITE_DIARIO según el plan contratado.`}>
                        Hoy {cuota.enviados}/{cuota.limite}
                        {cuota.pruebas > 0 && (
                            <span className="ml-1 opacity-60 font-normal normal-case">
                                ({cuota.pruebas} {cuota.pruebas === 1 ? 'prueba' : 'pruebas'})
                            </span>
                        )}
                        <span className="ml-1 opacity-70">· quedan {cuota.quedan}</span>
                    </span>
                )}
            </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3">

            {/* ═══ DESTINATARIOS ═══
                Va a la DERECHA con `order`, como en cualquier cliente de correo:
                lo primero que se mira es lo que se escribe. Se usa `order` y no
                se mueve el bloque para no arrastrar en la mudanza la lógica de
                cartera/planilla, que es la más delicada de la pantalla. */}
            <div className="w-full lg:w-72 xl:w-80 shrink-0 flex flex-col bg-white border border-[#efe8dd] rounded-2xl overflow-hidden lg:order-2">
                <div className="px-3 py-2.5 border-b border-[#efe8dd]">
                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-1.5">
                        <Users size={13} className="text-emerald-600" /> A quién
                        <span className="ml-auto text-emerald-600">{elegidos}</span>
                    </span>
                </div>

                {/* DE DÓNDE SALEN LOS DATOS.
                    «Cartera» los saca del CRM. «Planilla» los saca de un Excel, y
                    es para los envíos cuyas cifras no están en el sistema: el
                    resumen del F29 se calcula aparte y vive en una planilla. */}
                <div className="p-2 border-b border-[#efe8dd] grid grid-cols-2 gap-1.5">
                    {[['cartera', 'Cartera', Users], ['planilla', 'Planilla', FileSpreadsheet]].map(([id, texto, Icono]) => (
                        <button key={id} onClick={() => { setModo(id); setBusqueda(''); setPrevia(null); }}
                            className={`text-[10px] font-black uppercase tracking-widest rounded-lg py-1.5 border transition-colors inline-flex items-center justify-center gap-1.5 ${
                                modo === id ? 'bg-emerald-600 border-emerald-500 text-white'
                                            : 'bg-slate-50 border-[#efe8dd] text-slate-500 hover:border-emerald-500/60'}`}>
                            <Icono size={12} /> {texto}
                        </button>
                    ))}
                </div>

                {modo === 'cartera' ? (
                  <>
                <div className="p-2.5 space-y-2 border-b border-[#efe8dd]">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                        <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                            placeholder="Buscar empresa, plan, RUT…"
                            className={`${inp} pl-8`} />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                        <button onClick={() => setSeleccion(todosVisibles ? [] : lista.map(c => c.id))}
                            className="text-[10px] font-black uppercase tracking-wider text-emerald-600 hover:text-emerald-700">
                            {todosVisibles ? 'Quitar todos' : `Elegir los ${lista.length} visibles`}
                        </button>
                        {seleccion.length > 0 && (
                            <button onClick={() => setSeleccion([])} className="text-[10px] text-slate-400 hover:text-slate-600">Limpiar</button>
                        )}
                    </div>

                    {/* Con muchos elegidos, los demás estorban para repasar la
                        lista. Se enciende solo pasando de 10; queda el botón
                        porque si no, no habría cómo agregar al siguiente. */}
                    {elegidos > 10 && (
                        <button onClick={() => setSoloElegidos(v => !v)}
                            className={`w-full text-[10px] font-black uppercase tracking-wider rounded-lg py-1.5 border transition-colors ${
                                soloElegidos ? 'bg-emerald-600 border-emerald-500 text-white'
                                             : 'bg-slate-50 border-[#efe8dd] text-slate-500 hover:border-emerald-500/60'}`}>
                            {soloElegidos ? `Viendo solo los ${elegidos} elegidos · ver todos` : `Ver solo los ${elegidos} elegidos`}
                        </button>
                    )}
                    {/* COBRANZA · marcar de una a quienes deben.
                        El correo de factura impaga va a un puñado, no a la
                        cartera entera, y buscarlos a mano en la lista es donde
                        se cuela mandarle un cobro a alguien que ya pagó. */}
                    {impagas.length > 0 && (
                        <button
                            onClick={() => setSeleccion(impagas.map(i => i.id))}
                            title={`${impagas.length} empresas con facturas en PENDIENTE_PAGO`}
                            className="w-full text-[10px] font-black uppercase tracking-wider text-amber-700 bg-amber-500/10 border border-amber-500/40 rounded-lg py-1.5 hover:bg-amber-500/20 transition-colors">
                            Elegir las {impagas.length} con factura impaga
                        </button>
                    )}

                    {/* Las que no tienen correo no se pueden mandar. Se esconden por
                        omisión pero se dice cuántas son: si no, uno cree que le
                        escribió a toda la cartera y quedaron 12 afuera. */}
                    {sinCorreo > 0 && (
                        <label className="flex items-center gap-1.5 text-[10px] text-slate-500 cursor-pointer">
                            <input type="checkbox" checked={soloConCorreo} onChange={(e) => setSoloConCorreo(e.target.checked)}
                                className="accent-emerald-500" />
                            Esconder las {sinCorreo} sin correo cargado
                        </label>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto">
                    {lista.length === 0 ? (
                        <div className="text-center py-8 px-4">
                            <p className="text-[11px] text-slate-400 italic">Ninguna empresa calza.</p>
                            {/* Sin esto uno busca a alguien, no aparece, y parece
                                que no está en la cartera cuando solo está oculto. */}
                            {soloElegidos && (
                                <button onClick={() => setSoloElegidos(false)}
                                    className="mt-1 text-[10px] font-black uppercase tracking-wider text-emerald-600 hover:text-emerald-700">
                                    Estás viendo solo los elegidos · buscar en toda la cartera
                                </button>
                            )}
                        </div>
                    ) : lista.map(c => {
                        const marcada = seleccion.includes(c.id);
                        const conCorreo = tieneCorreo(c);
                        return (
                            <button key={c.id} onClick={() => conCorreo && alternar(c.id)}
                                disabled={!conCorreo}
                                className={`w-full text-left px-3 py-2 border-b border-[#f5f0e8] flex items-center gap-2.5 transition-colors
                                    ${marcada ? 'bg-emerald-500/5' : 'hover:bg-slate-50'} ${!conCorreo ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                <input type="checkbox" checked={marcada} readOnly disabled={!conCorreo}
                                    className="accent-emerald-500 shrink-0" />
                                {/* La inicial ayuda a barrer la lista con la vista
                                    cuando son 132 filas de texto parecido. */}
                                <span className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center text-[9px] font-black
                                    ${marcada ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                    {iniciales(c.razonSocial)}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[11px] font-bold text-slate-800 truncate">{c.razonSocial}</span>
                                    <span className="block text-[9px] text-slate-400 truncate">
                                        {conCorreo ? c.correo : 'sin correo en la ficha'}
                                    </span>
                                    <span className={`inline-block mt-0.5 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${colorPlan(c.plan)}`}>
                                        {c.plan}
                                    </span>
                                </span>
                            </button>
                        );
                    })}
                </div>
                  </>
                ) : !libro ? (
                    // ---- todavía no hay planilla ----
                    <div className="flex-1 overflow-y-auto p-3">
                        <label className="block border-2 border-dashed border-[#efe8dd] rounded-2xl p-6 text-center cursor-pointer hover:border-emerald-500/50 transition-colors">
                            <input ref={plaRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                                onChange={(e) => leerPlanilla(e.target.files?.[0])} />
                            <Upload size={24} className="mx-auto text-slate-300" />
                            <p className="text-xs font-bold text-slate-700 mt-2">Sube la planilla</p>
                            <p className="text-[10px] text-slate-400 mt-1">Excel (.xlsx, .xls) o CSV</p>
                            <p className="text-[10px] text-slate-400 mt-3 leading-relaxed">
                                Cada columna se vuelve un dato que puedes insertar en el texto.
                                No hay que configurar nada.
                            </p>
                        </label>
                    </div>
                ) : (
                  <>
                    <div className="p-2.5 space-y-2 border-b border-[#efe8dd]">
                        <div className="flex items-center gap-2">
                            <FileSpreadsheet size={13} className="text-emerald-600 shrink-0" />
                            <span className="text-[10px] font-bold text-slate-700 truncate flex-1" title={libro.nombre}>
                                {libro.nombre}
                            </span>
                            <button onClick={quitarPlanilla} title="Quitar la planilla"
                                className="text-slate-300 hover:text-red-500 shrink-0"><X size={13} /></button>
                        </div>

                        {/* Solo si el libro trae más de una hoja: un desplegable de
                            una opción es ruido. */}
                        {libro.hojas.length > 1 && (
                            <label className="block">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Hoja</span>
                                <select value={hoja} onChange={(e) => abrirHoja(libroRef.current, e.target.value)}
                                    className={`${inp} mt-0.5`}>
                                    {libro.hojas.map(h => <option key={h} value={h}>{h}</option>)}
                                </select>
                            </label>
                        )}

                        {/* Qué columna trae el correo. Se adivina, pero se muestra
                            cuál se eligió y se puede corregir: si adivina mal, el
                            correo no le llega a nadie y no habría cómo saberlo. */}
                        <label className="block">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Columna del correo</span>
                            <select value={colCorreo} onChange={(e) => cambiarColCorreo(e.target.value)}
                                className={`${inp} mt-0.5`}>
                                <option value="">— elige una —</option>
                                {columnas.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </label>

                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                                placeholder="Buscar en la planilla…" className={`${inp} pl-8`} />
                        </div>

                        <div className="flex items-center justify-between gap-2">
                            <button
                                onClick={() => setFilasSel(p => todasFilasVisibles
                                    ? p.filter(i => !filasVisibles.includes(i))
                                    : [...new Set([...p, ...filasVisibles.filter(i => correosDeFila(filas[i], colCorreo).length > 0)])])}
                                className="text-[10px] font-black uppercase tracking-wider text-emerald-600 hover:text-emerald-700">
                                {todasFilasVisibles ? 'Quitar todas' : `Elegir las ${filasVisibles.length} visibles`}
                            </button>
                            {filasSel.length > 0 && (
                                <button onClick={() => setFilasSel([])} className="text-[10px] text-slate-400 hover:text-slate-600">Limpiar</button>
                            )}
                        </div>

                        {elegidos > 10 && (
                            <button onClick={() => setSoloElegidos(v => !v)}
                                className={`w-full text-[10px] font-black uppercase tracking-wider rounded-lg py-1.5 border transition-colors ${
                                    soloElegidos ? 'bg-emerald-600 border-emerald-500 text-white'
                                                 : 'bg-slate-50 border-[#efe8dd] text-slate-500 hover:border-emerald-500/60'}`}>
                                {soloElegidos ? `Viendo solo las ${elegidos} elegidas · ver todas` : `Ver solo las ${elegidos} elegidas`}
                            </button>
                        )}

                        <p className="text-[9px] text-slate-400 flex items-center gap-1">
                            <Table2 size={10} />
                            {filas.length} {filas.length === 1 ? 'fila' : 'filas'} · {columnas.length} columnas ·{' '}
                            <b className={filasConCorreo === filas.length ? 'text-emerald-600' : 'text-amber-600'}>
                                {filasConCorreo} con correo
                            </b>
                        </p>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {filasVisibles.length === 0 ? (
                            <div className="text-center py-8 px-4">
                                <p className="text-[11px] text-slate-400 italic">Ninguna fila calza.</p>
                                {soloElegidos && (
                                    <button onClick={() => setSoloElegidos(false)}
                                        className="mt-1 text-[10px] font-black uppercase tracking-wider text-emerald-600 hover:text-emerald-700">
                                        Estás viendo solo las elegidas · buscar en toda la planilla
                                    </button>
                                )}
                            </div>
                        ) : filasVisibles.map(i => {
                            const f = filas[i];
                            const correos = correosDeFila(f, colCorreo);
                            const marcada = selSet.has(i);
                            const etq = etiquetaDeFila(f, columnas, colCorreo, i);
                            return (
                                <button key={i} onClick={() => correos.length && alternarFila(i)}
                                    disabled={!correos.length}
                                    className={`w-full text-left px-3 py-2 border-b border-[#f5f0e8] flex items-center gap-2.5 transition-colors
                                        ${marcada ? 'bg-emerald-500/5' : 'hover:bg-slate-50'} ${!correos.length ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                    <input type="checkbox" checked={marcada} readOnly disabled={!correos.length}
                                        className="accent-emerald-500 shrink-0" />
                                    <span className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center text-[9px] font-black
                                        ${marcada ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                        {iniciales(etq)}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-[11px] font-bold text-slate-800 truncate">{etq}</span>
                                        <span className="block text-[9px] text-slate-400 truncate">
                                            {correos.length ? correos.join(', ') : 'sin correo en esta fila'}
                                        </span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                  </>
                )}
            </div>

            {/* ═══ REDACTAR ═══ */}
            <div className="flex-1 min-w-0 flex flex-col bg-white border border-[#efe8dd] rounded-2xl overflow-hidden lg:order-1">
                <div className="px-3 py-2.5 border-b border-[#efe8dd]">
                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-1.5">
                        <PenLine size={13} className="text-emerald-600" /> Redactar
                    </span>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                    {/* Las plantillas van PRIMERO: la decisión «¿esto ya lo tengo
                        escrito?» se toma antes de ponerse a redactar. */}
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                <LayoutTemplate size={11} /> Plantillas
                            </span>
                            <button onClick={guardarPlantilla} disabled={guardando || !asunto.trim() || !cuerpo.trim()}
                                title="Guardar lo que escribiste para reusarlo"
                                className="text-[9px] font-black uppercase tracking-widest text-emerald-600 hover:text-emerald-700 disabled:opacity-40 flex items-center gap-1">
                                {guardando ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />}
                                {plantillas.find(p => p.id === plantillaId) ? 'Guardar cambios' : 'Guardar como plantilla'}
                            </button>
                        </div>
                        {plantillas.length === 0 ? (
                            <p className="text-[10px] text-slate-400 italic border border-dashed border-[#efe8dd] rounded-lg py-2 text-center">
                                Aún no hay plantillas. Escribe un correo y guárdalo.
                            </p>
                        ) : (
                            <div className="flex gap-1.5 flex-wrap">
                                {plantillas.map(p => {
                                    const activa = plantillaId === p.id;
                                    return (
                                        <button key={p.id} onClick={() => usarPlantilla(p)}
                                            title={`${p.asunto}${p.vecesUsada ? ` · usada ${p.vecesUsada} ${p.vecesUsada === 1 ? 'vez' : 'veces'}` : ''}`}
                                            className={`group text-[10px] font-bold px-2 py-1 rounded-lg border transition-colors flex items-center gap-1 ${
                                                activa ? 'bg-emerald-600 border-emerald-500 text-white'
                                                       : 'bg-slate-50 border-[#efe8dd] text-slate-600 hover:border-emerald-500/60'}`}>
                                            {activa && <Check size={10} />}
                                            {/* De un vistazo: candado = mía, dos personas =
                                                la ve todo el equipo. */}
                                            {p.compartida
                                                ? <Users2 size={9} className={activa ? 'text-emerald-100' : 'text-slate-400'} />
                                                : <Lock size={9} className={activa ? 'text-emerald-100' : 'text-slate-400'} />}
                                            {p.nombre}
                                            {p.vecesUsada > 0 && (
                                                <span className={activa ? 'text-emerald-100' : 'text-slate-400'}>· {p.vecesUsada}</span>
                                            )}
                                            <span onClick={(e) => borrarPlantilla(p, e)} title="Eliminar"
                                                className={`opacity-0 group-hover:opacity-100 ${activa ? 'hover:text-red-200' : 'hover:text-red-500'}`}>
                                                <Trash2 size={10} />
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Sale desde SU dirección, no desde una fija para todos: si el
                        cliente responde, le responde a quien le escribió. */}
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Sale desde</span>
                            <button onClick={() => setEditandoPerfil(v => !v)}
                                className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-emerald-600 flex items-center gap-1">
                                <PenLine size={10} /> Mi correo y firma
                            </button>
                        </div>
                        <div className="bg-slate-50 border border-[#efe8dd] rounded-lg px-3 py-2 text-xs text-slate-600 font-mono truncate">
                            {previa?.remitente || perfil?.remitenteEfectivo || '—'}
                        </div>
                        {!perfil?.correoRemitente && (
                            <p className="text-[9px] text-amber-700 mt-1">
                                No configuraste el tuyo: sale desde el correo por omisión. Pulsa «Mi correo y firma».
                            </p>
                        )}
                    </div>

                    {editandoPerfil && (
                        <div className="border border-emerald-500/40 rounded-xl p-3 space-y-2.5 bg-emerald-500/[0.03]">
                            <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Mi correo y mi firma</p>
                            <p className="text-[10px] text-slate-500 leading-relaxed">
                                Es tuyo, no del equipo. Se usa en todos tus envíos y la firma se carga sola al redactar.
                            </p>
                            <label className="block">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Mi correo de salida</span>
                                <input value={perfilBorrador.correoRemitente}
                                    onChange={(e) => setPerfilBorrador(p => ({ ...p, correoRemitente: e.target.value }))}
                                    placeholder={`nombre@${perfil?.dominio || 'vsvconsultores.com'}`}
                                    className={`${inp} mt-1 font-mono`} />
                                {/* Esto NO es un capricho: Resend solo deja enviar desde
                                    el dominio verificado. Con otro, el envío se rechaza
                                    y el correo no sale. */}
                                <span className="text-[9px] text-slate-400 block mt-0.5">
                                    Tiene que ser <b>@{perfil?.dominio || 'vsvconsultores.com'}</b>. Desde otro dominio el envío se rechaza.
                                </span>
                            </label>

                            <label className="block">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Mi firma</span>
                                <textarea value={perfilBorrador.firmaTexto} rows={3}
                                    onChange={(e) => setPerfilBorrador(p => ({ ...p, firmaTexto: e.target.value }))}
                                    placeholder={'Matías Olivos\nVSV Contadores\n+56 9 ...'}
                                    className={`${inp} mt-1 resize-y`} />
                            </label>
                            <div>
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                                    Imagen de la firma (logo)
                                </span>
                                <LogoUploader
                                    value={perfilBorrador.firmaImagen}
                                    onChange={(v) => setPerfilBorrador(p => ({ ...p, firmaImagen: v }))}
                                    size={72}
                                    onError={(m) => toast({ variant: 'destructive', title: 'Imagen', description: m })}
                                />
                                <p className="text-[9px] text-slate-400 mt-1">
                                    Se achica sola y viaja dentro del correo. Sale a 200px de ancho debajo del texto.
                                </p>
                            </div>
                            <div className="flex gap-2 pt-1">
                                <Button onClick={guardarPerfil} disabled={guardandoPerfil}
                                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg h-9 text-[10px] font-black uppercase tracking-widest inline-flex items-center justify-center gap-1.5">
                                    {guardandoPerfil ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Guardar
                                </Button>
                                <button onClick={() => setEditandoPerfil(false)}
                                    className="px-4 rounded-lg border border-[#efe8dd] text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-900">
                                    Cerrar
                                </button>
                            </div>
                        </div>
                    )}

                    <div>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Asunto</span>
                        <input ref={refAsunto} value={asunto} onChange={(e) => setAsunto(e.target.value)}
                            onFocus={() => { ultimoCampo.current = 'asunto'; }}
                            placeholder="Ej: Estado de su plan {{plan}}"
                            className={`${inp} mt-1`} />
                    </div>

                    <div onFocus={() => { ultimoCampo.current = 'cuerpo'; }}>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Texto del correo</span>
                        <div className="mt-1">
                            <EditorRico
                                ref={refEditor}
                                value={cuerpo}
                                onChange={setCuerpo}
                                placeholder={'Hola {{empresa}},\n\nLe recordamos que su plan {{plan}} tiene un valor de {{valor_plan}} mensuales.\n\nQuedamos atentos.'}
                            />
                        </div>
                    </div>

                    {/* ADJUNTOS. Se mandan los mismos a todos: el informe del mes,
                        la cartola, lo que sea. El servidor los escribe una vez a
                        disco y los reusa para los 130 envíos. */}
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                <Paperclip size={11} /> Adjuntos {adjuntos.length > 0 && `(${adjuntos.length})`}
                            </span>
                            <button onClick={() => adjRef.current?.click()}
                                className="text-[9px] font-black uppercase tracking-widest text-emerald-600 hover:text-emerald-700">
                                + Agregar archivo
                            </button>
                        </div>
                        <input ref={adjRef} type="file" multiple className="hidden" onChange={agregarAdjunto} />
                        {adjuntos.length === 0 ? (
                            <p className="text-[10px] text-slate-400 italic">Sin adjuntos. Van los mismos a todos los destinatarios.</p>
                        ) : (
                            <div className="space-y-1">
                                {adjuntos.map((a, i) => (
                                    <div key={i} className="flex items-center gap-2 bg-slate-50 border border-[#efe8dd] rounded-lg px-2 py-1">
                                        <Paperclip size={11} className="text-slate-400 shrink-0" />
                                        <span className="text-[10px] text-slate-700 flex-1 truncate">{a.nombre}</span>
                                        <span className="text-[9px] text-slate-400 shrink-0">{kb(a.tamano)}</span>
                                        <button onClick={() => setAdjuntos(p => p.filter((_, x) => x !== i))}
                                            className="text-slate-300 hover:text-red-500 shrink-0"><Trash2 size={11} /></button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Los datos que se pueden insertar. Se ponen DEBAJO del texto
                        y con un clic, porque escribirlos de memoria es donde se
                        cuelan los errores de tipeo que nadie ve hasta que sale. */}
                    <div className="bg-slate-50 border border-[#efe8dd] rounded-xl p-2.5">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1 mb-1.5">
                            <Sparkles size={11} className="text-emerald-600" />
                            {modo === 'planilla'
                                ? 'Columnas de la planilla · pulsa para insertar'
                                : 'Datos del cliente · pulsa para insertar'}
                        </span>
                        {modo === 'planilla' && !camposActivos.length && (
                            <p className="text-[10px] text-slate-400 italic">
                                Sube una planilla y acá aparecen sus columnas.
                            </p>
                        )}
                        <div className="flex flex-wrap gap-1.5">
                            {camposActivos.map(c => (
                                <button key={c.marca} onClick={() => insertar(c.marca)}
                                    title={c.ejemplo ? `${c.etiqueta} — ej: ${c.ejemplo}` : `Columna «${c.etiqueta}» → {{${c.marca}}}`}
                                    className="text-[10px] font-bold px-2 py-1 rounded-lg bg-white border border-[#efe8dd] text-slate-600 hover:border-emerald-500/60 hover:text-emerald-700 transition-colors">
                                    {c.etiqueta}
                                </button>
                            ))}
                        </div>
                        <p className="text-[9px] text-slate-400 mt-1.5">
                            {modo === 'planilla'
                                ? 'Cada uno se reemplaza por el valor de esa fila al enviar.'
                                : 'Cada uno se reemplaza por el dato real de cada empresa al enviar.'}
                        </p>
                        {/* Los enlaces ya no se escriben a mano con [texto](url):
                            ese truco existía porque el cuerpo era texto plano. Ahora
                            hay botón en la barra del editor. */}
                    </div>

                    <div>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                            Firma de este envío
                        </span>
                        <textarea value={firma} onChange={(e) => setFirma(e.target.value)} rows={2}
                            placeholder="Se carga la tuya. Puedes cambiarla solo para este envío."
                            className={`${inp} mt-1 resize-y`} />
                        {firmaImagen && (
                            <div className="mt-1.5 flex items-center gap-2">
                                <img src={firmaImagen} alt="firma" className="h-10 w-auto rounded border border-[#efe8dd]" />
                                <button onClick={() => setFirmaImagen(null)}
                                    className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-red-500">
                                    Quitar la imagen
                                </button>
                            </div>
                        )}
                    </div>

                    {/* El error caro de este módulo: el correo sale igual y el
                        cliente lee «su plan  tiene un valor de $0». Se avisa,
                        no se bloquea: puede que de verdad valga cero. */}
                    {previa?.totalConDatosVacios > 0 && (
                        <div className="bg-amber-500/5 border border-amber-500/40 rounded-xl p-2.5">
                            <div className="flex gap-2">
                                <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                                <div className="text-[10px] text-amber-800 min-w-0">
                                    <b>{previa.totalConDatosVacios} de {previa.total}</b> recibirían el correo con
                                    algún dato en blanco o en cero. Léelo antes de mandar: se envía tal cual.
                                    <details className="mt-1">
                                        <summary className="cursor-pointer font-bold">Ver cuáles</summary>
                                        <ul className="mt-1 space-y-0.5 max-h-28 overflow-y-auto text-slate-500">
                                            {previa.conDatosVacios.map(x => (
                                                <li key={x.id}>· {x.razonSocial} — <i>{x.campos.join(', ')}</i></li>
                                            ))}
                                        </ul>
                                    </details>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* La misma persona en dos sociedades recibiría el correo dos
                        veces. Pasa con los clientes que tienen varias empresas, y
                        desde afuera se ve como si el sistema fallara. */}
                    {previa?.totalRepetidos > 0 && (
                        <div className="bg-blue-500/5 border border-blue-500/30 rounded-xl p-2.5 flex gap-2">
                            <Users2 size={14} className="text-blue-500 shrink-0 mt-0.5" />
                            <div className="text-[10px] text-blue-800 min-w-0">
                                <b>{previa.totalRepetidos} {previa.totalRepetidos === 1 ? 'dirección aparece' : 'direcciones aparecen'} en más de una empresa.</b>
                                {' '}Esa persona va a recibir el correo una vez por cada una.
                                <details className="mt-1">
                                    <summary className="cursor-pointer font-bold">Ver cuáles</summary>
                                    <ul className="mt-1 space-y-0.5 max-h-24 overflow-y-auto text-slate-500">
                                        {previa.repetidos.map(r => (
                                            <li key={r.correo}>· {r.correo} → {r.empresas.join(', ')}</li>
                                        ))}
                                    </ul>
                                </details>
                            </div>
                        </div>
                    )}

                    {previa?.marcasDesconocidas?.length > 0 && (
                        <div className="bg-red-500/5 border border-red-500/30 rounded-xl p-2.5 flex gap-2">
                            <AlertTriangle size={14} className="text-red-500 shrink-0 mt-0.5" />
                            <div className="text-[10px] text-red-700">
                                <b>Estos datos no existen</b> y se van a enviar tal cual están escritos:{' '}
                                {previa.marcasDesconocidas.map(m => <code key={m} className="bg-red-500/10 px-1 rounded mx-0.5">{`{{${m}}}`}</code>)}
                                <br />Usa los botones de arriba para insertarlos bien.
                            </div>
                        </div>
                    )}
                </div>

                {/* Barra de acción */}
                <div className="p-3 border-t border-[#efe8dd] shrink-0 space-y-2">
                    {enviando && progreso && (
                        <div className="bg-slate-50 border border-[#efe8dd] rounded-lg p-2">
                            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-slate-600 mb-1">
                                <span>{progreso.empresaActual || 'Preparando…'}</span>
                                <span className="tabular-nums">{progreso.actual}/{progreso.total}</span>
                            </div>
                            <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500 transition-all"
                                    style={{ width: `${progreso.total ? (progreso.actual / progreso.total) * 100 : 0}%` }} />
                            </div>
                            <div className="flex gap-3 mt-1 text-[9px] text-slate-500">
                                <span className="text-emerald-600">✓ {progreso.enviados}</span>
                                {progreso.fallidos > 0 && <span className="text-red-500">✕ {progreso.fallidos}</span>}
                            </div>
                        </div>
                    )}
                    {/* A dónde va la prueba. Por omisión la casilla interna; se
                        puede cambiar para verla en Outlook o mandársela a alguien. */}
                    {!enviando && (
                        <div className="flex items-center gap-2">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest shrink-0">Prueba a</span>
                            <input value={correoPrueba} onChange={(e) => setCorreoPrueba(e.target.value)}
                                placeholder="felipe.veram2001@gmail.com"
                                className="flex-1 bg-slate-50 border border-[#efe8dd] rounded-lg px-2 py-1 text-[10px] outline-none focus:border-emerald-500" />
                        </div>
                    )}
                    <div className="flex gap-2">
                        {enviando ? (
                            <Button onClick={detener} disabled={deteniendo}
                                title="Corta lo que falta. Lo ya enviado no se puede volver atrás."
                                className="bg-red-600 hover:bg-red-500 text-white rounded-lg h-10 px-4 text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-1.5">
                                {deteniendo ? <Loader2 size={13} className="animate-spin" /> : <Square size={12} />} Detener
                            </Button>
                        ) : (
                            <Button onClick={() => enviar(true)} disabled={!listo}
                                title="Manda UNO solo para ver cómo queda antes de escribirle a todos"
                                className="bg-slate-100 hover:bg-slate-200 border border-[#efe8dd] text-slate-600 rounded-lg h-10 px-4 text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-1.5">
                                <FlaskConical size={13} /> Probar
                            </Button>
                        )}
                        <Button onClick={() => enviar(false)} disabled={!listo || enviando}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg h-10 text-[10px] font-black uppercase tracking-widest inline-flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20">
                            {enviando ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                            {enviando ? 'Enviando…' : `Enviar a ${previa?.total ?? elegidos}`}
                        </Button>
                    </div>
                </div>
            </div>

            {/* ═══ CÓMO QUEDA · el correo real de cada cliente ═══ */}
            {previaAbierta && (
            <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
                 onClick={() => setPreviaAbierta(false)}>
            <div className="bg-white w-full max-w-xl h-[85vh] rounded-2xl border border-[#efe8dd] shadow-2xl flex flex-col overflow-hidden"
                 onClick={(e) => e.stopPropagation()}>
                <div className="px-3 py-2.5 border-b border-[#efe8dd] flex items-center gap-1.5">
                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-1.5">
                        <Eye size={13} className="text-emerald-600" /> Cómo queda
                    </span>
                    {cargandoPrevia && <Loader2 size={11} className="animate-spin text-slate-400" />}
                    <button onClick={() => setPreviaAbierta(false)}
                        className="ml-auto text-slate-400 hover:text-red-500"><X size={16} /></button>
                </div>

                {!actual ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-2 text-slate-400">
                        <Building2 size={26} className="opacity-40" />
                        <p className="text-[11px]">
                            Elige empresas y escribe el asunto y el texto.<br />Acá vas a ver el correo real de cada una.
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Navegar entre destinatarios: revisar 2 o 3 antes de mandar
                            es lo que evita el "se envió con la marca sin reemplazar". */}
                        <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#efe8dd] bg-slate-50">
                            <button onClick={() => setIndicePrevia(i => Math.max(0, i - 1))} disabled={indicePrevia === 0}
                                className="text-slate-400 hover:text-slate-700 disabled:opacity-30"><ChevronLeft size={14} /></button>
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest tabular-nums">
                                {indicePrevia + 1} de {previa.total}
                            </span>
                            <button onClick={() => setIndicePrevia(i => Math.min(previa.total - 1, i + 1))}
                                disabled={indicePrevia >= previa.total - 1}
                                className="text-slate-400 hover:text-slate-700 disabled:opacity-30"><ChevronRight size={14} /></button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-3 space-y-2">
                            <div className="text-[10px] space-y-0.5 pb-2 border-b border-[#efe8dd]">
                                <p className="text-slate-400">Para: <span className="text-slate-700 font-bold">{actual.correos.join(', ')}</span></p>
                                <p className="text-slate-400">
                                    {modo === 'planilla' ? 'Fila' : 'Empresa'}:{' '}
                                    <span className="text-slate-700 font-bold">{actual.razonSocial}</span>
                                </p>
                            </div>
                            <p className="text-xs font-black text-slate-900">{actual.asunto}</p>
                            {/* Con formato, tal como le va a llegar. El servidor ya
                                lo saneó al armar la previa. */}
                            <CuerpoCorreo texto={actual.cuerpo} className="text-[11px] text-slate-700 leading-relaxed" />
                            {(firma || firmaImagen) && (
                                <div className="border-t border-[#efe8dd] pt-2 mt-2">
                                    {firmaImagen && <img src={firmaImagen} alt="" className="max-w-[140px] h-auto mb-1.5" />}
                                    {firma && <p className="text-[10px] text-slate-400 whitespace-pre-wrap">{firma}</p>}
                                </div>
                            )}
                        </div>

                        {/* RESUMEN · los números finales, juntos y al lado del
                            botón de enviar. Es lo último que uno mira antes de
                            apretar, así que no puede estar en otra columna. */}
                        <div className="px-3 py-2.5 border-t border-[#efe8dd] bg-slate-50/60 space-y-1">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                                Resumen del envío
                            </p>
                            {[
                                ['Seleccionados', elegidos, 'text-slate-900'],
                                ['Les llega', previa.total, 'text-emerald-600'],
                                ['Quedan fuera', previa.totalExcluidas, previa.totalExcluidas ? 'text-red-500' : 'text-slate-300'],
                                ['Con datos vacíos', previa.totalConDatosVacios || 0, previa.totalConDatosVacios ? 'text-amber-600' : 'text-slate-300'],
                                ['Correos repetidos', previa.totalRepetidos || 0, previa.totalRepetidos ? 'text-blue-600' : 'text-slate-300'],
                                ['Adjuntos', adjuntos.length, adjuntos.length ? 'text-slate-900' : 'text-slate-300'],
                            ].map(([label, valor, color]) => (
                                <div key={label} className="flex items-center justify-between text-[10px]">
                                    <span className="text-slate-500">{label}</span>
                                    <span className={`font-black tabular-nums ${color}`}>{valor}</span>
                                </div>
                            ))}
                        </div>

                        {previa.totalExcluidas > 0 && (
                            <div className="px-3 py-2 border-t border-[#efe8dd] bg-amber-500/5">
                                <details>
                                    <summary className="text-[10px] font-bold text-amber-700 cursor-pointer">
                                        {previa.totalExcluidas} quedan fuera por no tener correo
                                    </summary>
                                    <ul className="mt-1 text-[9px] text-slate-500 space-y-0.5 max-h-24 overflow-y-auto">
                                        {previa.excluidas.map(x => <li key={x.id}>· {x.razonSocial}</li>)}
                                    </ul>
                                </details>
                            </div>
                        )}
                    </>
                )}

                {progreso?.errores?.length > 0 && (
                    <div className="px-3 py-2 border-t border-[#efe8dd] bg-red-500/5">
                        <details>
                            <summary className="text-[10px] font-bold text-red-700 cursor-pointer">
                                {progreso.errores.length} fallaron
                            </summary>
                            <ul className="mt-1 text-[9px] text-slate-500 space-y-0.5 max-h-24 overflow-y-auto">
                                {progreso.errores.map((e, i) => <li key={i}>· {e.razonSocial}: {e.error}</li>)}
                            </ul>
                        </details>
                    </div>
                )}
            </div>
            </div>
            )}
        </div>

        {verEnviados && <HistorialCorreosModal onClose={() => setVerEnviados(false)} />}
      </div>
    );
};

export default EnvioCorreos;
