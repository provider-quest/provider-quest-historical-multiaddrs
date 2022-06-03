import fs from 'fs'
import { parse } from 'csv-parse'
import { epochToDate } from './filecoin-epochs.mjs'
import 'dotenv/config'

import lilyDates from './lily-dates.mjs'
import syncLily from './sync-lily.mjs'

const workDir = process.env.WORK_DIR || '.'
fs.mkdirSync(`${workDir}/miner-info-subset-latest`, { recursive: true })

const minerInfoLatest = new Map()

const sortMiners = (a, b) => Number(a.slice(1)) - Number(b.slice(1))

async function parseMinerInfos (date) {
  const parser = parse()
  const epochs = []

  parser.on('readable', function () {
    let record
    while ((record = parser.read()) !== null) {
      const [
        height,
        minerId,
        stateRoot,
        ownerId,
        workerId,
        newWorker,
        workerChangeEpoch,
        consensusFaultElapsed,
        peerId,
        controlAddress,
        multiAddress,
        sectorSize
      ] = record
      const epoch = Number(height)
      if (!epochs[epoch]) {
        epochs[epoch] = []
      }
      if (multiAddress !== 'null') {
        epochs[epoch].push({
          epoch,
          minerId,
          multiaddrsDecoded: JSON.parse(multiAddress)
        })
      }
    }
  })

  parser.on('error', function (err) {
    console.error(err.message)
    process.exit(1)
  })

  const file = `${workDir}/sync/miner-infos/${date}.csv`

  const stream = fs.createReadStream(file)
  stream.pipe(parser)

  const promise = new Promise(resolve => {
    parser.on('end', () => {
      for (const epoch in epochs) {
        const date = epochToDate(epoch)
        // console.log(`Epoch: ${epoch} Date: ${date.toISOString()}`)
        // console.log(epochs[epoch])
        for (const record of epochs[epoch]) {
          const { minerId, ...rest } = record
          minerInfoLatest.set(minerId, rest)
        }
        /*
        for (const { minerId, ownerId } of epochs[epoch]) {
          if (!seenMiners.has(minerId)) {
            // console.log(`Miner ${minerId} at ${epoch} - ${date}`)
            // console.log(` Owner: ${ownerId} ${idToAddress.get(ownerId)}`)
            let address = idToAddress.get(ownerId)
            let funded
            let lastEpoch = Number(epoch)
            let displayed = new Set()
            displayed.add(address)
            while(funded = addressFunded.get(address)) {
              const { from, epoch } = funded
              // console.log(`   @${epoch}: ${addressToId.get(from)} ${from} -> ${addressToId.get(address)} ${address}`)
              if (epoch > lastEpoch) {
                console.error(`      Warning: SP ${minerId}: Funded at future ${epoch} > ${lastEpoch}: ${addressToId.get(address)} ${address}`)
                // addressFunded.set(address, null) // Try to break cycles
                // break
              }
              if (displayed.has(from)) {
                console.error(`      Error: loop detected - ${minerId}`)
                break
              }
              address = from
              lastEpoch = epoch
            }
            seenMiners.set(minerId, {
              epoch,
              ownerId
            })
          }
        }
        */
      }
      resolve()
    })
  })

  await promise
}

function writeMinerInfoSubsetLatest (date) {
  // console.log('Writing output', date)
  const file = `${workDir}/miner-info-subset-latest/miner-info-subset-latest-${date}.json`
  try {
    if (fs.existsSync(`${file}.tmp`)) {
      fs.unlinkSync(`${file}.tmp`)
    }
    const output = {
      date,
      miners: {}
    }
    const miners = [...minerInfoLatest.keys()].sort(sortMiners)
    for (const minerId of miners) {
      output.miners[minerId] = minerInfoLatest.get(minerId)
    }
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(output, null, 2))
    fs.renameSync(`${file}.tmp`, file)
  } catch (e) {
    console.error('write output Exception', e)
  }
}

async function run () {
  const availableDates = []
  const dates = await lilyDates('miner_infos')
  for (const date of dates) {
    availableDates.push(date)
  }
  console.log(`${availableDates.length} available dates, last: ${availableDates.slice(-1)[0]}`)

  const datesToProcess = [...availableDates]

  for (const date of datesToProcess) {
    // console.log('Date: ', date)
    await syncLily('miner_infos', date)
    await parseMinerInfos(date)
    await writeMinerInfoSubsetLatest(date)
  }

  console.log('Done.')
}

try {
  run()
} catch (e) {
  console.error('Exception:', e)
}
