export const BRISAS_WELCOME_MESSAGES = [
  'Vamos mi amor mosho, tu puedes!!',
  'Mor mor te amo cada dia un poco mas',
  'Sea lo que sea que tengas puesto estas herrrrmosa!!! 🐺',
];

export function getRandomWelcomeMessage(): string {
  const index = Math.floor(Math.random() * BRISAS_WELCOME_MESSAGES.length);
  return BRISAS_WELCOME_MESSAGES[index];
}
