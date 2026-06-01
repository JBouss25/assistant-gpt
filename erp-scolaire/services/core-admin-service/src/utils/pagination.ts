import { z } from 'zod'

export const paginationSchema = z.object({
  page:     z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
})

export type PaginationParams = z.infer<typeof paginationSchema>

export function buildMeta(total: number, { page, per_page }: PaginationParams) {
  return {
    page,
    per_page,
    total,
    total_pages: Math.ceil(total / per_page),
  }
}

export function buildOffset({ page, per_page }: PaginationParams) {
  return { limit: per_page, offset: (page - 1) * per_page }
}

export function successResponse<T>(data: T, meta?: Record<string, unknown>) {
  return { success: true, data, meta: meta ?? null, error: null }
}
