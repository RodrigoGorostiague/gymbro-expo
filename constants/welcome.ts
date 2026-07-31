export const BRISAS_WELCOME_MESSAGES = [
  'Vamos, mi amor. ¡Tú puedes!',
  'Amor, te amo cada día un poco más',
  'Sea lo que sea que lleves puesto, te ves hermosa 🐺',
];

export function getRandomWelcomeMessage(): string {
  const index = Math.floor(Math.random() * BRISAS_WELCOME_MESSAGES.length);
  return BRISAS_WELCOME_MESSAGES[index];
}
