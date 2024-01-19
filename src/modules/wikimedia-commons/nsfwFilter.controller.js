import { wikibaseGetEntities, wikidataSparqlQueryDepicts } from './nsfwFilter.service.js'

/**
 * https://commons.m.wikimedia.org/wiki/MediaWiki:Gadget-NSFW.js
 * @param {Fastify.Request} request
 * @param {Fastify.Reply} reply
 */
export async function getIfImageIsNSFW (request, reply) {
  const { image } = request.query
  const data = await wikibaseGetEntities(image)
  if (data.entities === undefined) {
    return
  }
  const imagesData = []
  for (const pageMid in data.entities) {
    const entity = data.entities[pageMid]
    if (entity.statements === undefined || entity.statements.P180 === undefined) {
      continue
    }
    imagesData.push({
      depicts: entity.statements.P180.map(function (value) {
        return value.mainsnak.datavalue.value.id
      })
    })
  }
  let topics = imagesData.map(function (imageData) {
    return imageData.depicts
  }).flat()
  topics = topics.filter(function (value, index, self) {
    return self.indexOf(value) === index
  })
  const sparqlQueryResults = await wikidataSparqlQueryDepicts(topics)

  return !!sparqlQueryResults.results.bindings.length
}
