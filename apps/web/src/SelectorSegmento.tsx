// A quién va un envío o una cola de llamadas: zonas, líderes y estado del contacto. Nunca opinión política (regla 2).
import type { SegmentoEnvio } from "@ventaja/nucleo";
import { useTablero } from "./datos/contexto";

const ESTADOS_CONTACTO = [
  { id: "sin_contactar", nombre: "Sin contactar" }, { id: "contactado", nombre: "Contactados" },
  { id: "validado", nombre: "Validados" }, { id: "comprometido", nombre: "Comprometidos" },
] as const;
const alternar = <T,>(lista: readonly T[], x: T) => (lista.includes(x) ? lista.filter((y) => y !== x) : [...lista, x]);

export function SelectorSegmento({ segmento, alCambiar }: { segmento: SegmentoEnvio; alCambiar: (s: SegmentoEnvio) => void }) {
  const { zonas, lideres } = useTablero();
  const zonasSel = segmento.territorioIds ?? [];
  const lideresSel = segmento.liderIds ?? [];
  const estados = segmento.estados ?? [];
  const lideresVisibles = zonasSel.length ? lideres.filter((l) => zonasSel.includes(l.zonaId)) : lideres;
  return (
    <fieldset className="campo-formulario">
      <legend>A quién (vacío = toda su campaña)</legend>
      <span className="etiqueta">Zonas</span>
      <div className="fila" style={{ gap: 10, flexWrap: "wrap" }}>
        {zonas.map((z) => (
          <label key={z.id} className="fila" style={{ gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={zonasSel.includes(z.id)} onChange={() => alCambiar({ ...segmento, territorioIds: alternar(zonasSel, z.id) })} />{z.nombre}
          </label>
        ))}
      </div>
      <label className="campo">Líderes
        <select multiple size={Math.min(6, lideresVisibles.length || 1)} value={lideresSel} aria-label="Líderes"
          onChange={(e) => alCambiar({ ...segmento, liderIds: [...e.target.selectedOptions].map((o) => o.value) })}>
          {lideresVisibles.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
        </select>
      </label>
      <span className="etiqueta">Para elegir varios líderes, mantenga oprimida la tecla Ctrl (o Cmd en Mac) al hacer clic.</span>
      <span className="etiqueta">Estado del contacto</span>
      <div className="fila" style={{ gap: 10, flexWrap: "wrap" }}>
        {ESTADOS_CONTACTO.map((x) => (
          <label key={x.id} className="fila" style={{ gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={estados.includes(x.id)} onChange={() => alCambiar({ ...segmento, estados: alternar(estados, x.id) })} />{x.nombre}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
