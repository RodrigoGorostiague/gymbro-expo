-- A separate campaign preserves prior release gifts and credits this gift once per account.
insert into public.release_announcements(version, release_sequence, title, message, features, fixes, reward_gems)
values (
  '0.8.1',
  11,
  'Más claridad para entrenar y seguir tu progreso',
  'Seguimos mejorando GymBro con tu ayuda: nuevas guías, rangos musculares y correcciones de uso. Te regalamos 250 gemas por acompañarnos en la beta.',
  '["Guía opcional para preparar tu primera rutina, registrar un entrenamiento y revisar el resultado.", "Nueva sección Más → Cómo usar GymBro, con ayuda sobre rutinas, series, entrenamientos, resultados y mesociclos.", "Mapa Ranked con rangos por músculo, progreso de constancia y gemas por ascensos, con opción de pausar el seguimiento.", "Detalle del progreso muscular al finalizar el entrenamiento y selector entre mapas de volumen y rangos.", "Vista previa del mapa muscular antes de iniciar una rutina.", "250 gemas de regalo por cuenta. ¡Gracias por seguir acompañándonos durante la beta!"]'::jsonb,
  '["El selector de ejercicios respeta los grupos musculares de la rutina y reconoce sus subgrupos al filtrar.", "La silueta del mapa muscular se adapta a los datos de tu perfil y se mantiene consistente entre pantallas.", "La ayuda conserva los campos del editor y solo ofrece iniciar desde una rutina guardada y válida.", "Mejoramos el espacio de las bibliotecas y la configuración del entrenamiento en pantallas pequeñas, el contraste y el foco de la ayuda.", "El resumen espera a que cargue el historial de la cuenta actual para evitar mostrar datos de la sesión anterior.", "Las preferencias de la guía se guardan por cuenta; las respuestas tardías no cambian la guía de otro usuario."]'::jsonb,
  250
);

insert into public.release_reward_campaigns(version, gem_amount, idempotency_key)
values ('0.8.1', 250, 'release:0.8.1:250-gems');
