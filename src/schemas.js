import fp from 'fastify-plugin'

import { userSchemas } from './modules/user/user.schema.js'
import { postSchemas } from './modules/post/post.schema.js'
import { nsfwFilterSchemas } from './modules/wikimedia-commons/nsfwFilter.schema.js'

/**
 * @type {import('fastify').FastifyPluginAsync}
 */
const schemas = fp(async (fastify) => {
  for (const schema of [...userSchemas, ...postSchemas, ...nsfwFilterSchemas]) {
    await fastify.addSchema(schema)
  }
})

export default schemas
