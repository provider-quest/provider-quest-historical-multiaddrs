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
const outputDir = `${workDir}/ips-geolite2`
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
    '@jimpick/provider-quest-maxmind-geolite2-lookups',
    ['ipsCount', 'ipsGeoLite2']
    // { headless: false }
  )

  const files = fs.readdirSync(`${workDir}/multiaddrs-ips-latest`)

  const dates = []
  for (const file of files) {
    const match = file.match(/multiaddrs-ips-(.*)\.json/)
    if (match) dates.push(match[1])
  }

  date_loop: for (const date of dates) {
    const jsonFilename = `ips-geolite2-${date}.json`
    const dest =`${outputDir}/${jsonFilename}`
    if (fs.existsSync(dest)) {
        console.log(`File already exists, skipping. ${jsonFilename}`)
    } else {
      console.log('Date:', date)

      // console.log('Paused...')
      // const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
      // const it = rl[Symbol.asyncIterator]()
      // console.log(await it.next())

      const multiaddrsIpsLatestUrl = `http://localhost:3000/multiaddrs-ips-latest/multiaddrs-ips-${date}.json`
      await notebook.redefine('multiaddrsIpsLatestUrl', multiaddrsIpsLatestUrl)
      console.log(multiaddrsIpsLatestUrl)

      if (date !== dates[0]) {
        const prevDate = agnosticAddDays(new Date(date), -1).toISOString().slice(0, 10)
        const ipsGeoLite2LatestUrl = `http://localhost:3000/ips-geolite2/ips-geolite2-${prevDate}.json`
        await notebook.redefine('ipsGeoLite2LatestUrl', ipsGeoLite2LatestUrl)
        console.log(ipsGeoLite2LatestUrl)
      }

      const currentEpoch = date === '2020-08-24' ? 0 : dateToEpoch(new Date(date))
      await notebook.redefine('currentEpoch', currentEpoch)
      console.log('currentEpoch', currentEpoch)

      const minTimestamp = dateFns.subDays(new Date(date), 7)
      await notebook.redefine('minTimestamp', minTimestamp)
      console.log('minTimestamp', minTimestamp.toISOString())

      let count = 0
      while (true) {
        const ipsGeoLite2 = await notebook.value('ipsGeoLite2')
        if (ipsGeoLite2.state === 'paused') {
          /*
          if (process.argv[2] === '--fail-only') {
            await notebook.redefine('maxElapsed', 5 * 60 * 1000)
            await notebook.redefine('subsetToScan', 'Fail only')
          } else if (process.argv[2] === '--no-recents') {
            await notebook.redefine('maxElapsed', 5 * 60 * 1000)
            await notebook.redefine('subsetToScan', 'No recents')
          } else {
          */
          await notebook.redefine('maxElapsed', 3 * 60 * 1000)
          await notebook.redefine('start', 1)
          await delay(1000)
          continue
        }
        if (count++ % 100 === 0) {
          console.log(
            `ips-geolite2${process.argv[2] ? ' ' + process.argv[2] : ''} => State:`,
            ipsGeoLite2.state,
            ipsGeoLite2.elapsed ? `Elapsed: ${dateFns.formatDistance(ipsGeoLite2.elapsed * 1000, 0)}` : '',
            'Scanned:',
            ipsGeoLite2.scannedIps + '/' + ipsGeoLite2.totalIps,
            'Records:',
            ipsGeoLite2.recordsLength,
            'Errors:',
            ipsGeoLite2.errors
          )
        }
        if (ipsGeoLite2.state === 'done') {
          const latestIpsGeoLite2Report = await notebook.value('latestIpsGeoLite2Report')
          const output = {
            date,
            epoch: currentEpoch,
            ipsGeoLite2: latestIpsGeoLite2Report.ipsGeoLite2
          }
          for (const record of ipsGeoLite2.records) {
            const { ip, ...rest } = record
            output.ipsGeoLite2[ip] = rest
          }
          fs.writeFileSync(dest, JSON.stringify(output, null, 2))
          console.log(`Wrote ${dest}`)
          // break date_loop
          break
        }
      }
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
