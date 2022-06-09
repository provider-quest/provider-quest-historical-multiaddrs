import fs from 'fs'
import dateFns from 'date-fns'
import 'dotenv/config'

const workDir = process.env.WORK_DIR || '.'
const outputDir = `${workDir}/csp-regions-monthly-csv`
fs.mkdirSync(outputDir, { recursive: true })

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
  console.log(yearMonth, '=>', matchedFile)
}


