// Código QR generado en el navegador: el enlace no pasa por ningún servicio externo.
import qrcode from "qrcode-generator";
import { useMemo } from "react";

export function Qr({ texto, etiqueta }: { texto: string; etiqueta: string }) {
  const src = useMemo(() => {
    const q = qrcode(0, "M");
    q.addData(texto);
    q.make();
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(q.createSvgTag({ cellSize: 5, margin: 2, scalable: true }))}`;
  }, [texto]);
  return <img className="qr-2fa" src={src} alt={etiqueta} width={200} height={200} />;
}
