const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

/** "15 Jan" from an ISO date string */
export function fmtDate(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00Z')
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}
