/**
 * Parse an afltables.com player page (`stats/players/{X}/{Name}.html`) for the one
 * field we need: date of birth (used only to break a CD-id-matching ambiguity — see
 * lib/ids.js). Format confirmed live: "<b>Born:</b>13-Aug-1939 (...)".
 */

const MONTHS = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

export function parsePlayerPage(html) {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ')
  const born = text.match(/Born:\s*(\d{1,2})-([A-Za-z]{3})-(\d{4})/i)
  const height = text.match(/Height:\s*(\d+)\s*cm/i)
  let dob = null
  if (born) {
    const mm = MONTHS[born[2].toLowerCase()]
    if (mm) dob = `${born[3]}-${mm}-${String(born[1]).padStart(2, '0')}`
  }
  return { dob, heightCm: height ? Number(height[1]) : null }
}
