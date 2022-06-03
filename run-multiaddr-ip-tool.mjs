import observableRuntime from "@observablehq/runtime"
import define from "@jimpick/provider-quest-multiaddr-ip-tool"
import './fetch-polyfill.mjs'
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import fastifyCors from '@fastify/cors'
import 'dotenv/config'

const workDir = process.env.WORK_DIR || '.'

const fastify = Fastify({
  logger: true
})

fastify.register(fastifyCors, {
  origin: '*'
})

fastify.register(fastifyStatic, {
  root: workDir + '/miner-info-subset-latest/',
  prefix: '/miner-info-subset-latest/'
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
  const runtime = new observableRuntime.Runtime()
  const notebook = runtime.module(define)

  const date = '2022-05-12'
  const minerInfoSubsetLatestUrl = `http://localhost:3000/miner-info-subset-latest/miner-info-subset-latest-${date}.json`

  const fetchJs = (await fetch(`${minerInfoSubsetLatestUrl}`)).json()
  await notebook.redefine('minerInfoSubsetLatest', fetchJs)
  await notebook.redefine('dhtAddrsLatest', { miners: {} })
  await notebook.redefine('minTimestamp', new Date('2020-08-23'))
    
  // console.log(await notebook.value("minerInfoSubsetLatest"))
  console.log(await notebook.value("miners"))
  //console.log(await notebook.value("minerMultiaddrIps"))
  fastify.close()
}

try {
  run()
} catch (e) {
  console.error('Error', e)
}

