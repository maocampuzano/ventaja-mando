import type { ReactNode } from "react";

const trazos: Record<string, ReactNode> = {
  hoy: <><path d="M4 11l8-7 8 7" /><path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" /><path d="M9.5 14.5l2 2 3.5-4" /></>,
  sala: <><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></>,
  claro: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" /></>,
  ajustes: <><path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="17" cy="17" r="2" /></>,
  mando: <><path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z" /><path d="M9 3v15M15 6v15" /></>,
  resumen: <><rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="5" rx="2" /><rect x="13" y="10" width="8" height="11" rx="2" /><rect x="3" y="13" width="8" height="8" rx="2" /></>,
  lideres: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /><circle cx="17" cy="9" r="2.4" /><path d="M16 14.6c2.7.2 5 2 5 5.4" /></>,
  planillas: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  diae: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /><path d="M8 14l2.5 2.5L16 12" /></>,
  equipo: <><circle cx="8" cy="8" r="3" /><circle cx="16" cy="8" r="3" /><path d="M2.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" /><path d="M14.5 14.2c3 .1 7 1.6 7 4.8" /></>,
  formularios: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h3M8 12h3M8 16h3" /><path d="M14 8l1.5 1.5L18 7M14 12h4M14 16h4" /></>,
  importar: <><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></>,
  datos: <><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" /><path d="M9 12l2 2 4-4" /></>,
  mensajes: <><path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" /><path d="M8 10h8M8 13h5" /></>,
  llamadas: <><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" /></>,
  finanzas: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18" /><path d="M7 15h3" /><circle cx="16" cy="15" r="1.5" /></>,
  movil: <><rect x="7" y="2" width="10" height="20" rx="2.5" /><path d="M11 18h2" /></>,
};

// Logo de Comando: una C hecha con un hexágono abierto (las zonas del mapa) y un punto en el centro (el puesto de
// mando). Dibujo generado con Magnific el 12/11/2026; el original está en entregas/logo.
const LOGO_HEXAGONO = "M 1020 549 C 1027 549 1036 550 1042 553 C 1059 562 1077 573 1094 584 L 1186 639 C 1265 687 1349 735 1426 785 L 1350 833 C 1333 843 1311 858 1293 865 C 1286 868 1271 867 1264 863 C 1183 818 1104 766 1023 720 C 1011 728 997 735 985 743 C 915 786 842 827 773 871 C 772 971 773 1076 773 1177 C 809 1198 846 1221 882 1242 C 930 1271 977 1299 1024 1328 C 1088 1290 1156 1248 1221 1209 C 1232 1202 1257 1185 1269 1182 C 1278 1180 1287 1180 1295 1183 C 1307 1187 1329 1203 1341 1210 C 1369 1227 1398 1247 1427 1264 C 1417 1271 1392 1285 1381 1292 L 1291 1346 L 1137 1439 C 1109 1455 1081 1472 1053 1489 C 1039 1497 1023 1502 1008 1495 C 993 1488 976 1477 961 1468 L 865 1410 L 717 1321 L 667 1292 C 641 1276 622 1267 623 1232 C 623 1218 623 1203 623 1189 L 623 1060 L 623 892 C 623 863 622 834 623 805 C 624 793 634 778 644 772 C 667 757 690 744 713 730 L 837 655 L 940 592 C 961 579 983 566 1004 554 C 1009 551 1014 550 1020 549 z";
const LOGO_PUNTO = "M 1014 915 C 1074 910 1127 955 1133 1015 C 1138 1075 1093 1128 1033 1133 C 973 1138 920 1093 915 1033 C 910 973 954 920 1014 915 z";

export function Logo({ lado = 26 }: { lado?: number }) {
  return (
    <svg viewBox="505 503 1040 1040" width={lado} height={lado} fill="currentColor" aria-hidden="true">
      <path d={LOGO_HEXAGONO} /><path d={LOGO_PUNTO} />
    </svg>
  );
}

export function Icono({ n }: { n: keyof typeof trazos }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {trazos[n]}
    </svg>
  );
}

export function Barra({ valor, color }: { valor: number; color?: string }) {
  return (
    <div className="barra-h" aria-hidden="true">
      <span style={{ width: `${Math.max(0, Math.min(1, valor)) * 100}%`, background: color }} />
    </div>
  );
}

/** `eleccion` en aaaa-mm-dd. Sin fecha configurada devuelve 0. */
export function diasParaEleccion(eleccion: string) {
  if (!eleccion) return 0;
  const e = new Date(`${eleccion}T00:00:00-05:00`);
  return Math.max(0, Math.ceil((e.getTime() - Date.now()) / 86400000));
}

export const colorIndice = (x: number) => (x >= 0.7 ? "var(--verde)" : x >= 0.5 ? "var(--ambar)" : "var(--rojo)");
export const claseIndice = (x: number) => (x >= 0.7 ? "verde" : x >= 0.5 ? "ambar" : "rojo");
