import { FormEvent, useEffect, useRef, useState } from 'react';
import { sendMessage } from './api';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// Le jeton JWT est transmis par Moodle dans l'URL : ?token=...
// Il est lu une fois au chargement et gardé en mémoire React (pas de localStorage).
// Limite connue : il reste visible dans l'URL et l'historique ; Moodle doit donc
// émettre un jeton de courte durée (ex. 1 h) et l'app peut le retirer de l'URL via
// history.replaceState si besoin.
function readTokenFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get('token');
}

export default function App() {
  const [token] = useState<string | null>(readTokenFromUrl);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || !token || pending) return;

    setInput('');
    setError(null);
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setPending(true);

    try {
      const reply = await sendMessage(token, text, conversationId);
      setConversationId(reply.conversationId);
      setMessages((prev) => [...prev, { role: 'assistant', content: reply.answer }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setPending(false);
    }
  }

  if (!token) {
    return (
      <main className="page">
        <h1>Assistant IA Physique-Chimie</h1>
        <p className="notice">
          Accès réservé aux élèves connectés depuis Moodle. Ouvrez l'assistant depuis votre cours.
        </p>
      </main>
    );
  }

  return (
    <main className="page">
      <h1>Assistant IA Physique-Chimie</h1>
      <p className="hint">Je te guide par des questions : je ne donne pas directement les corrigés.</p>

      <section className="chat" aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.content}
          </div>
        ))}
        {pending && <div className="bubble assistant muted">Réflexion...</div>}
        <div ref={endRef} />
      </section>

      {error && <p className="error" role="alert">{error}</p>}

      <form className="composer" onSubmit={onSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Pose ta question de physique-chimie..."
          maxLength={2000}
          disabled={pending}
          aria-label="Question"
        />
        <button type="submit" disabled={pending || !input.trim()}>
          Envoyer
        </button>
      </form>
    </main>
  );
}
