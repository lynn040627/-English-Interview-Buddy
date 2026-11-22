/*
 * 解锁码本地校验 —— 不做强防破解
 * 码格式 SPK-XXXX-XXXX-CCCC（15 位，不含分隔符）
 * 算法：FNV-1a + 内置盐值
 */

const SALT = 'oral-coach-2026-vibe'

function fnv1a(str) {
  let h = 0x811c9dc5 >>> 0
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

// 有效码：由作者生成，前端内置校验即可
// 真实项目里会有生成器，这里硬编码几个，方便用户体验买断
const VALID_CHECKSUMS = new Set([
  // SPK-2026-ORAL-ZYNS
  fnv1a('SPK2026ORALZYNS' + SALT).toString(16),
  // SPK-TEST-2026-MXH2
  fnv1a('SPKTEST2026MXH2' + SALT).toString(16),
  fnv1a('SPKVIP2026LUCKY' + SALT).toString(16),
  fnv1a('SPK2025FREEEAP' + SALT).toString(16),
  // --- 试用码（2026-11 新增，严格 15 位） ---
  fnv1a('SPK26WINTERTRY0' + SALT).toString(16),   // SPK-26WI-NTER-TRY0
  fnv1a('SPKDEMO26VIP01A' + SALT).toString(16),   // SPK-DEMO-26VI-P01A
  fnv1a('SPK26ORALPRO01X' + SALT).toString(16),   // SPK-26OR-ALPR-O01X
  fnv1a('SPKJOB2026STAR0' + SALT).toString(16),    // SPK-JOB2-026S-TAR0
  fnv1a('SPKIELTS26GOAL0' + SALT).toString(16),    // SPK-IELT-S26G-OAL0
  fnv1a('SPK26FORTUNE99X' + SALT).toString(16),    // SPK-26FO-RTUN-E99X
  fnv1a('SPKNEWYEAR26GOO' + SALT).toString(16),    // SPK-NEWY-EAR2-6GOO
  fnv1a('SPKTRYPRO26NOW0' + SALT).toString(16)     // SPK-TRYP-RO26-NOW0
])

export function normalizeCode(code) {
  if (!code) return ''
  return String(code).toUpperCase().replace(/[^A-Z0-9]/g, '').trim()
}

export function verifyCode(code) {
  const clean = normalizeCode(code)
  if (clean.length !== 15) return false
  if (!clean.startsWith('SPK')) return false
  const hash = fnv1a(clean + SALT).toString(16)
  return VALID_CHECKSUMS.has(hash)
}

export function maskCode(code) {
  const c = normalizeCode(code)
  if (!c) return ''
  // SPK-****-****-XXXX
  return c.slice(0, 3) + '-' + '****-****-' + c.slice(11)
}
