import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { generateToken, verifyToken, hashToken, generateQRCodeImage, generateQRCodeSVG } from '../services/qrcode.js'

export async function qrcodeRoutes(app: FastifyInstance) {
  // ── POST /qrcode/generate ─────────────────────────────
  // Enseignant génère le QR Code pour sa session
  app.post<{ Body: unknown }>(
    '/qrcode/generate',
    { preHandler: app.requireRole('TEACHER', 'SCHOOL_ADMIN', 'PRINCIPAL') },
    async (req, reply) => {
      const body = z.object({
        emploi_du_temps_id: z.string().uuid(),
        classe_id:          z.string().uuid(),
        date_cours:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        ttl_minutes:        z.number().int().min(10).max(240).default(90),
        format:             z.enum(['png', 'svg']).default('png'),
      }).parse(req.body)

      const schoolId = req.headers['x-school-id'] as string
      if (!schoolId) return reply.status(400).send({ success: false, data: null, error: { code: 'MISSING_SCHOOL', message: 'Header X-School-ID requis', details: null } })

      // Vérifier qu'il n'existe pas déjà un token actif pour cette session
      const existing = await app.db`
        SELECT id, expire_at FROM qr_tokens
        WHERE emploi_du_temps_id = ${body.emploi_du_temps_id}
          AND date_cours = ${body.date_cours}
          AND expire_at > NOW()
        LIMIT 1
      `

      let token: string
      let tokenId: string

      if (existing.length > 0) {
        // Réutiliser le token existant (idempotent)
        tokenId = existing[0]!.id
        // Régénérer le token original n'est pas possible → émettre un nouveau
        token = generateToken({ eid: body.emploi_du_temps_id, cid: body.classe_id, d: body.date_cours, sid: schoolId }, body.ttl_minutes)
        const tokenHash = hashToken(token)
        await app.db`UPDATE qr_tokens SET token_hash = ${tokenHash}, expire_at = NOW() + ${body.ttl_minutes} * INTERVAL '1 minute' WHERE id = ${tokenId}`
      } else {
        token = generateToken({ eid: body.emploi_du_temps_id, cid: body.classe_id, d: body.date_cours, sid: schoolId }, body.ttl_minutes)
        const tokenHash = hashToken(token)

        const [created] = await app.db`
          INSERT INTO qr_tokens
            (school_id, emploi_du_temps_id, classe_id, date_cours, token_hash,
             expire_at, nb_scans_max, cree_par)
          VALUES (
            ${schoolId}, ${body.emploi_du_temps_id}, ${body.classe_id},
            ${body.date_cours}, ${tokenHash},
            NOW() + ${body.ttl_minutes} * INTERVAL '1 minute',
            200, ${req.jwtPayload.sub}
          )
          RETURNING id
        `
        tokenId = created.id
      }

      const image = body.format === 'svg'
        ? await generateQRCodeSVG(token, schoolId)
        : await generateQRCodeImage(token, schoolId)

      return reply.send({
        success: true,
        data: {
          token_id: tokenId,
          qrcode: image,
          format: body.format,
          expire_at: new Date(Date.now() + body.ttl_minutes * 60 * 1000).toISOString(),
          ttl_minutes: body.ttl_minutes,
        },
        meta: null,
        error: null,
      })
    },
  )

  // ── POST /qrcode/scan ─────────────────────────────────
  // Élève scanne le QR Code → enregistrement de la présence
  app.post<{ Body: unknown }>(
    '/qrcode/scan',
    { preHandler: app.requireRole('STUDENT') },
    async (req, reply) => {
      const { token } = z.object({ token: z.string().min(10) }).parse(req.body)

      const payload = verifyToken(token)
      if (!payload) {
        return reply.status(401).send({
          success: false, data: null,
          error: { code: 'INVALID_TOKEN', message: 'QR Code invalide ou expiré', details: null },
        })
      }

      const tokenHash = hashToken(token)
      const eleveId = req.jwtPayload.sub

      // Vérifier que le token existe en BDD et n'est pas épuisé
      const [qrToken] = await app.db`
        SELECT id, nb_scans, nb_scans_max, expire_at
        FROM qr_tokens
        WHERE token_hash = ${tokenHash} AND expire_at > NOW()
        FOR UPDATE
      `

      if (!qrToken) {
        return reply.status(401).send({
          success: false, data: null,
          error: { code: 'TOKEN_NOT_FOUND', message: 'QR Code introuvable ou expiré', details: null },
        })
      }

      if (qrToken.nb_scans >= qrToken.nb_scans_max) {
        return reply.status(429).send({
          success: false, data: null,
          error: { code: 'TOKEN_EXHAUSTED', message: 'Nombre maximum de scans atteint', details: null },
        })
      }

      // Vérifier si l'élève a déjà scanné ce token
      const [alreadyScanned] = await app.db`
        SELECT id FROM qr_scans WHERE token_id = ${qrToken.id} AND eleve_id = ${eleveId}
      `

      if (alreadyScanned) {
        return reply.status(409).send({
          success: false, data: null,
          error: { code: 'ALREADY_SCANNED', message: 'Présence déjà enregistrée pour ce cours', details: null },
        })
      }

      // Calculer le retard éventuel (si le scan est après l'heure de début + 10 min)
      const minutesRetard = await computeRetard(payload.eid, app)

      // Enregistrer le scan et mettre à jour le compteur dans une transaction
      await app.db.begin(async (trx) => {
        await trx`
          INSERT INTO qr_scans (token_id, eleve_id, ip_address, user_agent)
          VALUES (${qrToken.id}, ${eleveId}, ${req.ip ?? null}, ${req.headers['user-agent'] ?? null})
        `
        await trx`
          UPDATE qr_tokens SET nb_scans = nb_scans + 1 WHERE id = ${qrToken.id}
        `
        // Si retard > 0 : créer un enregistrement de retard
        if (minutesRetard > 0) {
          await trx`
            INSERT INTO absences
              (school_id, eleve_id, emploi_du_temps_id, classe_id, matiere_id, enseignant_id,
               date, type, minutes_retard, saisi_par, methode_pointage, notif_parent_statut)
            SELECT
              qt.school_id, ${eleveId}, qt.emploi_du_temps_id, qt.classe_id,
              e.matiere_id, e.enseignant_id,
              qt.date_cours, 'RETARD', ${minutesRetard}, ${eleveId}, 'QR_CODE', 'EN_ATTENTE'
            FROM qr_tokens qt
            JOIN emplois_du_temps e ON e.id = qt.emploi_du_temps_id
            WHERE qt.id = ${qrToken.id}
          `
        }
      })

      return reply.send({
        success: true,
        data: {
          message: minutesRetard > 0 ? `Présence enregistrée — retard de ${minutesRetard} minutes` : 'Présence enregistrée',
          retard_minutes: minutesRetard,
        },
        meta: null,
        error: null,
      })
    },
  )
}

async function computeRetard(edtId: string, app: FastifyInstance): Promise<number> {
  try {
    const [session] = await app.db`
      SELECT c.heure_debut
      FROM emplois_du_temps e
      JOIN creneaux c ON c.id = e.creneau_id
      WHERE e.id = ${edtId}
    `
    if (!session?.heure_debut) return 0

    const [heureStr, minStr] = (session.heure_debut as string).split(':')
    if (!heureStr || !minStr) return 0

    const now = new Date()
    const coursStart = new Date()
    coursStart.setHours(parseInt(heureStr, 10), parseInt(minStr, 10), 0, 0)

    const tolerance = 10 * 60 * 1000 // 10 minutes de tolérance
    const diff = now.getTime() - coursStart.getTime() - tolerance
    return diff > 0 ? Math.round(diff / 60000) : 0
  } catch {
    return 0
  }
}
