// Appels à l'API. En production, VITE_API_URL pointe vers https://api.iaoosted.oostudy.ma ;
// en développement, vide : le proxy Vite relaie /api vers localhost:3001.
const BASE_URL = import.meta.env.VITE_API_URL ?? '';

export interface ChatReply {
  conversationId: string;
  answer: string;
}

export async function sendMessage(
  token: string,
  message: string,
  conversationId: string | null,
): Promise<ChatReply> {
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ message, conversationId: conversationId ?? undefined }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error ?? `Erreur ${res.status}`);
  }
  return body as ChatReply;
}
