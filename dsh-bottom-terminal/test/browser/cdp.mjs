// Test-only CDP transport: drives an isolated Edge process, not the running DSH GUI.
import { spawn } from 'node:child_process'
export async function launchBrowser(executable, userDataDir) {
  const child = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${userDataDir}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] })
  let stderr = ''
  let socket
  try {
    const endpoint = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error(`No CDP endpoint: ${stderr.slice(-1000)}`)), 15000)
      child.on('error', error => { clearTimeout(timer); reject(error) })
      child.on('exit', code => { clearTimeout(timer); reject(Error(`Browser exited early (${code}): ${stderr.slice(-1000)}`)) })
      child.stderr.on('data', data => { stderr += data; const endpoint = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1]; if (endpoint) { clearTimeout(timer); resolve(endpoint) } })
    })
    socket = new WebSocket(endpoint)
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
    let sequence = 0
    const pending = new Map(), events = []
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data)
      if (!message.id) { if (message.method === 'Runtime.exceptionThrown') events.push(message.params); return }
      const entry = pending.get(message.id); if (!entry) return
      pending.delete(message.id); clearTimeout(entry.timer)
      message.error ? entry.reject(Error(JSON.stringify(message.error))) : entry.resolve(message.result)
    })
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const id = ++sequence
      const timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP timed out: ${method}`)) }, 15000)
      pending.set(id, { resolve, reject, timer })
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    })
    return { send, events, async close() { try { await send('Browser.close') } catch {} socket.close(); if (child.exitCode === null) { await new Promise(resolve => { const timer = setTimeout(() => { child.kill(); resolve() }, 2000); child.once('exit', () => { clearTimeout(timer); resolve() }) }) } } }
  } catch (error) { socket?.close(); child.kill(); throw error }
}
