import jwt from 'jsonwebtoken';

// Vérifie le JWT émis par Moodle (SSO) dans l'en-tête Authorization: Bearer <token>.
// Le claim `sub` identifie l'élève et sert de user_id.
export function requireAuth(jwtSecret) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'Authentification requise' });
    }

    try {
      const payload = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
      if (!payload.sub) {
        return res.status(401).json({ error: 'Jeton invalide' });
      }
      req.user = { id: String(payload.sub), name: payload.name ?? null };
      return next();
    } catch {
      return res.status(401).json({ error: 'Jeton invalide ou expiré' });
    }
  };
}
