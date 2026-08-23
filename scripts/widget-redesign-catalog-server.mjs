import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, isAbsolute, relative, resolve } from 'node:path'

const ROUTE_ROOT = '/mockups/widget-redesign'
const MIME_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
})

const sendText = (response, status, body) => {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'text/plain; charset=utf-8',
    'x-content-type-options': 'nosniff',
  })
  response.end(body)
}

function resolveRequestPath(mockupRoot, requestUrl) {
  let pathname
  try {
    pathname = decodeURIComponent(new URL(requestUrl, 'http://127.0.0.1').pathname)
  } catch {
    return null
  }
  if (pathname !== ROUTE_ROOT && !pathname.startsWith(`${ROUTE_ROOT}/`)) return null
  let suffix = pathname.slice(ROUTE_ROOT.length)
  if (suffix === '' || suffix === '/') suffix = '/index.html'
  const target = resolve(mockupRoot, `.${suffix}`)
  const fromRoot = relative(mockupRoot, target)
  if (fromRoot.startsWith('..') || isAbsolute(fromRoot)) return null
  if (!existsSync(target) || !statSync(target).isFile()) return null
  return target
}

export async function startCatalogServer({ repoRoot }) {
  const mockupRoot = resolve(repoRoot, 'mockups', 'widget-redesign')
  const server = createServer((request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendText(response, 405, 'Method not allowed')
      return
    }
    const target = resolveRequestPath(mockupRoot, request.url ?? '/')
    if (!target) {
      sendText(response, 404, 'Catalog resource not found')
      return
    }
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': MIME_TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream',
      'x-content-type-options': 'nosniff',
    })
    if (request.method === 'HEAD') {
      response.end()
      return
    }
    createReadStream(target).pipe(response)
  })

  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', rejectListen)
      resolveListen()
    })
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Catalog server did not bind to TCP.')

  return Object.freeze({
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolveClose, rejectClose) => {
      server.close((error) => error ? rejectClose(error) : resolveClose())
      server.closeAllConnections?.()
    }),
  })
}
