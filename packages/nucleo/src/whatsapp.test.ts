import { describe, expect, it } from "vitest";
import { enlaceWhatsAppManual } from "./whatsapp";

describe("enlaceWhatsAppManual", () => {
  it("arma un enlace wa.me con solo los dígitos del teléfono", () => {
    expect(enlaceWhatsAppManual("+57 300 123 4567", "Hola")).toBe("https://wa.me/573001234567?text=Hola");
  });

  it("codifica tildes, espacios y signos del texto", () => {
    const url = new URL(enlaceWhatsAppManual("+573001234567", "¿Cómo está? Nos vemos el sábado & el domingo"));
    expect(url.searchParams.get("text")).toBe("¿Cómo está? Nos vemos el sábado & el domingo");
  });

  it("solo genera un enlace para que la persona envíe a mano, nunca una API de envío", () => {
    const url = new URL(enlaceWhatsAppManual("+573001234567", "x"));
    expect(url.origin).toBe("https://wa.me");
  });
});
