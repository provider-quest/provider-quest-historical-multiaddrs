import lilyDates from './lily-dates.mjs'
import syncLily from './sync-lily.mjs'
import 'dotenv/config'

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
  }

  console.log('Done.')
}

run()

