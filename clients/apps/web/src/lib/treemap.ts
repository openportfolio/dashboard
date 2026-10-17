export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Squarified treemap (Bruls et al. 2000). 값에 비례하는 면적으로 rect 를 채우되,
 * 타일이 정사각형에 가깝도록 짧은 변을 따라 한 줄씩 쌓는다. 큰 값부터 배치된다.
 */
export function squarify<T>(
  items: T[],
  value: (item: T) => number,
  rect: Rect,
): (Rect & { item: T })[] {
  const total = items.reduce((a, t) => a + value(t), 0)
  if (!total) return []
  const scale = (rect.w * rect.h) / total
  const nodes = items
    .map((item) => ({ item, area: value(item) * scale }))
    .filter((n) => n.area > 0)
    .sort((a, b) => b.area - a.area)

  const out: (Rect & { item: T })[] = []
  let { x, y, w, h } = rect
  let row: typeof nodes = []

  // 줄에 넣었을 때 가장 길쭉한 타일의 가로세로비
  const worst = (r: typeof nodes, side: number) => {
    const s = r.reduce((a, n) => a + n.area, 0)
    const max = Math.max(...r.map((n) => n.area))
    const min = Math.min(...r.map((n) => n.area))
    return Math.max(
      (side * side * max) / (s * s),
      (s * s) / (side * side * min),
    )
  }

  const flush = () => {
    const s = row.reduce((a, n) => a + n.area, 0)
    if (w >= h) {
      // 왼쪽에 세로 한 줄
      const rw = s / h
      let cy = y
      for (const n of row) {
        out.push({ x, y: cy, w: rw, h: n.area / rw, item: n.item })
        cy += n.area / rw
      }
      x += rw
      w -= rw
    } else {
      // 위쪽에 가로 한 줄
      const rh = s / w
      let cx = x
      for (const n of row) {
        out.push({ x: cx, y, w: n.area / rh, h: rh, item: n.item })
        cx += n.area / rh
      }
      y += rh
      h -= rh
    }
    row = []
  }

  for (const n of nodes) {
    const side = Math.min(w, h)
    if (row.length && worst([...row, n], side) > worst(row, side)) flush()
    row.push(n)
  }
  if (row.length) flush()
  return out
}
