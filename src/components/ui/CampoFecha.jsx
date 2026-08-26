import React, { useState, useEffect, useRef } from 'react';
import { CalendarRange } from 'lucide-react';

// =====================================================================
// CAMPO DE FECHA · se ESCRIBE o se elige del calendario
// ---------------------------------------------------------------------
// Antes esto era un `<input type="date">` pelado. Para «hoy» o «ayer» va bien,
// pero para saltar a una fecha lejana —01-01-2024— obliga a pasear el
// calendario mes a mes, o a acertarle a los tres segmentos del control sin
// equivocarse de orden. Quien carga contabilidad tiene la fecha en la cabeza y
// la escribe de corrido.
//
// Así que ahora son las DOS COSAS sobre el mismo dato: un campo de texto donde
// se teclea, y el ícono de calendario al lado para elegirla. No son dos campos
// que haya que mantener iguales a mano — el calendario escribe en el texto y el
// texto manda al filtro.
//
// SE ACEPTA LO QUE LA GENTE ESCRIBE DE VERDAD: `5/1/24`, `05-01-2024`,
// `5.1.2024` y `05012024`. Exigir un formato único sería devolverle el trabajo
// al usuario para comodidad del programa.
//
// ⚠️ Va a nivel de módulo, NO dentro de SelectorRango. Definido adentro, React
// lo trataría como un componente nuevo en cada render del padre: se
// desmontaría y volvería a montar en cada tecla, perdiendo el foco y el texto
// a medio escribir. Es exactamente el caso que hace fallar este patrón.
// =====================================================================

// Fecha ISO → lo que se muestra y se teclea (dd-mm-aaaa).
const aTexto = (iso) => {
  if (!iso) return '';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return (a && m && d) ? `${d}-${m}-${a}` : '';
};

// Lo tecleado → ISO. Devuelve null si no se entiende: null significa
// «no toques el filtro», nunca «usa hoy».
const aISO = (texto) => {
  const t = String(texto || '').trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;      // ya viene del calendario

  let d, m, a;
  const digitos = t.replace(/\D/g, '');
  if (/^\d{8}$/.test(digitos) && /^\d+$/.test(t)) {        // 05012024
    [d, m, a] = [digitos.slice(0, 2), digitos.slice(2, 4), digitos.slice(4)];
  } else if (/^\d{6}$/.test(digitos) && /^\d+$/.test(t)) { // 050124
    [d, m, a] = [digitos.slice(0, 2), digitos.slice(2, 4), `20${digitos.slice(4)}`];
  } else {
    const partes = t.split(/\D+/).filter(Boolean);
    if (partes.length !== 3) return null;
    [d, m, a] = partes;
    if (a.length === 2) a = `20${a}`;
  }

  const dia = Number(d), mes = Number(m), anio = Number(a);
  if (!dia || !mes || !anio || String(anio).length !== 4) return null;

  const iso = `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  // El 31 de febrero se escribe pero no existe: JavaScript lo corre al 3 de
  // marzo en silencio. Se compara contra lo pedido para cazarlo.
  const prueba = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(prueba.getTime()) || prueba.getDate() !== dia || prueba.getMonth() + 1 !== mes) return null;
  return iso;
};

const CampoFecha = ({ label, value, min, max, onChange }) => {
  const [texto, setTexto] = useState(() => aTexto(value));
  const [aviso, setAviso] = useState('');
  const nativo = useRef(null);

  // Si la fecha cambia desde afuera —un preset, el calendario, el otro extremo
  // del rango— el texto tiene que seguirla. Sin esto, apretar «Este mes» dejaba
  // el número viejo escrito mientras la consulta ya pedía otro período: la
  // pantalla mostrando una fecha y el filtro aplicando otra.
  useEffect(() => { setTexto(aTexto(value)); setAviso(''); }, [value]);

  const confirmar = () => {
    const iso = aISO(texto);
    // Se vuelve SIEMPRE a la última fecha válida cuando no se entiende. En
    // contabilidad el texto en pantalla y el filtro aplicado no pueden decir
    // cosas distintas: de ahí salen los «pero si yo puse enero».
    if (!iso) {
      setTexto(aTexto(value));
      setAviso(texto.trim() ? 'No se entendió la fecha' : '');
      return;
    }
    if (min && iso < min)  { setTexto(aTexto(value)); setAviso(`No puede ser antes del ${aTexto(min)}`); return; }
    if (max && iso > max)  { setTexto(aTexto(value)); setAviso(`No puede ser después del ${aTexto(max)}`); return; }
    setAviso('');
    if (iso !== value) onChange(iso);
  };

  // El calendario del navegador. Se abre con `showPicker()` donde existe y, si
  // no, con el input nativo transparente encima del ícono — que funciona en
  // todos lados y es el que de verdad sostiene esto.
  const abrirCalendario = () => {
    try { nativo.current?.showPicker?.(); } catch { /* el input transparente ya recibió el clic */ }
  };

  return (
    <div className="group relative flex flex-col">
      <span className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-400 group-focus-within:text-blue-600 transition-colors mb-0.5">
        {label}
      </span>
      <div className="flex items-center gap-1">
        <input
          type="text" inputMode="numeric" value={texto} placeholder="dd-mm-aaaa"
          onChange={e => { setTexto(e.target.value); if (aviso) setAviso(''); }}
          onBlur={confirmar}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmar(); e.currentTarget.blur(); } }}
          aria-label={`${label} (se puede escribir)`}
          className={`bg-transparent text-[13px] font-bold focus:outline-none w-[92px] tracking-tight tabular-nums ${
            aviso ? 'text-red-600' : 'text-slate-700'}`}
        />
        {/* El ícono con el input nativo transparente encima: un solo blanco
            para el clic, sin depender de showPicker(). */}
        <span className="relative inline-flex items-center justify-center h-6 w-6 rounded-md text-slate-300 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
              onClick={abrirCalendario} title="Elegir en el calendario">
          <CalendarRange className="h-3.5 w-3.5 pointer-events-none" />
          <input
            ref={nativo} type="date" value={value || ''} min={min} max={max}
            onChange={e => e.target.value && onChange(e.target.value)}
            tabIndex={-1} aria-hidden="true"
            className="absolute inset-0 opacity-0 cursor-pointer [color-scheme:light]"
          />
        </span>
      </div>
      {aviso && (
        <span className="absolute top-full left-0 mt-0.5 text-[8px] font-bold text-red-600 whitespace-nowrap z-10">
          {aviso}
        </span>
      )}
    </div>
  );
};

export { aTexto, aISO };
export default CampoFecha;
