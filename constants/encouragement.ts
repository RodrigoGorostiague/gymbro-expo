export const SET_ENCOURAGEMENT_MESSAGES = [
  'Vamos amor, tu puedes',
  'Una mas podias',
  'Mira todo lo q me estoy comiendo',
];

export function getRandomSetEncouragementMessage(): string {
  const index = Math.floor(Math.random() * SET_ENCOURAGEMENT_MESSAGES.length);
  return SET_ENCOURAGEMENT_MESSAGES[index];
}
