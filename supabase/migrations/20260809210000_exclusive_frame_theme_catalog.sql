-- Frame themes are separate cosmetics; reused IDs retain their prior owners and prices.
insert into public.reward_theme_catalog(theme_id, price) values
  ('boca', 700), ('river', 850), ('snowflake', 1200), ('aurora', 340), ('prisma', 760), ('red', 1500), ('cyberpunk', 650),
  ('frame-campeon-indiscutible', 1800), ('frame-heavy-duty', 1900), ('frame-alfa', 2000), ('frame-celtic-spirit', 2100), ('frame-hierro-fe-disciplina', 2200), ('frame-yo-soy-el-huno', 2300), ('frame-spqr', 2400), ('frame-fuerza-rinoceronte', 2500), ('frame-fuerza-pantera', 2600), ('frame-ruby-fit', 2700), ('frame-valhalla-training', 2800), ('frame-holy-fit', 2900), ('frame-medjay-core', 3000), ('frame-fuerza-cocodrilo', 3100), ('frame-fuerza-gorila', 3200), ('frame-elegante-sport', 3300), ('frame-banzai', 3400), ('frame-neon-gym', 3500), ('frame-fuerza-elefante', 3500), ('frame-this-is-sparta', 3500), ('frame-fuerza-tigre', 3500)
on conflict (theme_id) do update set price = excluded.price;
