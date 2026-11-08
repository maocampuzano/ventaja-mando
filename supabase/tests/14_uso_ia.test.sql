-- IA: registro de uso y costo, cupo mensual y quién puede usar Strategos (fase 4).
begin;
select plan(14);

-- El servidor (clave de servicio, aquí el superusuario de la prueba) registra el uso.
insert into public.uso_ia (campana_id, usuario_id, funcion, modelo, tokens_entrada, tokens_salida, costo_usd) values
  ('20000000-0000-4000-8000-00000000000a', pruebas.uid('gerente_a'), 'strategos', 'claude-sonnet-5-5', 3000, 500, 0.011),
  ('20000000-0000-4000-8000-00000000000a', pruebas.uid('coord_a'), 'strategos', 'claude-sonnet-5-5', 2000, 400, 0.008),
  ('20000000-0000-4000-8000-00000000000a', pruebas.uid('gerente_a'), 'strategos', 'claude-sonnet-5-5', 1000, 100, 0.5),
  ('20000000-0000-4000-8000-00000000000b', pruebas.uid('gerente_b'), 'strategos', 'claude-sonnet-5-5', 1000, 100, 0.004);
-- Uno del mes pasado: no cuenta para el cupo de este mes.
update public.uso_ia set creado_en = now() - interval '40 days' where costo_usd = 0.5;

select pruebas.como('gerente_a', 'aal2');
select is((select count(*) from public.uso_ia)::int, 3, 'La gerencia ve el uso de su campaña');
select is((select costo_usd from public.consumo_ia_mes('20000000-0000-4000-8000-00000000000a')), 0.019::numeric,
  'El consumo del mes suma solo este mes');
select is((select permitido from public.estado_strategos('20000000-0000-4000-8000-00000000000a')), true, 'La gerencia puede usar Strategos');
select is((select cupo_usd from public.estado_strategos('20000000-0000-4000-8000-00000000000a')), 10.00::numeric, 'Cupo por defecto mientras no haya uno contratado');
select throws_ok($$ insert into public.uso_ia (campana_id, funcion, modelo) values ('20000000-0000-4000-8000-00000000000a', 'strategos', 'x') $$,
  '42501', null, 'Nadie registra uso desde la API');
select throws_ok($$ insert into public.cupo_ia (campana_id, usd_mes) values ('20000000-0000-4000-8000-00000000000a', 1000) $$,
  '42501', null, 'La campaña no se sube su propio cupo');
reset role;

select pruebas.como('gerente_a');
select is((select permitido from public.estado_strategos('20000000-0000-4000-8000-00000000000a')), false,
  'Sin el segundo factor, la gerencia no usa Strategos');
reset role;

select pruebas.como('coord_a');
select is((select count(*) from public.uso_ia)::int, 0, 'La coordinación no ve el registro de uso');
select is((select permitido from public.estado_strategos('20000000-0000-4000-8000-00000000000a')), true, 'La coordinación usa Strategos (con su alcance)');
select is((select gasto_usd from public.estado_strategos('20000000-0000-4000-8000-00000000000a')), null::numeric, 'Pero no ve el gasto');
select throws_ok($$ select * from public.consumo_ia_mes('20000000-0000-4000-8000-00000000000a') $$, '42501', null, 'Ni el consumo');
select throws_ok($$ select public.gasto_ia_mes_servicio('20000000-0000-4000-8000-00000000000a') $$, '42501', null,
  'La función del servidor no se puede llamar con una sesión normal');
reset role;

select pruebas.como('lider_a1');
select is((select permitido from public.estado_strategos('20000000-0000-4000-8000-00000000000a')), false, 'Un líder no usa Strategos');
reset role;

select pruebas.como('gerente_b', 'aal2');
select is((select count(*) from public.uso_ia where campana_id = '20000000-0000-4000-8000-00000000000a')::int, 0, 'Otra campaña no ve el uso');
reset role;

select * from finish();
rollback;
