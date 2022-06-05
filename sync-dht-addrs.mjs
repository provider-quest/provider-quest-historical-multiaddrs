import fs from 'fs'
import { parse } from 'csv-parse'
import { epochToDate } from './filecoin-epochs.mjs'
import dateFns from 'date-fns'
import agnosticAddDays from './agnostic-add-days.mjs'
import 'dotenv/config'

import lilyDates from './lily-dates.mjs'

const workDir = process.env.WORK_DIR || '.'
fs.mkdirSync(`${workDir}/dht-addrs-latest`, { recursive: true })

const dhtAddrsLatest = new Map()

const sortMiners = (a, b) => Number(a.slice(1)) - Number(b.slice(1))

function writeDhtAddrsLatest (date) {
  // console.log('Writing output', date)
  const file = `${workDir}/dht-addrs-latest/dht-addrs-latest-${date}.json`
  try {
    if (fs.existsSync(`${file}.tmp`)) {
      fs.unlinkSync(`${file}.tmp`)
    }
    const output = {
      date,
      miners: {}
    }
    const miners = [...dhtAddrsLatest.keys()].sort(sortMiners)
    for (const minerId of miners) {
      output.miners[minerId] = dhtAddrsLatest.get(minerId)
    }
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(output, null, 2))
    fs.renameSync(`${file}.tmp`, file)
    console.log(`Wrote ${file}`)
  } catch (e) {
    console.error('write output Exception', e)
  }
}

async function run () {
  const minerInfoFiles = fs.readdirSync(`${workDir}/miner-info-subset-latest`)
  const dates = []
  for (const file of minerInfoFiles) {
    const match = file.match(/miner-info-subset-latest-(.*)\.json/)
    if (match) dates.push(match[1])
  }

  const datesToProcess = [...dates]

  const inputDir = `${workDir}/sync/dht-addrs`

  const files = fs.readdirSync(inputDir)
  const epochs = []
  for (const file of files) {
    const match = file.match(/dht-addrs-(\d+)\.json/)
    if (match) epochs.push(Number(match[1]))
  }
  epochs.sort((a, b) => a - b)

  let nextDate
  for (const epoch of epochs) {
    const epochDate = epochToDate(epoch)
    console.log(epoch, epochDate)
    while (datesToProcess.length > 0) {
      const nextDate = agnosticAddDays(new Date(datesToProcess[0]), 1)
      // console.log(nextDate > epochDate, datesToProcess[0], nextDate, epochDate)
      if (nextDate > epochDate) {
        break
      }
      writeDhtAddrsLatest(datesToProcess[0])
      datesToProcess.shift()
    }
    const file = `${workDir}/sync/dht-addrs/dht-addrs-${epoch}.json`
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    for (const line of lines) {
      if (line.trim() !== '') {
        try {
          const { miner, ...rest } = JSON.parse(line)
          dhtAddrsLatest.set(miner, rest)
          // console.log(miner, rest)
        } catch (e) {
          console.error('Exception', e)
        }
      }
    }
  }
  for (const date of datesToProcess) {
    writeDhtAddrsLatest(date)
  }

  console.log('Done.')
}

try {
  run()
} catch (e) {
  console.error('Exception:', e)
}
