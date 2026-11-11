import type { Page } from "@playwright/test";

// El menú va por secciones (Hoy, Mi gente, Contactar, Cuentas, Día E, Cumplimiento) y, dentro de cada una, pestañas.
const seccionDe: Record<string, string> = {
  "Mapa y asesor": "Hoy",
  Líderes: "Mi gente", Equipo: "Mi gente", Importar: "Mi gente", Formularios: "Mi gente", Planillas: "Mi gente",
  Mensajes: "Contactar", Llamadas: "Contactar",
};

export const menu = (page: Page) => page.getByRole("navigation", { name: "Secciones" });
export const boton = (page: Page, nombre: string) => page.getByRole("navigation").getByRole("button", { name: nombre, exact: true });

/** Abre una pantalla por su nombre: primero su sección y, si la sección tiene varias pantallas, su pestaña. */
export async function irA(page: Page, pantalla: string) {
  const seccion = seccionDe[pantalla];
  if (!seccion) { await menu(page).getByRole("button", { name: pantalla, exact: true }).click(); return; }
  await menu(page).getByRole("button", { name: seccion, exact: true }).click();
  const pestana = page.getByRole("navigation", { name: `Dentro de ${seccion}` }).getByRole("button", { name: pantalla, exact: true });
  // Si el rol solo ve una pantalla de la sección, no hay pestañas: ya está en ella.
  if (await pestana.count()) await pestana.click();
}
