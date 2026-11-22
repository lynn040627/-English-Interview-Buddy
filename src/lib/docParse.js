/*
 * 前端文档解析：PDF / DOCX / TXT
 * 两个重依赖（pdfjs-dist、jszip）都走动态 import，不进入首屏 bundle
 */

// 将 PDF 的 textContent 按行还原为纯文本
function joinPdfItems(items) {
  let out = ''
  let lastY = null
  for (const it of items) {
    if (!it.str) continue
    const y = it.transform ? it.transform[5] : null
    if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) out += '\n'
    out += it.str
    // 英文单词之间自动补空格
    if (it.str && !/\s$/.test(it.str)) out += ' '
    lastY = y
  }
  return out
}

async function parsePdf(file) {
  const pdfjs = await import('pdfjs-dist')
  const workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc

  const buf = await file.arrayBuffer()
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise
  let text = ''
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const tc = await page.getTextContent()
    text += joinPdfItems(tc.items) + '\n'
  }
  return text
}

function decodeXml(s) {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

async function parseDocx(file) {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const entry = zip.file('word/document.xml')
  if (!entry) throw new Error('这不是有效的 .docx 文件')
  const xml = await entry.async('string')
  // 按段落拆分，取出每个 <w:t> 文本
  const paragraphs = xml.split(/<\/w:p>/)
  const lines = paragraphs.map(p => {
    const texts = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map(m => decodeXml(m[1]))
    return texts.join('')
  }).filter(s => s.trim())
  return lines.join('\n')
}

/**
 * 从上传文件提取纯文本
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function extractTextFromFile(file) {
  const name = (file.name || '').toLowerCase()
  if (name.endsWith('.pdf')) return parsePdf(file)
  if (name.endsWith('.docx')) return parseDocx(file)
  if (name.endsWith('.doc')) {
    throw new Error('不支持旧版 .doc，请另存为 .docx 或 PDF 后再上传')
  }
  // txt / md / 其它纯文本
  return await file.text()
}
