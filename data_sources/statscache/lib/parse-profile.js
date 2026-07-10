/**
 * Parse a footywire player profile page (`pp-{team}--{name}`) for the bio fields
 * we keep: date of birth (the key matching field), height, position, draft year,
 * origin, and display name.
 */

import { dobFromFootywire } from './normalize.js'

export function parseProfile(html) {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ')

  const born = text.match(/Born:\s*([A-Za-z]+\s+\d{1,2},\s*\d{4})/i)
  const height = text.match(/Playing Height:\s*(\d+)\s*cm/i)
  const position = text.match(/Position:\s*([A-Za-z/ ,&-]+?)\s*(?:Drafted|Origin|Weight|$)/i)
  const draft = text.match(/Drafted:[^.]*?\b((?:19|20)\d{2})\b/i)
  const origin = text.match(/Origin:\s*(.+?)\s*(?:Playing Height|Position|Drafted|$)/i)

  const titleMatch = html.match(/<title>([^<|,-]+)/i)

  return {
    name: titleMatch ? titleMatch[1].trim() : null,
    dob: born ? dobFromFootywire(born[1]) : null,
    bornRaw: born ? born[1].trim() : null,
    heightCm: height ? Number(height[1]) : null,
    position: position ? position[1].trim() : null,
    draftYear: draft ? draft[1] : null,
    origin: origin ? origin[1].trim() : null,
  }
}
