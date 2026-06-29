import { z } from 'zod'

export const emailSchema = z.string().email('Invalid email address').toLowerCase()

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Must contain at least one special character')

export const phoneSchema = z
  .string()
  .regex(/^\+?[\d\s\-()]{7,20}$/, 'Invalid phone number')
  .optional()

export const uuidSchema = z.string().uuid('Invalid ID')

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})
