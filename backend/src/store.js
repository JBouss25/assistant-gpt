import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

// Interface de stockage des conversations.
//  - Supabase si SUPABASE_URL et SUPABASE_SERVICE_KEY sont définis (production).
//  - Sinon, mémoire du processus (développement ; perdue au redémarrage).
// Toutes les méthodes filtrent par userId : un élève ne lit que ses propres messages.

export function createStore(config) {
  if (config.supabaseUrl && config.supabaseServiceKey) {
    return supabaseStore(createClient(config.supabaseUrl, config.supabaseServiceKey));
  }
  console.warn('[store] Supabase non configuré : messages conservés en mémoire uniquement.');
  return memoryStore();
}

function supabaseStore(supabase) {
  return {
    async createConversation(userId) {
      const { data, error } = await supabase
        .from('conversations')
        .insert({ user_id: userId })
        .select('id')
        .single();
      if (error) throw error;
      return data.id;
    },

    async recentMessages(conversationId, userId, limit) {
      const { data, error } = await supabase
        .from('messages')
        .select('role, content')
        .eq('conversation_id', conversationId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data.reverse();
    },

    async saveMessage({ conversationId, userId, role, content }) {
      const { error } = await supabase
        .from('messages')
        .insert({ conversation_id: conversationId, user_id: userId, role, content });
      if (error) throw error;
    },
  };
}

function memoryStore() {
  const conversations = new Map(); // conversationId -> { userId, messages[] }

  return {
    async createConversation(userId) {
      const id = randomUUID();
      conversations.set(id, { userId, messages: [] });
      return id;
    },

    async recentMessages(conversationId, userId, limit) {
      const conv = conversations.get(conversationId);
      if (!conv || conv.userId !== userId) return [];
      return conv.messages.slice(-limit).map(({ role, content }) => ({ role, content }));
    },

    async saveMessage({ conversationId, userId, role, content }) {
      const conv = conversations.get(conversationId);
      if (!conv || conv.userId !== userId) {
        throw new Error('Conversation inconnue pour cet utilisateur');
      }
      conv.messages.push({ role, content });
    },
  };
}
