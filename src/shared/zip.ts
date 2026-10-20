// Minimal ZIP32 encoder: UTF-8 names, store-only entries, no compression/dependencies.
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1
  return value >>> 0
})
export const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255]
  return (crc ^ 0xffffffff) >>> 0
}
export const encodeZip = (files: { name: string; data: Uint8Array }[]): Uint8Array => {
  if (files.length > 65535) throw new Error('Too many files for ZIP32.')
  const encoder = new TextEncoder()
  const used = new Set<string>()
  let size = 22
  const entries = files.map(file => {
    if (!file.name || file.name === '.' || file.name === '..' || /[/\\\x00-\x1f]/.test(file.name)) throw new Error('Invalid ZIP filename.')
    if (used.has(file.name.toLowerCase())) throw new Error('Duplicate ZIP filename.')
    used.add(file.name.toLowerCase())
    const name = encoder.encode(file.name)
    if (name.length > 65535) throw new Error('ZIP filename is too long.')
    size += 76 + 2 * name.length + file.data.length
    if (size > 0xffffffff) throw new Error('Archive exceeds ZIP32 size limit.')
    return { ...file, nameBytes: name, crc: crc32(file.data), offset: 0 }
  })
  const bytes = new Uint8Array(size)
  const view = new DataView(bytes.buffer)
  let at = 0
  const u16 = (offset: number, n: number) => view.setUint16(at + offset, n, true)
  const u32 = (offset: number, n: number) => view.setUint32(at + offset, n, true)
  for (const entry of entries) {
    entry.offset = at
    u32(0, 0x04034b50); u16(4, 20); u16(6, 0x800); u16(8, 0); u16(12, 0x21)
    u32(14, entry.crc); u32(18, entry.data.length); u32(22, entry.data.length); u16(26, entry.nameBytes.length)
    at += 30
    bytes.set(entry.nameBytes, at); at += entry.nameBytes.length
    bytes.set(entry.data, at); at += entry.data.length
  }
  const central = at
  for (const entry of entries) {
    u32(0, 0x02014b50); u16(4, 20); u16(6, 20); u16(8, 0x800); u16(10, 0); u16(14, 0x21)
    u32(16, entry.crc); u32(20, entry.data.length); u32(24, entry.data.length); u16(28, entry.nameBytes.length); u32(42, entry.offset)
    at += 46
    bytes.set(entry.nameBytes, at); at += entry.nameBytes.length
  }
  const centralSize = at - central
  u32(0, 0x06054b50); u16(8, entries.length); u16(10, entries.length); u32(12, centralSize); u32(16, central)
  return bytes
}
