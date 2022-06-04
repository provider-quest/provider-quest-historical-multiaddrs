import fs from 'fs'
import url from 'url'
import { load } from '@jimpick/observable-prerender-localhost'
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import fastifyCors from '@fastify/cors'
import 'dotenv/config'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

const workDir = process.env.WORK_DIR || '.'

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
  root: workDir + '/miner-info-subset-latest/',
  prefix: '/miner-info-subset-latest',
  prefixAvoidTrailingSlash: true,
  list: {
    format: 'html',
    render: renderList,
    names: ['index', 'index.html', '/']
  }
})

fastify.register(fastifyStatic, {
  root: __dirname + '/observable-notebooks/',
  prefix: '/notebooks/',
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

  const date = '2022-05-12'
  const minerInfoSubsetLatestUrl = `http://localhost:3000/miner-info-subset-latest/miner-info-subset-latest-${date}.json`

  await notebook.redefine('minerInfoSubsetLatestUrl', minerInfoSubsetLatestUrl)
  await notebook.redefine('dhtAddrsLatest', { miners: {} })
  await notebook.redefine('minTimestamp', new Date('2020-08-23'))
    
  // console.log(await notebook.value("minerInfoSubsetLatest"))
  // console.log(await notebook.value("miners"))
  // console.log(await notebook.value("minersCombined"))
  // console.log(await notebook.value("minerMultiaddrs"))
  console.log(await notebook.value("minerMultiaddrIps"))
  await notebook.browser.close()
  fastify.close()
}

try {
  run()
} catch (e) {
  console.error('Error', e)
}

