insert into public.release_announcements(version, release_sequence, title, message, features, fixes, reward_gems)
values (
  '0.6.0',
  8,
  'Entrená acompañado, hablá en el momento',
  'Los entrenamientos conjuntos ahora conectan mejor al equipo y mantienen cada sesión más estable.',
  '["Chat en vivo dentro de entrenamientos conjuntos.", "Menciones privadas con @ para hablar con una persona del equipo.", "Mensajes públicos para coordinar a todos los participantes.", "Nuevo selector de tipo de serie: calentamiento, efectiva o al fallo."]',
  '["La edición de peso y repeticiones ya no interrumpe la sesión ni guarda por cada tecla.", "Evitamos que el loader global tape la ejecución durante guardados de series.", "Mejoramos la disponibilidad y los estados del equipo durante el entrenamiento conjunto.", "Los participantes pueden volver a ver su publicación conjunta al terminar."]',
  100
);

insert into public.release_reward_campaigns(version, gem_amount, idempotency_key)
values ('0.6.0', 100, 'release:0.6.0:100-gems');
