import fs from 'fs'
import url from 'url'
import readline from 'readline'
import { load } from '@jimpick/observable-prerender-localhost'
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import fastifyCors from '@fastify/cors'
import dateFns from 'date-fns'
import agnosticAddDays from './agnostic-add-days.mjs'
import delay from 'delay'
// import { isoParse } from 'd3'
import { dateToEpoch } from './filecoin-epochs.mjs'
import 'dotenv/config'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

const workDir = process.env.WORK_DIR || '.'
const outputDir = `${workDir}/csp-regions`
fs.mkdirSync(`${outputDir}/regions`, { recursive: true })
fs.mkdirSync(`${outputDir}/locations`, { recursive: true })

const fastify = Fastify({
  logger: true
})

fastify.register(fastifyCors, {
  origin: '*'
})

function renderList (dirs, files) {
      return `
<html><body>
<ul>
  ${dirs.map(dir => `<li><a href="${dir.href}">${dir.name}</a></li>`).join('\n  ')}
</ul>
<ul>
  ${files.map(file => `<li><a href="${file.href}" target="_blank">${file.name}</a></li>`).join('\n  ')}
</ul>
</body></html>
`
}

fastify.register(fastifyStatic, {
  root: __dirname + '/observable-notebooks/',
  prefix: '/notebooks/',
  list: {
    format: 'html',
    render: renderList,
    names: ['index', 'index.html', '/']
  }
})

fastify.register(fastifyStatic, {
  root: workDir + '/multiaddrs-ips-latest/',
  prefix: '/multiaddrs-ips-latest',
  prefixAvoidTrailingSlash: true,
  list: {
    format: 'html',
    render: renderList,
    names: ['index', 'index.html', '/']
  },
  decorateReply: false
})

fastify.register(fastifyStatic, {
  root: workDir + '/ips-geolite2/',
  prefix: '/ips-geolite2',
  prefixAvoidTrailingSlash: true,
  list: {
    format: 'html',
    render: renderList,
    names: ['index', 'index.html', '/']
  },
  decorateReply: false
})

fastify.register(fastifyStatic, {
  root: workDir + '/ips-baidu/',
  prefix: '/ips-baidu',
  prefixAvoidTrailingSlash: true,
  list: {
    format: 'html',
    render: renderList,
    names: ['index', 'index.html', '/']
  },
  decorateReply: false
})

const startFastify = async () => {
  try {
    await fastify.listen(3000, '0.0.0.0')
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}
startFastify()

async function run () {
  const notebook = await load(
    '@jimpick/internal-mapping-storage-provider-to-countrystateprovin',
    ['minerRegionsTable', 'minerLocationsTable']
    // { headless: false }
  )

  const files = fs.readdirSync(`${workDir}/multiaddrs-ips-latest`)
  const dates = []
  for (const file of files) {
    const match = file.match(/multiaddrs-ips-(.*)\.json/)
    if (match) dates.push(match[1])
  }

  const geoLite2Files = fs.readdirSync(`${workDir}/ips-geolite2`)
  const geoLite2Dates = []
  for (const file of geoLite2Files) {
    const match = file.match(/ips-geolite2-(.*)\.json/)
    if (match) geoLite2Dates.push(match[1])
  }
  const geoLite2Date = geoLite2Dates.sort().slice(-1)
  console.log('GeoLite2 Last Date', geoLite2Date)
  const ipsGeoLite2LatestUrl = `http://localhost:3000/ips-geolite2/ips-geolite2-${geoLite2Date}.json`
  await notebook.redefine('ipsGeoLite2LatestUrl', ipsGeoLite2LatestUrl)

  const baiduFiles = fs.readdirSync(`${workDir}/ips-baidu`)
  const baiduDates = []
  for (const file of baiduFiles) {
    const match = file.match(/ips-baidu-(.*)\.json/)
    if (match) baiduDates.push(match[1])
  }
  const baiduDate = baiduDates.sort().slice(-1)
  console.log('Baidu Last Date', baiduDate)
  const ipsBaiduLatestUrl = `http://localhost:3000/ips-baidu/ips-baidu-${baiduDate}.json`
  await notebook.redefine('ipsBaiduLatestUrl', ipsBaiduLatestUrl)

  date_loop: for (const date of dates) {
    // break
    const jsonRegionsFilename = `regions-${date}.json`
    const regionsDest = `${outputDir}/regions/${jsonRegionsFilename}`
    const jsonLocationsFilename = `locations-${date}.json`
    const locationsDest = `${outputDir}/locations/${jsonLocationsFilename}`
    if (fs.existsSync(regionsDest) && fs.existsSync(locationsDest)) {
        console.log(`Files already exist, skipping. ${jsonFilename}`)
    } else {
      console.log('Date:', date)

      // console.log('Paused...')
      // const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
      // const it = rl[Symbol.asyncIterator]()
      // console.log(await it.next())

      const multiaddrsIpsLatestUrl = `http://localhost:3000/multiaddrs-ips-latest/multiaddrs-ips-${date}.json`
      await notebook.redefine('multiaddrsIpsLatestUrl', multiaddrsIpsLatestUrl)
      console.log(multiaddrsIpsLatestUrl)

      const currentEpoch = date === '2020-08-24' ? 0 : dateToEpoch(new Date(date))
      await notebook.redefine('currentEpoch', currentEpoch)
      console.log('currentEpoch', currentEpoch)

      const minerRegions = await notebook.value('minerRegionsTable')
      const minerRegionsReport = {
        date,
        epoch: currentEpoch,
        minerRegions
      }
      fs.writeFileSync(regionsDest, JSON.stringify(minerRegionsReport, null, 2))

      const minerLocations = await notebook.value('minerLocationsTable')
      const minerLocationsReport = {
        date,
        epoch: currentEpoch,
        minerLocations
      }
      fs.writeFileSync(locationsDest, JSON.stringify(minerLocationsReport, null, 2))
    }
  }

  await notebook.browser.close()
  fastify.close()
}

try {
  run()
} catch (e) {
  console.error('Error', e)
}
