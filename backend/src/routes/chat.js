import { Router } from 'express';
import OpenAI from 'openai';
import { SYSTEM_PROMPT, MAX_MESSAGE_LENGTH, HISTORY_LIMIT } from '../prompt.js';

// Routes de chat. La persistance est déléguée à `store` (Supabase ou mémoire, voir src/store.js).
export function createChatRouter({ config, store }) {
  const router = Router();
  const openai = new OpenAI({ apiKey: config.openaiApiKey });

  // POST /api/chat  { conversationId?: string, message: string }
  router.post('/', async (req, res) => {
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!message) {
      return res.status(400).json({ error: 'Message requis' });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ error: `Message trop long (max ${MAX_MESSAGE_LENGTH} caractères)` });
    }

    const userId = req.user.id;
    const conversationId = req.body.conversationId || (await store.createConversation(userId));

    try {
      const history = await store.recentMessages(conversationId, userId, HISTORY_LIMIT);
      await store.saveMessage({ conversationId, userId, role: 'user', content: message });

      const completion = await openai.chat.completions.create({
        model: config.openaiModel,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...history,
          { role: 'user', content: message },
        ],
        temperature: 0.4,
        max_tokens: 800,
      });

      const answer = completion.choices[0]?.message?.content ?? '';
      await store.saveMessage({ conversationId, userId, role: 'assistant', content: answer });

      return res.json({ conversationId, answer });
    } catch (err) {
      console.error('[chat] erreur :', err?.message ?? err);
      return res.status(502).json({ error: "Le service IA est indisponible, réessayez plus tard" });
    }
  });

  return router;
}
