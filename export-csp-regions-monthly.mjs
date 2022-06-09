import fs from 'fs'
import { finished } from 'node:stream/promises'
import dateFns from 'date-fns'
import 'dotenv/config'

const workDir = process.env.WORK_DIR || '.'
const tmpDir = `${workDir}/tmp`
fs.mkdirSync(tmpDir, { recursive: true })
const outputDir = `${workDir}/regions-locations-csv`
fs.mkdirSync(outputDir, { recursive: true })

async function run () {
  const tempOutputFile = `${tmpDir}/csp-regions-monthly.csv`
  const writeStream = fs.createWriteStream(tempOutputFile)
  const csvHeader = [ 'year_month', 'location_date', 'location_epoch', 'miner', 'region', 'num_regions' ].join(',')
  await writeStream.write(csvHeader + '\n')

  const files = fs.readdirSync(`${workDir}/csp-regions/regions`)
  const monthsSet = new Set()
  const lastSeenDayOfMonth = new Map()
  for (const file of files) {
    const match = file.match(/regions-(.*)-(\d\d)\.json/)
    if (match) {
      const yearMonth = match[1]
      const day = Number(match[2])
      monthsSet.add(yearMonth)
      if (!lastSeenDayOfMonth.has(yearMonth) ||
        day > lastSeenDayOfMonth.get(yearMonth)) {
        lastSeenDayOfMonth.set(yearMonth, day)
      }
    }
  }

  const months = [...monthsSet].sort()

  for (const yearMonth of months) {
    const firstDay = new Date(`${yearMonth}-01`)
    const month = firstDay.getUTCMonth()
    const year = firstDay.getUTCFullYear()
    // console.log(yearMonth, firstDay, month, year)
    let nextMonth = month + 1
    let nextMonthYear = year
    if (nextMonth === 12) {
      nextMonth = 0
      nextMonthYear++
    }
    const nextMonthFirstDay = new Date(Date.UTC(nextMonthYear, nextMonth, 1))
    // console.log('Next month:', nextMonthFirstDay)
    let matchedFile
    const checkDate = nextMonthFirstDay.toISOString().slice(0, 10)
    const checkFile = `${workDir}/csp-regions/regions/regions-${checkDate}.json`
    if (fs.existsSync(checkFile)) {
      matchedFile = checkFile
    } else if (lastSeenDayOfMonth.has(yearMonth)) {
      const lastSeenDay = `${yearMonth}-${String(lastSeenDayOfMonth.get(yearMonth)).padStart(2, '0')}`
      const lastSeenDayFile = `${workDir}/csp-regions/regions/regions-${lastSeenDay}.json`
      matchedFile = lastSeenDayFile
    } else {
      console.error("This shouldn't happen.")
      process.exit(1)
    }
    // console.log(yearMonth, '=>', matchedFile)
    try {
      const regionsFileContent = fs.readFileSync(matchedFile, 'utf8')
      const { date, epoch, minerRegions } = JSON.parse(regionsFileContent)
      for (const { miner, region, numRegions } of minerRegions) {
        const csvLine = [ yearMonth, date, epoch, miner, region, numRegions ].join(',')
        await writeStream.write(csvLine + '\n') 
      }
    } catch (e) {
      console.error('Exception', e)
      process.exit(1)
    }
  }
  writeStream.end()
  await finished(writeStream)
  fs.renameSync(tempOutputFile, `${outputDir}/csp-regions-monthly.csv`)
  console.log(`Wrote ${outputDir}/csp-regions-monthly.csv`)
}

run()

