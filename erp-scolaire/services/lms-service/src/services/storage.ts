/**
 * Stockage S3-compatible (AWS S3 ou OVH Object Storage)
 *
 * Génère des URLs présignées pour upload direct depuis le navigateur
 * et pour téléchargement sécurisé avec expiration configurable.
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createHash } from 'crypto'

const s3 = new S3Client({
  region:   process.env['S3_REGION']   ?? 'eu-west-3',
  endpoint: process.env['S3_ENDPOINT'],  // OVH ou MinIO si défini
  credentials: {
    accessKeyId:     process.env['S3_ACCESS_KEY']    ?? '',
    secretAccessKey: process.env['S3_SECRET_KEY']    ?? '',
  },
  forcePathStyle: !!process.env['S3_ENDPOINT'], // nécessaire pour MinIO/OVH
})

const BUCKET = process.env['S3_BUCKET'] ?? 'erp-scolaire-lms'
const UPLOAD_TTL   = 900   // 15 minutes pour l'upload
const DOWNLOAD_TTL = 3600  // 1 heure pour le téléchargement

export type PresignedUploadResult = {
  upload_url:   string
  download_url: string
  object_key:   string
  expires_in:   number
}

/**
 * Génère une URL présignée pour upload direct S3 depuis le navigateur.
 * L'objet est organisé par école et type de ressource.
 */
export async function generatePresignedUpload(params: {
  school_id:     string
  cours_id:      string
  filename:      string
  content_type:  string
  max_size_mb?:  number
}): Promise<PresignedUploadResult> {
  const ext = params.filename.split('.').pop() ?? ''
  const hash = createHash('md5').update(`${Date.now()}-${Math.random()}`).digest('hex').slice(0, 8)
  const object_key = `schools/${params.school_id}/cours/${params.cours_id}/${hash}.${ext}`

  const command = new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         object_key,
    ContentType: params.content_type,
  })

  const upload_url = await getSignedUrl(s3, command, { expiresIn: UPLOAD_TTL })

  return {
    upload_url,
    download_url: `https://${BUCKET}.s3.${process.env['S3_REGION'] ?? 'eu-west-3'}.amazonaws.com/${object_key}`,
    object_key,
    expires_in: UPLOAD_TTL,
  }
}

/**
 * Génère une URL présignée pour téléchargement sécurisé (pas d'accès public direct).
 */
export async function generateDownloadUrl(object_key: string, ttl = DOWNLOAD_TTL): Promise<string> {
  const { GetObjectCommand } = await import('@aws-sdk/client-s3')
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: object_key })
  return getSignedUrl(s3, command, { expiresIn: ttl })
}

export async function deleteObject(object_key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: object_key }))
}

export async function objectExists(object_key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: object_key }))
    return true
  } catch {
    return false
  }
}
