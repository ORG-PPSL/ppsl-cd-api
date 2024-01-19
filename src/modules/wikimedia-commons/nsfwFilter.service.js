const headers = new Headers({ 'user-agent': 'ppsl-cd' })
const WIKIMEDIA_API_ENDPOINT = 'https://commons.wikimedia.org/w/api.php'
const nsfwTopics = [
  'Q291', // pornography
  'Q496', // feces
  'Q608', // human sexual activity
  'Q5880', // vagina
  'Q5887', // orgasm
  'Q9103', // breast
  'Q10791', // nudity
  'Q10816', // sex toy
  'Q40446', // nude
  'Q42165', // buttocks
  'Q124490', // violence
  'Q133993', // erection
  'Q174471', // scrotum
  'Q181001', // erotica
  'Q188641', // nipple
  'Q650891', // glans penis
  'Q673203', // foreskin
  'Q843533', // areola
  'Q844482', // killing
  'Q1058795', // body fluid
  'Q1406501', // labia
  'Q2148678', // sexual penetration
  'Q2192288', // vulva
  'Q3258546', // human anus
  'Q4620674', // sex organ
  'Q11722446' // mons pubis
]

export async function wikibaseGetEntities (imageTitle) {
  const url = new URL(WIKIMEDIA_API_ENDPOINT)
  url.searchParams.append('action', 'wbgetentities')
  url.searchParams.append('props', 'info|claims')
  url.searchParams.append('sites', 'commonswiki')
  url.searchParams.append('titles', imageTitle)
  url.searchParams.append('format', 'json')
  const request = await fetch(url)
  return await request.json()
}

export async function wikidataSparqlQueryDepicts (topics) {
  const sparqlQuery = `SELECT ?depicts WHERE { 
    ?depicts wdt:P31*/wdt:P279* ?nsfw .
    VALUES ?depicts {wd:${topics.join(' wd:')}}
    VALUES ?nsfw {wd:${nsfwTopics.join(' wd:')}}
  }`
  const url = new URL('https://query.wikidata.org/sparql')
  url.searchParams.append('format', 'json')
  url.searchParams.append('query', sparqlQuery)
  const request = await fetch(url, { headers })
  return await request.json()
}
