import fs from 'fs'
import { parse } from 'csv-parse'
import { epochToDate } from './filecoin-epochs.mjs'
import agnosticAddDays from './agnostic-add-days.mjs'
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
      epochs[epoch].push({
        epoch,
        timestamp: epochToDate(epoch),
        minerId,
        peerId,
        multiaddrsDecoded: JSON.parse(multiAddress)
      })
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
          if (rest.multiaddrsDecoded || minerInfoLatest.has(minerId)) {
            minerInfoLatest.set(minerId, rest)
          }
        }
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

  let lastDate = null
  for (const date of datesToProcess) {
    if (lastDate) {
      while (true) {
        const nextDate = agnosticAddDays(lastDate, 1)
        const nextDateString = nextDate.toISOString().slice(0, 10)
        if (nextDateString === date) break
        await writeMinerInfoSubsetLatest(nextDateString)
        lastDate = nextDate
      }
    }
    // console.log('Date: ', date)
    await syncLily('miner_infos', date)
    await parseMinerInfos(date)
    await writeMinerInfoSubsetLatest(date)
    lastDate = new Date(date)
  }

  console.log('Done.')
}

try {
  run()
} catch (e) {
  console.error('Exception:', e)
}
