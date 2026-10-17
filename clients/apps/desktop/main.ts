// 데스크톱 앱: API 서버를 이 프로세스에서 띄우고, 빌드한 웹을 같은 주소로 연다
import { app, BrowserWindow, nativeTheme, safeStorage, shell } from 'electron'
import { join } from 'node:path'

// 한 번에 하나만 (토큰 · 기록 DB 를 두 프로세스가 나눠 쓰지 않게)
if (!app.requestSingleInstanceLock()) app.quit()
else {
  // 서버 설정은 서버 코드를 불러오기 전에 (config.ts 가 불러올 때 읽는다)
  process.env.DATA_DIR ??= app.getPath('userData')
  process.env.WEB_DIR ??= app.isPackaged
    ? join(process.resourcesPath, 'web')
    : join(import.meta.dirname, '../../web/dist')
  const server = import('../../../server/src/app.ts')
  let origin = ''

  const open = () => {
    const win = new BrowserWindow({
      width: 1440,
      height: 960,
      minWidth: 380,
      minHeight: 600,
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#000000' : '#f2f2f7',
      autoHideMenuBar: true,
      // contextIsolation 켜짐 · nodeIntegration 꺼짐은 기본값
      webPreferences: { sandbox: true },
    })
    // 외부 링크(토스 Open API 안내 등)는 기본 브라우저로, 앱 창은 이 주소 밖으로 안 나간다
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://')) void shell.openExternal(url)
      return { action: 'deny' }
    })
    win.webContents.on('will-navigate', (e, url) => {
      if (new URL(url).origin === origin) return
      e.preventDefault()
      if (url.startsWith('https://')) void shell.openExternal(url)
    })
    void win.loadURL(origin)
  }

  // ESM 진입점에서 whenReady 를 맨 위에서 await 하면 안 된다 (ready 가 모듈 평가가 끝나야 와서 서로 기다린다)
  void app.whenReady().then(async () => {
    const { listen, useSealer } = await server
    // 토스 Secret 은 OS 키체인(macOS 키체인 · Windows DPAPI)으로 암호화해 저장한다
    if (safeStorage.isEncryptionAvailable())
      useSealer({
        seal: (s) => safeStorage.encryptString(s).toString('base64'),
        open: (s) => safeStorage.decryptString(Buffer.from(s, 'base64')),
      })
    origin = `http://127.0.0.1:${await listen(0)}`
    open()
  })
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return open()
    if (win.isMinimized()) win.restore()
    win.focus()
  })
  // macOS: 창을 닫아도 앱은 남고 독을 누르면 다시 연다
  app.on(
    'activate',
    () => origin && !BrowserWindow.getAllWindows().length && open(),
  )
  app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit())
}
