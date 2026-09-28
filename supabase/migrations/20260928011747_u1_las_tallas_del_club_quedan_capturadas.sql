-- Las tallas que el club vende, capturadas de una vez.
--
-- Los ocho productos activos tenían sizes en [] desde la migración, así que
-- la talla se tecleaba a mano en cada pedido. Eso explica por qué en los
-- pedidos reales conviven "12", "Mediana" y "Universal": nadie escribía
-- igual dos veces, y una hoja de producción con tres formas de decir lo
-- mismo obliga al proveedor a adivinar.
--
-- Escala confirmada por Presidencia el 28 de septiembre de 2026:
--   Niños   6, 8, 10, 12, 14, 16
--   Adultos XS, S, M, L, XL, XXL
--
-- Van en ese orden a propósito: es un club de formativas, así que la talla
-- que más se pide queda primero y no hay que bajar la lista para encontrarla.
--
-- Las calcetas se quedan en "Universal", que es lo que el club ya venía
-- usando en sus pedidos reales. Si resulta que sí las manejan por talla, es
-- cambiar un renglón.
--
-- Sólo se toca la columna sizes. Precio, costo y todo lo demás quedan como
-- están: una tabla de tallas no tiene por qué poder mover lo que se cobra.
update app.products
set sizes = case
    when category ilike '%sock%' or category ilike '%calceta%'
      then '["Universal"]'::jsonb
    else '["6","8","10","12","14","16","XS","S","M","L","XL","XXL"]'::jsonb
  end,
  updated_at = now()
where organization_id = '3776f3a6-8c3d-4f46-bd03-5f1e59deb6f8'
  and active = true
  and archived_at is null
  -- Idempotente: si alguien ya las capturó a mano, no se las pisamos.
  and coalesce(jsonb_array_length(sizes), 0) = 0;
