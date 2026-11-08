-- La opción del candidato se reconoce aunque el acta traiga el número del tarjetón delante.
begin;
select plan(5);
select is(privado.normalizar_opcion('01 · Laura Méndez (Partido Demo)'), 'laura mendez (partido demo)', 'Quita «01 · »');
select is(privado.normalizar_opcion('1. LAURA  MÉNDEZ'), 'laura mendez', 'Quita «1. » y espacios de más');
select is(privado.normalizar_opcion('001 - Laura Méndez'), 'laura mendez', 'Quita «001 - »');
select is(privado.normalizar_opcion('Laura Méndez'), 'laura mendez', 'Sin número, igual');
select is(privado.normalizar_opcion('Lista 3 por Turbaco'), 'lista 3 por turbaco', 'Un número en medio del nombre se respeta');
select * from finish();
rollback;
