import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs'
import { deflateRawSync, crc32 } from 'node:zlib'
import path from 'node:path'

/**
 * Creates a standard ZIP archive from a directory using forward slashes.
 * Zero external dependencies, 100% compliant with Mozilla AMO and Chrome Web Store.
 */
export function createZip(sourceDir, zipFilePath, filter = () => true) {
  const files = []

  function collect(dir) {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        collect(fullPath)
      } else if (entry.isFile()) {
        const rel = path.relative(sourceDir, fullPath).split(path.sep).join('/')
        if (filter(rel, fullPath)) {
          files.push({ fullPath, rel })
        }
      }
    }
  }

  collect(sourceDir)

  // Sort files for deterministic archives
  files.sort((a, b) => a.rel.localeCompare(b.rel))

  const localChunks = []
  const centralChunks = []
  let offset = 0

  for (const { fullPath, rel } of files) {
    const rawData = readFileSync(fullPath)
    const compressed = deflateRawSync(rawData)
    const checksum = crc32(rawData) >>> 0
    const nameBuffer = Buffer.from(rel, 'utf8')

    // MS-DOS date/time (fixed or from file mtime)
    const mtime = statSync(fullPath).mtime
    const dosTime =
      (mtime.getHours() << 11) | (mtime.getMinutes() << 5) | Math.floor(mtime.getSeconds() / 2)
    const dosDate =
      ((mtime.getFullYear() - 1980) << 9) | ((mtime.getMonth() + 1) << 5) | mtime.getDate()

    // Local file header (30 bytes + name)
    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0) // signature
    localHeader.writeUInt16LE(20, 4) // version needed to extract (2.0)
    localHeader.writeUInt16LE(0x0800, 6) // general purpose flag (UTF-8)
    localHeader.writeUInt16LE(8, 8) // compression method (deflate)
    localHeader.writeUInt16LE(dosTime, 10)
    localHeader.writeUInt16LE(dosDate, 12)
    localHeader.writeUInt32LE(checksum, 14)
    localHeader.writeUInt32LE(compressed.length, 18)
    localHeader.writeUInt32LE(rawData.length, 22)
    localHeader.writeUInt16LE(nameBuffer.length, 26)
    localHeader.writeUInt16LE(0, 28) // extra field length

    const localRecord = Buffer.concat([localHeader, nameBuffer, compressed])
    localChunks.push(localRecord)

    // Central directory header (46 bytes + name)
    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0) // signature
    centralHeader.writeUInt16LE(0x0314, 4) // version made by (UNIX 2.0)
    centralHeader.writeUInt16LE(20, 6) // version needed (2.0)
    centralHeader.writeUInt16LE(0x0800, 8) // general purpose flag (UTF-8)
    centralHeader.writeUInt16LE(8, 10) // compression method (deflate)
    centralHeader.writeUInt16LE(dosTime, 12)
    centralHeader.writeUInt16LE(dosDate, 14)
    centralHeader.writeUInt32LE(checksum, 16)
    centralHeader.writeUInt32LE(compressed.length, 20)
    centralHeader.writeUInt32LE(rawData.length, 24)
    centralHeader.writeUInt16LE(nameBuffer.length, 28)
    centralHeader.writeUInt16LE(0, 30) // extra field length
    centralHeader.writeUInt16LE(0, 32) // comment length
    centralHeader.writeUInt16LE(0, 34) // disk number start
    centralHeader.writeUInt16LE(0, 36) // internal file attributes
    centralHeader.writeUInt32LE((0o100644 * 0x10000) >>> 0, 38) // external file attributes (regular file -rw-r--r--)
    centralHeader.writeUInt32LE(offset, 42) // relative offset of local header

    centralChunks.push(Buffer.concat([centralHeader, nameBuffer]))
    offset += localRecord.length
  }

  const centralDirBuffer = Buffer.concat(centralChunks)

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0) // signature
  eocd.writeUInt16LE(0, 4) // disk number
  eocd.writeUInt16LE(0, 6) // central dir disk
  eocd.writeUInt16LE(files.length, 8) // records on this disk
  eocd.writeUInt16LE(files.length, 10) // total records
  eocd.writeUInt32LE(centralDirBuffer.length, 12) // size of central directory
  eocd.writeUInt32LE(offset, 16) // offset of central directory
  eocd.writeUInt16LE(0, 20) // comment length

  const finalZip = Buffer.concat([...localChunks, centralDirBuffer, eocd])
  writeFileSync(zipFilePath, finalZip)
}
