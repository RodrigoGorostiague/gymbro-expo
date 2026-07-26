export const SET_ENCOURAGEMENT_MESSAGES = [
  'Vamos, amor. Tú puedes',
  'Una repetición más. Puedes hacerlo',
  'Mira todo lo que estoy comiendo',
];

export function getRandomSetEncouragementMessage(): string {
  const index = Math.floor(Math.random() * SET_ENCOURAGEMENT_MESSAGES.length);
  return SET_ENCOURAGEMENT_MESSAGES[index];
}
