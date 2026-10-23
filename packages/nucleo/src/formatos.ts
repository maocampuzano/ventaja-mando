// Formatos de Colombia: miles con punto, moneda «$ 1.250.000» y fechas dd/mm/aaaa en America/Bogota.

export const pct = (x: number) => `${Math.round(x * 100)} %`;
export const miles = (n: number) => n.toLocaleString("es-CO");

export const moneda = (pesos: number) => {
  const valor = Math.round(pesos);
  return `${valor < 0 ? "-" : ""}$ ${miles(Math.abs(valor))}`;
};

const formatoFecha = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

// Una fecha sin hora («2027-10-31») es un día del calendario: se muestra tal cual, sin convertir de zona.
export function fecha(valor: Date | string) {
  if (typeof valor === "string") {
    const dia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
    if (dia) return `${dia[3]}/${dia[2]}/${dia[1]}`;
  }
  const d = typeof valor === "string" ? new Date(valor) : valor;
  if (Number.isNaN(d.getTime())) throw new RangeError(`Fecha no válida: ${String(valor)}`);
  return formatoFecha.format(d);
}
