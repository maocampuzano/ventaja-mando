// Finanzas con el proyecto real. Las reglas de la Ley 1475 las aplica la base al registrar; los soportes van al bucket
// privado «soportes» (<campaña>/<archivo>), que solo la dirección escribe y la candidata puede ver.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FilaLibro } from "@ventaja/nucleo";
import type { FuenteDatos, MovimientoPanel } from "./tipos";

type Metodos = Pick<FuenteDatos, "finanzas" | "configurarTope" | "registrarTercero" | "registrarMovimiento" | "anularMovimiento" | "exportarLibro" | "verSoporte">;
const falla = (e: { message: string } | null) => { if (e) throw new Error(e.message); };

export function finanzasSupabase(sb: SupabaseClient): Metodos {
  return {
    async finanzas(s) {
      const [c, m, t] = await Promise.all([
        sb.from("campana").select("tope_gastos").eq("id", s.campana.id).single(),
        sb.from("finanza_movimiento").select("id, tipo, codigo, fecha, valor, concepto, forma, soporte_url, tercero:tercero_id(id, nombre)")
          .eq("campana_id", s.campana.id).order("fecha", { ascending: false }),
        sb.from("tercero").select("id, nombre, tipo_persona").eq("campana_id", s.campana.id).order("nombre"),
      ]);
      falla(c.error); falla(m.error); falla(t.error);
      return {
        tope: c.data?.tope_gastos ? Number(c.data.tope_gastos) : null,
        movimientos: (m.data ?? []).map((f): MovimientoPanel => {
          const ter = f.tercero as unknown as { id: string; nombre: string } | null;
          return { id: f.id, tipo: f.tipo, codigo: f.codigo, fecha: f.fecha, valor: Number(f.valor), concepto: f.concepto, forma: f.forma,
            terceroId: ter?.id ?? null, tercero: ter?.nombre ?? null, soporte: !!f.soporte_url };
        }),
        terceros: (t.data ?? []).map((x) => ({ id: x.id, nombre: x.nombre, tipoPersona: x.tipo_persona })),
      };
    },
    async configurarTope(s, tope) { falla((await sb.rpc("configurar_tope_gastos", { p_campana: s.campana.id, p_tope: tope })).error); },
    async registrarTercero(s, d) {
      const { data, error } = await sb.rpc("registrar_tercero", { p_campana: s.campana.id, p_tipo: d.tipoPersona, p_nombre: d.nombre, p_documento: d.documento });
      falla(error);
      return data as string;
    },
    async registrarMovimiento(s, d) {
      let ruta: string | null = null;
      if (d.soporte) {
        const ext = (d.soporte.name.split(".").pop() ?? "pdf").toLowerCase().replace(/[^a-z0-9]/g, "");
        ruta = `${s.campana.id}/${crypto.randomUUID()}.${ext}`;
        const { error } = await sb.storage.from("soportes").upload(ruta, d.soporte, { contentType: d.soporte.type });
        if (error) throw new Error("No se pudo subir el soporte (PDF, JPG o PNG de hasta 10 MB).");
      }
      falla((await sb.rpc("registrar_movimiento", {
        p_campana: s.campana.id, p_codigo: d.codigo, p_fecha: d.fecha, p_valor: d.valor, p_concepto: d.concepto, p_forma: d.forma,
        p_tercero: d.terceroId ?? null, p_parentesco: d.parentesco ?? null, p_acta: d.acta ?? null, p_verificacion: d.verificacion ?? null, p_soporte: ruta,
        p_numero_soporte: d.numeroSoporte ?? null, p_medio: d.codigo === 208 ? d.medio ?? null : null,
      })).error);
    },
    async anularMovimiento(_s, id) { falla((await sb.rpc("anular_movimiento", { p_id: id })).error); },
    async exportarLibro(s) {
      const { data, error } = await sb.rpc("exportar_libro_finanzas", { p_campana: s.campana.id });
      falla(error);
      const r = data as { referencia: string; exportado_por: string; exportado_en: string; filas: Record<string, unknown>[] };
      return {
        referencia: r.referencia, exportadoPor: r.exportado_por, exportadoEn: r.exportado_en,
        filas: r.filas.map((f) => ({
          fecha: String(f.fecha), tipo: f.tipo as "ingreso" | "gasto", codigo: Number(f.codigo), concepto: String(f.concepto ?? ""),
          forma: f.forma as "dinero" | "especie", valor: Number(f.valor), tercero: (f.tercero as string) ?? null, tipoPersona: (f.tipo_persona as string) ?? null,
          documento: (f.documento as string) ?? null, parentesco: (f.parentesco as string) ?? null, acta: (f.acta as string) ?? null, soporte: !!f.soporte,
          numeroSoporte: (f.numero_soporte as string) ?? null, medio: (f.medio as FilaLibro["medio"]) ?? null,
        })),
      };
    },
    async verSoporte(_s, id) {
      const { data } = await sb.from("finanza_movimiento").select("soporte_url").eq("id", id).single();
      if (!data?.soporte_url) return null;
      const { data: firmada } = await sb.storage.from("soportes").createSignedUrl(data.soporte_url, 600);
      return firmada?.signedUrl ?? null;
    },
  };
}
