import 'dotenv/config';

const required = ['OPENAI_API_KEY', 'JWT_SECRET'];

export function loadConfig(env = process.env) {
  const missing = required.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(`Variables d'environnement manquantes : ${missing.join(', ')}`);
  }
  if (env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET doit faire au moins 32 caractères (openssl rand -base64 32)');
  }

  return {
    port: Number(env.PORT || 3001),
    openaiApiKey: env.OPENAI_API_KEY,
    openaiModel: env.OPENAI_MODEL || 'gpt-4o-mini',
    jwtSecret: env.JWT_SECRET,
    corsOrigins: (env.CORS_WHITELIST || '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    // Supabase est optionnel : sans ces variables, les messages ne sont pas persistés.
    supabaseUrl: env.SUPABASE_URL || null,
    supabaseServiceKey: env.SUPABASE_SERVICE_KEY || null,
    rateLimitWindowMs: Number(env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
    rateLimitMax: Number(env.RATE_LIMIT_MAX_REQUESTS || 100),
  };
}
