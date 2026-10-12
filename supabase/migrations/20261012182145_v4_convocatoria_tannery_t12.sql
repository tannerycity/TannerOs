-- Convocatoria de Tannery (Presidencia, 12/10/2026): el puesto llega a T12
-- (las categorías de hoy son Baby Tanner, T6, T10 y T12) y la página habla
-- como el flyer: más club, más razones para venir.
update public.organizations
   set settings = jsonb_set(settings, '{convocatoriaStaff}', coalesce(settings->'convocatoriaStaff', '{}'::jsonb) || jsonb_build_object(
         'intro', 'En Tannery City formamos personas antes que futbolistas. Buscamos formadores con hambre de crecer: aquí trabajas con metodología propia, acompañamiento y un club que invierte en su staff.',
         'puestos', jsonb_build_array('Formador Baby Tanners (3–6 años)', 'Formador Tanners (T6–T12)'),
         'ofrecemos', 'Contrato de 1 año mínimo · Bonos por desempeño · Uniformes oficiales · Capacitación en la Metodología Tannery · Capacitaciones externas · Crecimiento dentro del club'))
 where slug = 'tannery-city-fc';
