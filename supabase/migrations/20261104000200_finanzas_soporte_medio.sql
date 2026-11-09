-- Plantilla de Cuentas Claras: número de la factura o del recibo de cada movimiento y, en la propaganda (código 208,
-- anexo 5.7 B), el medio. El medio es obligatorio en los gastos 208 nuevos.
alter table public.finanza_movimiento
  add column numero_soporte text,
  add column medio text check (medio in ('radio', 'prensa', 'television', 'internet', 'vallas', 'pasacalles', 'impresos', 'otro')),
  add constraint medio_solo_208 check (medio is null or codigo = 208);

create or replace function privado.exigir_medio_208()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.codigo = 208 and new.medio is null then
    raise exception 'Indique el medio de la propaganda (radio, prensa, internet, vallas…).' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function privado.exigir_medio_208() from public, anon, authenticated;
create trigger exigir_medio before insert on public.finanza_movimiento
  for each row execute function privado.exigir_medio_208();

-- registrar_movimiento con los dos datos nuevos (opcionales al final, para no romper a quien la llama con los de antes).
drop function public.registrar_movimiento(uuid, integer, date, numeric, text, text, uuid, text, text, jsonb, text);
create function public.registrar_movimiento(
  p_campana uuid, p_codigo integer, p_fecha date, p_valor numeric, p_concepto text, p_forma text,
  p_tercero uuid, p_parentesco text, p_acta text, p_verificacion jsonb, p_soporte text,
  p_numero_soporte text default null, p_medio text default null
)
returns uuid language plpgsql volatile security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if not coalesce(privado.es_direccion(p_campana), false) then
    raise exception 'Solo la dirección registra movimientos.' using errcode = '42501';
  end if;
  if p_soporte is not null and privado.campana_de_ruta(p_soporte) is distinct from p_campana then
    raise exception 'El soporte no es de esta campaña.' using errcode = '42501';
  end if;
  insert into public.finanza_movimiento (campana_id, tipo, codigo, fecha, valor, concepto, forma, tercero_id, parentesco,
    acta_aprobacion, verificacion_fuentes, soporte_url, numero_soporte, medio, creado_por)
  values (p_campana, case when p_codigo < 200 then 'ingreso' else 'gasto' end, p_codigo, p_fecha, p_valor, trim(coalesce(p_concepto, '')),
    coalesce(p_forma, 'dinero'), p_tercero, nullif(trim(p_parentesco), ''), nullif(trim(p_acta), ''), p_verificacion, p_soporte,
    nullif(trim(p_numero_soporte), ''), case when p_codigo = 208 then p_medio end, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.registrar_movimiento(uuid, integer, date, numeric, text, text, uuid, text, text, jsonb, text, text, text) from public, anon;
grant execute on function public.registrar_movimiento(uuid, integer, date, numeric, text, text, uuid, text, text, jsonb, text, text, text) to authenticated;

-- El libro para el contador trae los dos datos nuevos.
create or replace function public.exportar_libro_finanzas(p_campana uuid)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare v_ref text := upper(substr(md5(random()::text), 1, 8)); v_usuario text; v_filas jsonb;
begin
  if not coalesce(privado.es_direccion(p_campana), false) then
    raise exception 'Solo la dirección exporta el libro de finanzas.' using errcode = '42501';
  end if;
  select nombre into v_usuario from public.usuario where id = auth.uid();
  select coalesce(jsonb_agg(jsonb_build_object(
    'fecha', m.fecha, 'tipo', m.tipo, 'codigo', m.codigo, 'concepto', m.concepto, 'forma', m.forma, 'valor', m.valor,
    'tercero', t.nombre, 'tipo_persona', t.tipo_persona,
    'documento', case when t.id is not null then extensions.pgp_sym_decrypt(t.documento_cifrado, privado.secreto('clave_documento')) end,
    'parentesco', m.parentesco, 'acta', m.acta_aprobacion, 'soporte', m.soporte_url is not null,
    'numero_soporte', m.numero_soporte, 'medio', m.medio) order by m.fecha, m.codigo), '[]'::jsonb)
  into v_filas
  from public.finanza_movimiento m left join public.tercero t on t.id = m.tercero_id
  where m.campana_id = p_campana;
  perform privado.auditar(p_campana, 'exportar_libro_finanzas', 'finanza_movimiento', null,
    jsonb_build_object('referencia', v_ref, 'cantidad', jsonb_array_length(v_filas)));
  return jsonb_build_object('referencia', v_ref, 'exportado_por', v_usuario, 'exportado_en', now(), 'filas', v_filas);
end;
$$;
