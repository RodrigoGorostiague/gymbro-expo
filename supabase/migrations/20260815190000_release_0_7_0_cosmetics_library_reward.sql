insert into public.release_announcements(version, release_sequence, title, message, features, fixes, reward_gems)
values (
  '0.7.0',
  9,
  'Tu biblioteca y tu estilo, mejor conectados',
  'Organizá mejor tus planes compartidos y disfrutá los cosméticos con una carga más ágil.',
  '["Biblioteca de rutinas separada entre propias y compartidas.", "Los planes compartidos conservan su procedencia al aceptarlos.", "Avatares, marcos y títulos se cargan desde un catálogo remoto optimizado.", "Las publicaciones de entrenamientos conjuntos se ordenan por su actividad más reciente."]',
  '["Mejoramos la persistencia de datos al finalizar entrenamientos conjuntos.", "La finalización conjunta vuelve a publicar correctamente sus hitos de comunidad.", "Corregimos el seguimiento de actividad en publicaciones de entrenamientos conjuntos."]',
  75
);

insert into public.release_reward_campaigns(version, gem_amount, idempotency_key)
values ('0.7.0', 75, 'release:0.7.0:75-gems');
