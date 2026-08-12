insert into public.release_announcements(version, release_sequence, title, message, features, fixes, reward_gems)
values (
  '0.5.1',
  7,
  'Entrenamientos más confiables',
  'Mejoramos la continuidad de tus sesiones y la coordinación cuando entrenás acompañado.',
  '["Mensajes de ánimo y apoyo dentro de entrenamientos conjuntos."]',
  '["Cerramos automáticamente tu presencia al finalizar un entrenamiento.", "Evitamos que un borrador atrasado restaure una sesión ya finalizada.", "Mejoramos la recuperación y navegación de entrenamientos activos.", "Hicimos más claros los estados, descansos y avisos de entrenamientos conjuntos.", "Evitamos destellos visuales mientras se carga el tema de la app."]',
  50
);

insert into public.release_reward_campaigns(version, gem_amount, idempotency_key)
values ('0.5.1', 50, 'release:0.5.1:50-gems');
