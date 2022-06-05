import fs from 'fs'
import url from 'url'
import { load } from '@jimpick/observable-prerender-localhost'
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import fastifyCors from '@fastify/cors'
import dateFns from 'date-fns'
import agnosticAddDays from './agnostic-add-days.mjs'
import 'dotenv/config'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

const workDir = process.env.WORK_DIR || '.'
const outputDir = `${workDir}/multiaddrs-ips-latest`
fs.mkdirSync(outputDir, { recursive: true })

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
  root: workDir + '/miner-info-subset-latest/',
  prefix: '/miner-info-subset-latest',
  prefixAvoidTrailingSlash: true,
  list: {
    format: 'html',
    render: renderList,
    names: ['index', 'index.html', '/']
  },
  decorateReply: false
})

fastify.register(fastifyStatic, {
  root: workDir + '/dht-addrs-latest/',
  prefix: '/dht-addrs-latest',
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
    '@jimpick/provider-quest-multiaddr-ip-tool',
    ['minerMultiaddrIps', 'deltaMultiaddrsIps']
    // { headless: false }
  )

  const files = fs.readdirSync(`${workDir}/miner-info-subset-latest`)
  const dates = []
  for (const file of files) {
    const match = file.match(/miner-info-subset-latest-(.*)\.json/)
    if (match) dates.push(match[1])
  }

  for (const date of dates) {
    const jsonFilename = `multiaddrs-ips-${date}.json`
    const dest =`${outputDir}/${jsonFilename}`
    if (fs.existsSync(dest)) {
        console.log(`File already exists, skipping. ${jsonFilename}`)
    } else {
      console.log('Date:', date)

      const minerInfoSubsetLatestUrl = `http://localhost:3000/miner-info-subset-latest/miner-info-subset-latest-${date}.json`
      await notebook.redefine('minerInfoSubsetLatestUrl', minerInfoSubsetLatestUrl)
      console.log(minerInfoSubsetLatestUrl)

      const dhtAddrsLatestUrl = `http://localhost:3000/dht-addrs-latest/dht-addrs-latest-${date}.json`
      await notebook.redefine('dhtAddrsLatestUrl', dhtAddrsLatestUrl)
      console.log(dhtAddrsLatestUrl)

      const minMinerInfoTimestamp = new Date('2020-08-23')
      await notebook.redefine('minMinerInfoTimestamp', minMinerInfoTimestamp)
      console.log('minMinerInfoTimestamp', minMinerInfoTimestamp.toISOString())

      const minDhtTimestamp = agnosticAddDays(new Date(date), -7)
      await notebook.redefine('minDhtTimestamp', minDhtTimestamp)
      console.log('minDhtTimestamp', minDhtTimestamp.toISOString())

      const minerMultiaddrIps = await notebook.value("minerMultiaddrIps")
      const output = {
        date,
        multiaddrsIps: minerMultiaddrIps
      }
      fs.writeFileSync(dest, JSON.stringify(output, null, 2))
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
