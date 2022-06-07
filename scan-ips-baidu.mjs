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
const outputDir = `${workDir}/ips-baidu`
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
    '@jimpick/provider-quest-baidu-ip-geo-lookups',
    ['ipsBaidu']
    // { headless: false }
  )

  await notebook.redefine('geoIpBaiduKey', process.env.GEOIP_BAIDU_KEY.trim())
  await notebook.redefine('geoIpBaiduSecret', process.env.GEOIP_BAIDU_SECRET.trim())
  await notebook.redefine('maxLookups', 1000)
  await notebook.redefine('maxElapsed', 5 * 60 * 1000)

  const files = fs.readdirSync(`${workDir}/ips-geolite2`)

  const dates = []
  for (const file of files) {
    const match = file.match(/ips-geolite2-(.*)\.json/)
    if (match) dates.push(match[1])
  }

  date_loop: for (const date of dates) {
    // break
    const jsonFilename = `ips-baidu-${date}.json`
    const dest =`${outputDir}/${jsonFilename}`
    if (fs.existsSync(dest)) {
        console.log(`File already exists, skipping. ${jsonFilename}`)
    } else {
      console.log('Date:', date)

      // console.log('Paused...')
      // const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
      // const it = rl[Symbol.asyncIterator]()
      // console.log(await it.next())

      const latestIpsGeoLite2ReportUrl = `http://localhost:3000/ips-geolite2/ips-geolite2-${date}.json`
      await notebook.redefine('latestIpsGeoLite2ReportUrl', latestIpsGeoLite2ReportUrl)
      console.log(latestIpsGeoLite2ReportUrl)

      if (date !== dates[0]) {
        const prevDate = agnosticAddDays(new Date(date), -1).toISOString().slice(0, 10)
        const latestIpsBaiduReportUrl = `http://localhost:3000/ips-baidu/ips-baidu-${prevDate}.json`
        await notebook.redefine('latestIpsBaiduReportUrl', latestIpsBaiduReportUrl)
        console.log(latestIpsBaiduReportUrl)
      }

      const currentEpoch = date === '2020-08-24' ? 0 : dateToEpoch(new Date(date))
      await notebook.redefine('currentEpoch', currentEpoch)
      console.log('currentEpoch', currentEpoch)

      let count = 0
      while (true) {
        const ipsBaidu = await notebook.value('ipsBaidu')
        if (ipsBaidu.state === 'paused') {
          await notebook.redefine('start', 1)
          await delay(1000)
          continue
        }
        if (count++ % 100 === 0) {
          console.log(
            `ips-baidu${process.argv[2] ? ' ' + process.argv[2] : ''} => State:`,
            ipsBaidu.state,
            ipsBaidu.elapsed ? `Elapsed: ${dateFns.formatDistance(ipsBaidu.elapsed * 1000, 0)}` : '',
            'Scanned:',
            ipsBaidu.scannedIps + '/' + ipsBaidu.totalIps,
            'Records:',
            ipsBaidu.recordsLength,
            'Errors:',
            ipsBaidu.errors
          )
        }
        if (ipsBaidu.state === 'done') {
          const latestIpsBaiduReport = await notebook.value('latestIpsBaiduReport')
          const output = {
            date,
            epoch: currentEpoch,
            ipsBaidu: latestIpsBaiduReport.ipsBaidu
          }
          console.log('Records:', ipsBaidu.records.length)
          for (const record of ipsBaidu.records) {
            const { ip, ...rest } = record
            if (rest.baidu?.status === 302) {
              console.error('Baidu rate limit hit! Exiting.')
              break date_loop
            }
            output.ipsBaidu[ip] = rest
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
