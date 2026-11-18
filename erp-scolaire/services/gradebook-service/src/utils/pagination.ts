import { z } from 'zod'
export const paginationSchema = z.object({ page: z.coerce.number().int().min(1).default(1), per_page: z.coerce.number().int().min(1).max(100).default(20) })
export type PaginationParams = z.infer<typeof paginationSchema>
export const buildMeta = (total: number, p: PaginationParams) => ({ page: p.page, per_page: p.per_page, total, total_pages: Math.ceil(total / p.per_page) })
export const buildOffset = (p: PaginationParams) => ({ limit: p.per_page, offset: (p.page - 1) * p.per_page })
export const successResponse = <T>(data: T, meta?: Record<string, unknown>) => ({ success: true, data, meta: meta ?? null, error: null })
