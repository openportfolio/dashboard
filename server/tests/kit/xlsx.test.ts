import assert from 'node:assert/strict'
import { test } from 'node:test'
import { deflateRawSync } from 'node:zlib'
import { readXlsx, unzip } from '../../src/kit/xlsx.ts'

// 최소 zip 작성기 (테스트 전용): deflate 로 압축, central directory 포함
function zip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const [name, text] of Object.entries(files)) {
    const data = deflateRawSync(Buffer.from(text))
    const n = Buffer.from(name)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(8, 8)
    local.writeUInt16LE(n.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(8, 10)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt16LE(n.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, n, data)
    centrals.push(central, n)
    offset += 30 + n.length + data.length
  }
  const cd = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(Object.keys(files).length, 10)
  eocd.writeUInt32LE(cd.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, eocd])
}

test('xlsx: 공유 문자열 · 숫자 · 빈 셀 건너뛴 열 위치 · 엔티티', () => {
  const buf = zip({
    'xl/sharedStrings.xml':
      '<sst><si><t>Ticker</t></si><si><t>AT&amp;T INC</t></si><si><r><t>T</t></r></si></sst>',
    'xl/worksheets/sheet1.xml':
      '<worksheet><sheetData>' +
      '<row r="1"><c r="A1" t="s"><v>0</v></c></row>' +
      '<row r="2" spans="1:4"/>' +
      '<row r="3"><c r="A3" t="s"><v>1</v></c><c r="C3" t="s"><v>2</v></c><c r="D3"><v>1.5</v></c></row>' +
      '</sheetData></worksheet>',
  })
  assert.deepEqual(readXlsx(buf), [['Ticker'], ['AT&T INC', '', 'T', '1.5']])
})

test('zip: 없는 항목은 undefined, zip 아니면 에러', () => {
  assert.equal(unzip(zip({ a: 'x' }), 'b'), undefined)
  assert.equal(unzip(zip({ a: 'hello' }), 'a')!.toString(), 'hello')
  assert.throws(() => unzip(Buffer.from('not a zip at all, definitely'), 'a'))
})
