/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { squarify } from './treemap.ts'

const box = { x: 0, y: 0, w: 600, h: 400 }
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6

test('면적이 값에 비례하고 겹치지 않으며 영역을 꽉 채운다', () => {
  const values = [50, 20, 12, 8, 5, 3, 1, 1]
  const rects = squarify(values, (v) => v, box)
  const total = values.reduce((a, v) => a + v, 0)

  assert.equal(rects.length, values.length)
  for (const r of rects) {
    assert.ok(near((r.w * r.h) / (box.w * box.h), r.item / total))
    assert.ok(r.x >= -1e-6 && r.y >= -1e-6)
    assert.ok(r.x + r.w <= box.w + 1e-6 && r.y + r.h <= box.h + 1e-6)
  }
  for (const [i, a] of rects.entries())
    for (const b of rects.slice(i + 1)) {
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
      assert.ok(ox <= 1e-6 || oy <= 1e-6, '겹침')
    }
})

test('같은 값 4개는 정사각형 영역에서 2×2 정사각형이 된다', () => {
  const rects = squarify([1, 1, 1, 1], (v) => v, { x: 0, y: 0, w: 200, h: 200 })
  for (const r of rects) assert.ok(near(r.w, 100) && near(r.h, 100))
})

test('0 · 빈 입력 · 0 크기 영역은 타일 없음', () => {
  assert.deepEqual(
    squarify([], (v: number) => v, box),
    [],
  )
  assert.deepEqual(
    squarify([0, 0], (v) => v, box),
    [],
  )
  assert.deepEqual(
    squarify([1, 2], (v) => v, { ...box, w: 0 }),
    [],
  )
  assert.equal(squarify([3, 0, 1], (v) => v, box).length, 2)
})
