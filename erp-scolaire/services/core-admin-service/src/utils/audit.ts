import type { FastifyInstance, FastifyRequest } from 'fastify'

export type AuditAction =
  | 'ELEVE_CREE' | 'ELEVE_MODIFIE' | 'ELEVE_SUPPRIME'
  | 'ENSEIGNANT_CREE' | 'ENSEIGNANT_MODIFIE'
  | 'INSCRIPTION_CREEE' | 'INSCRIPTION_ANNULEE'
  | 'CLASSE_CREEE' | 'ECOLE_CREEE' | 'ECOLE_MODIFIEE'

export async function writeAuditLog(
  app: FastifyInstance,
  req: FastifyRequest,
  params: {
    action: AuditAction
    entiteType: string
    entiteId: string
    valeurAvant?: unknown
    valeurApres?: unknown
  },
) {
  const schoolId = req.headers['x-school-id'] as string | undefined
  const userId = req.jwtPayload?.sub

  try {
    await app.db`
      INSERT INTO audit_logs
        (school_id, user_id, action, entite_type, entite_id, valeur_avant, valeur_apres, ip_address, user_agent)
      VALUES (
        ${schoolId ?? null},
        ${userId ?? null},
        ${params.action},
        ${params.entiteType},
        ${params.entiteId},
        ${params.valeurAvant ? JSON.stringify(params.valeurAvant) : null},
        ${params.valeurApres ? JSON.stringify(params.valeurApres) : null},
        ${req.ip ?? null},
        ${req.headers['user-agent'] ?? null}
      )
    `
  } catch (err) {
    // L'audit ne doit jamais faire échouer l'opération principale
    app.log.warn({ err, action: params.action }, 'Failed to write audit log')
  }
}
