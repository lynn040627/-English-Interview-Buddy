/*
 * PDF 导出 —— jsPDF + NotoSansSC 中文字体
 * 字体文件由构建时放到 public/fonts/NotoSansSC-Regular.ttf
 * 前端运行时 fetch 字体并 embed 到 jsPDF，确保中文不乱码
 *
 * 视觉：淡彩手账笔记风（奶油米底 + 薄荷标题 + 柔和圆角框 + 手绘点缀）
 * 只改绘制样式，不改导出参数与调用方式
 */
import jsPDF from 'jspdf'

let _fontBytesPromise = null

async function loadFontBytes() {
  if (_fontBytesPromise) return _fontBytesPromise
  _fontBytesPromise = (async () => {
    const res = await fetch('./fonts/NotoSansSC-Regular.ttf')
    if (!res.ok) throw new Error('字体文件加载失败，请重新构建项目')
    const buf = await res.arrayBuffer()
    return new Uint8Array(buf)
  })()
  return _fontBytesPromise
}

function toBase64(bytes) {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export async function buildPdf({ title, sections, filename }) {
  // sections: [{ heading, body }]
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 40
  const contentW = pageW - margin * 2
  const lineH = 16

  // 手账配色
  const C_BG = [255, 249, 240]        // 奶油米白
  const C_CARD = [255, 253, 248]      // 便签纸
  const C_BORDER = [238, 224, 209]    // 柔和描边
  const C_TEXT = [70, 63, 58]         // 正文
  const C_MINT_DEEP = [79, 141, 133]  // 薄荷深（标题）
  const C_MINT_SOFT = [230, 243, 241] // 薄荷浅（色块）
  const C_APRICOT = [255, 241, 228]   // 淡奶杏
  const C_LAVENDER = [244, 241, 252]  // 淡薰衣草
  const C_FAINT = [140, 130, 120]     // 次要文字

  // 页面底层：纸纹线 + 奶油底 + 角落淡彩晕染
  function paintPage() {
    doc.setFillColor(...C_BG)
    doc.rect(0, 0, pageW, pageH, 'F')
    doc.setDrawColor(240, 236, 230)
    doc.setLineWidth(0.5)
    for (let y = 84; y < pageH - 30; y += 26) {
      doc.line(margin, y, pageW - margin, y)
    }
    doc.setFillColor(...C_MINT_SOFT)
    doc.circle(pageW - 34, 40, 30, 'F')
    doc.setFillColor(...C_APRICOT)
    doc.circle(pageW - 76, 66, 13, 'F')
    doc.setFillColor(...C_LAVENDER)
    doc.circle(pageW - 26, 84, 7, 'F')
  }
  paintPage()

  // embed 中文字体
  const fontBytes = await loadFontBytes()
  const b64 = toBase64(fontBytes)
  doc.addFileToVFS('NotoSansSC-Regular.ttf', b64)
  doc.addFont('NotoSansSC-Regular.ttf', 'NotoSansSC', 'normal')
  doc.setFont('NotoSansSC', 'normal')

  let y = 58

  // 大标题（薄荷深色）
  doc.setFontSize(20)
  doc.setTextColor(...C_MINT_DEEP)
  const titleLines = doc.splitTextToSize(title || '英语口语练习导出', contentW)
  doc.text(titleLines, margin, y)
  y += titleLines.length * 22 + 6

  // 元信息 + 手绘虚线
  doc.setFontSize(10)
  doc.setTextColor(...C_FAINT)
  const meta = `导出时间：${new Date().toLocaleString()}`
  doc.text(meta, margin, y)
  y += 14
  doc.setDrawColor(...C_MINT_SOFT)
  doc.setLineWidth(1.2)
  doc.setLineDashPattern([3, 4], 0)
  doc.line(margin, y, pageW - margin, y)
  doc.setLineDashPattern([], 0)
  y += 20

  // 正文
  doc.setFontSize(11)
  doc.setTextColor(...C_TEXT)
  for (const sec of sections) {
    if (y > pageH - 80) { doc.addPage(); paintPage(); y = 58 }

    if (sec.heading) {
      doc.setFontSize(13)
      const h = doc.splitTextToSize(sec.heading, contentW - 22)
      const chipH = h.length * 17 + 12
      // 淡彩圆角色块作为标题底
      doc.setFillColor(...C_MINT_SOFT)
      doc.setDrawColor(...C_BORDER)
      doc.setLineWidth(0.8)
      doc.roundedRect(margin - 6, y - 12, contentW + 12, chipH, 9, 9, 'FD')
      doc.setTextColor(...C_MINT_DEEP)
      doc.text(h, margin + 6, y)
      y += chipH + 8
      doc.setTextColor(...C_TEXT)
      doc.setFontSize(11)
    }

    const body = String(sec.body || '').trim()
    if (body) {
      const lines = doc.splitTextToSize(body, contentW - 4)
      for (const ln of lines) {
        if (y > pageH - 50) { doc.addPage(); paintPage(); y = 58 }
        doc.setTextColor(...C_TEXT)
        doc.text(ln, margin + 2, y)
        y += lineH
      }
      y += 12
    }
  }

  // 页脚小水彩点
  const total = doc.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    doc.setFillColor(...C_MINT_SOFT)
    doc.circle(margin + 10, pageH - 26, 3, 'F')
    doc.setFillColor(...C_APRICOT)
    doc.circle(margin + 22, pageH - 26, 3, 'F')
    doc.setFillColor(...C_LAVENDER)
    doc.circle(margin + 34, pageH - 26, 3, 'F')
    doc.setFontSize(9)
    doc.setTextColor(...C_FAINT)
    doc.text(`${i} / ${total}`, pageW - margin - 20, pageH - 24)
  }

  const safeName = (filename || 'oral-export').replace(/[\\/:*?"<>|]/g, '_')
  doc.save(`${safeName}.pdf`)
}
