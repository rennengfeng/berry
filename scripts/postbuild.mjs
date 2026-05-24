import fs from 'fs'

const src = '../default/dist'
const dst = '../classic/dist'

try {
  if (fs.existsSync(dst)) fs.rmSync(dst, { recursive: true, force: true })
  if (fs.existsSync(src)) fs.cpSync(src, dst, { recursive: true })
} catch (e) {
  console.log('postbuild:', e.message)
}
