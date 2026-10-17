import { inflateRawSync } from 'node:zlib'

/** zip 안의 파일 하나를 꺼낸다. xlsx 용 최소 구현 (stored·deflate 만, zip64 미지원) */
export function unzip(buf: Buffer, name: string): Buffer | undefined {
  let eocd = buf.length - 22
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--
  if (eocd < 0) throw new Error('zip 형식이 아닙니다')
  const count = buf.readUInt16LE(eocd + 10)
  // 크기·위치는 central directory 기준 (local header 는 data descriptor 를 쓰면 0 일 수 있다)
  let p = buf.readUInt32LE(eocd + 16)
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10)
    const size = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const skip = nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32)
    const local = buf.readUInt32LE(p + 42)
    if (buf.toString('utf8', p + 46, p + 46 + nameLen) === name) {
      const start =
        local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
      const data = buf.subarray(start, start + size)
      return method === 0 ? data : inflateRawSync(data)
    }
    p += 46 + skip
  }
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}
export const decodeXml = (s: string) =>
  s.replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => ENTITIES[e]!)

/** "AB12" → 27 (0 기준 열 번호) */
const colIndex = (ref: string) =>
  [...ref.replace(/\d+$/, '')].reduce(
    (a, c) => a * 26 + c.charCodeAt(0) - 64,
    0,
  ) - 1

/** xlsx 첫 시트 → 문자열 2차원 배열. 빈 셀은 생략되므로 셀 주소로 열 위치를 맞춘다 (빈 행 `<row/>` 는 건너뜀) */
export function readXlsx(buf: Buffer): string[][] {
  const shared = [
    ...(unzip(buf, 'xl/sharedStrings.xml')?.toString() ?? '').matchAll(
      /<si>([\s\S]*?)<\/si>/g,
    ),
  ].map((m) => decodeXml(m[1]!.replace(/<[^>]+>/g, '')))
  const sheet = unzip(buf, 'xl/worksheets/sheet1.xml')?.toString() ?? ''
  return [...sheet.matchAll(/<row\b[^>]*?(?<!\/)>([\s\S]*?)<\/row>/g)].map(
    (row) => {
      const cells: string[] = []
      for (const c of row[1]!.matchAll(
        /<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g,
      )) {
        const [, ref, attrs, body = ''] = c
        const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1]
        const inline = body.match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1]
        cells[colIndex(ref!)] = attrs!.includes('t="s"')
          ? (shared[Number(v)] ?? '')
          : decodeXml(v ?? inline ?? '')
      }
      return Array.from(cells, (x) => x ?? '')
    },
  )
}
