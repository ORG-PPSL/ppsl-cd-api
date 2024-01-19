import { getIfImageIsNSFW } from './nsfwFilter.controller.js'
import { $ref } from './nsfwFilter.schema.js'

/**
 * @param {Fastify.Instance} fastify
 */
export default async function nsfwFilterRoutes (fastify) {
  fastify.get('/nsfwFilter', {
    schema: {
      querystring: $ref('nsfwInput')
      /**
      response: {
        200: $ref('ResponseSchema')
      }
        */
    }
  }, getIfImageIsNSFW)
}
