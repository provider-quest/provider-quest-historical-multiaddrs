import dateFns from 'date-fns'

export default function agnosticAddDays(date, amount) {
  // https://github.com/date-fns/date-fns/issues/571#issuecomment-602496322
  const originalTZO = date.getTimezoneOffset();
  const endDate = dateFns.addDays(date, amount);
  const endTZO = endDate.getTimezoneOffset();

  const dstDiff = originalTZO - endTZO;

  return dstDiff >= 0
    ? dateFns.addMinutes(endDate, dstDiff)
    : dateFns.subMinutes(endDate, Math.abs(dstDiff));
}
