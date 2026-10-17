import type { ServerResponse } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'

// 앱(Electron): 빌드한 웹(clients/apps/web/dist)을 API 와 같은 주소로 내보낸다
// 웹 빌드에 나오는 종류만 (늘면 더한다)
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
}
// 화면은 이 주소의 파일 · API 만 쓴다. 인라인 style 속성은 Solid 가 쓴다
const CSP =
  "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"

export async function serveStatic(
  root: string,
  pathname: string,
  res: ServerResponse,
) {
  let file: string
  try {
    file = normalize(
      join(
        root,
        pathname === '/' ? 'index.html' : decodeURIComponent(pathname),
      ),
    )
  } catch {
    return res.writeHead(400).end()
  }
  if (!file.startsWith(normalize(root) + sep)) return res.writeHead(403).end()
  try {
    const body = await readFile(file)
    const html = extname(file) === '.html'
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      // assets/ 는 내용 해시가 붙은 이름이라 바뀌면 이름도 바뀐다
      'Cache-Control': pathname.startsWith('/assets/')
        ? 'max-age=31536000, immutable'
        : 'no-store',
      ...(html && { 'Content-Security-Policy': CSP }),
    })
    res.end(body)
  } catch {
    res.writeHead(404).end()
  }
}
