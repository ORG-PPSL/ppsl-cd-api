import { z } from 'zod'
import { buildJsonSchemas } from 'fastify-zod'

export const nsfwInput = z.object({
  image: z.string()
})

// Build

export const { schemas: nsfwFilterSchemas, $ref } = buildJsonSchemas({
  nsfwInput
}, { $id: 'nsfwFilter' })

/**
 * @typedef {z.infer<typeof nsfwInput>} NSFWInputSchema
 */
