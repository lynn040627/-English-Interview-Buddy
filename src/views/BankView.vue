<!--
  Tab4 · 个人题库与收藏
  - 固定题型标签：逻辑思考型 / 业务型 / 常规结构面试型 / 压力型；支持自定义新增
  - 手动新增 → AI 判定（tags / difficulty / fit_score / reason）→ fit ≥ 3 自动入库
  - PDF/Word 导入（纯文本）→ 逐题走 AI 判定
  - 收藏手册：句子 / 专业表达 / 范文片段，带来源标记，搜索
  - PDF 导出：jspdf + NotoSansSC 中文字体
  - 一期不预置内置题；空状态引导
-->
<script setup>
import { ref, computed } from 'vue'
import { state, uid, FIXED_TAGS, checkFeature } from '../store/state.js'
import { chat } from '../lib/llm.js'
import { parseJson, normalizeEval } from '../lib/parse.js'
import { buildQuestionEvalPrompt } from '../lib/prompts.js'
import { toast } from '../composables/useUi.js'
import { splitEnglishQuestions } from '../lib/text.js'
import { PRESET_QUESTIONS } from '../lib/presetBank.js'
import { buildPdf } from '../lib/pdf.js'
import SpeakPlayer from '../components/SpeakPlayer.vue'
import RawFallback from '../components/RawFallback.vue'
import UpgradeModal from '../components/UpgradeModal.vue'
import ResultCards from '../components/ResultCards.vue'

const activeSub = ref('bank')   // bank / favorites / history / import / export

// ---------- 手动新增题目 ----------
const newQ = ref('')
const newQEval = ref(null)
const newQRaw = ref('')
const newQError = ref(null)
const loadingEval = ref(false)

async function evalNewQuestion() {
  if (!isConfigured()) { toast.warn('请先配置 API Key'); return }
  if (!newQ.value.trim()) return
  loadingEval.value = true
  newQEval.value = null
  newQError.value = null
  try {
    const raw = await chat(buildQuestionEvalPrompt({
      text: newQ.value,
      existingTags: [...FIXED_TAGS, ...state.customTags]
    }), { system: '你是面试题库编辑，严格按 JSON 输出。', maxTokens: 200 })
    newQRaw.value = raw
    const p = parseJson(raw)
    if (!p.ok) { newQError.value = { raw }; return }
    newQEval.value = normalizeEval(p.data)
  } catch (e) { toast.err('评估失败：' + e.message) }
  finally { loadingEval.value = false }
}

function confirmAddQuestion() {
  if (!newQEval.value) return
  // fit < 3 也允许入库（用户确认）
  state.questionBank.push({
    id: uid(),
    content: newQ.value.trim(),
    tags: newQEval.value.tags,
    difficulty: newQEval.value.difficulty,
    createdAt: Date.now()
  })
  toast.ok('已加入题库 ✨')
  newQ.value = ''
  newQEval.value = null
}

// ---------- 自定义标签 ----------
const newTag = ref('')
function addCustomTag() {
  const t = newTag.value.trim()
  if (!t) return
  if ([...FIXED_TAGS, ...state.customTags].includes(t)) { toast.warn('标签已存在'); return }
  state.customTags.push(t)
  newTag.value = ''
  toast.ok('已添加')
}
function removeCustomTag(t) {
  state.customTags = state.customTags.filter(x => x !== t)
}

// ---------- 导入 PDF / Word ----------
const importText = ref('')
const importLoading = ref(false)
const importResults = ref([])   // [{ content, eval, error }]

// 简化版：把用户选的文件读取为纯文本
function handleImportFile(e) {
  const file = e.target.files?.[0]
  if (!file) return
  // txt / md 直接读；pdf/docx 提示用户先转纯文本（前端不引重型解析库）
  const ext = file.name.split('.').pop().toLowerCase()
  if (ext === 'txt' || ext === 'md') {
    const reader = new FileReader()
    reader.onload = () => { importText.value = String(reader.result) }
    reader.readAsText(file)
  } else {
    toast.warn('为保持包体轻量，暂不直接解析 PDF/Word。请用 Word/WPS「另存为 .txt」后粘贴到下方文本框，会自动逐题处理。')
  }
}

async function runImport() {
  if (!checkFeature('pdfImport')) { upgradeOpen.value = true; return }
  if (!isConfigured()) { toast.warn('请先配置 API Key'); return }
  const questions = splitEnglishQuestions(importText.value)
  if (!questions.length) { toast.warn('未检测到英文问题，请检查文本格式'); return }
  importLoading.value = true
  importResults.value = []
  for (const q of questions) {
    try {
      const raw = await chat(buildQuestionEvalPrompt({
        text: q,
        existingTags: [...FIXED_TAGS, ...state.customTags]
      }), { system: '你是面试题库编辑，严格按 JSON 输出。', maxTokens: 200 })
      const p = parseJson(raw)
      if (!p.ok) { importResults.value.push({ content: q, error: p.error, raw }); continue }
      importResults.value.push({ content: q, eval: normalizeEval(p.data) })
    } catch (e) {
      importResults.value.push({ content: q, error: e.message })
    }
  }
  toast.ok(`解析完成：${importResults.value.filter(r => r.eval).length}/${importResults.value.length} 道可入库`)
  importLoading.value = false
}

function confirmImportAll() {
  let added = 0
  for (const r of importResults.value) {
    if (r.eval) {
      state.questionBank.push({
        id: uid(), content: r.content,
        tags: r.eval.tags, difficulty: r.eval.difficulty,
        createdAt: Date.now()
      })
      added++
    }
  }
  toast.ok(`已批量入库 ${added} 道`)
  importText.value = ''
  importResults.value = []
}

// ---------- 收藏手册 ----------
const favSearch = ref('')
const favFilter = ref('all')
const filteredFavs = computed(() => {
  return state.favorites.filter(f => {
    if (favFilter.value !== 'all' && f.type !== favFilter.value) return false
    if (favSearch.value && !(
      (f.text || '').toLowerCase().includes(favSearch.value.toLowerCase()) ||
      (f.source || '').toLowerCase().includes(favSearch.value.toLowerCase())
    )) return false
    return true
  })
})
function removeFav(id) {
  const i = state.favorites.findIndex(f => f.id === id)
  if (i >= 0) state.favorites.splice(i, 1)
}
function addManualFav() {
  const t = prompt('输入要收藏的文本：')
  if (!t) return
  state.favorites.push({
    id: uid(), type: 'expression', text: t.trim(), source: '手动收藏', createdAt: Date.now()
  })
  toast.ok('已收藏')
}

// ---------- 题库筛选 ----------
const bankFilter = ref('')
const filteredBank = computed(() => {
  return state.questionBank.filter(q => {
    if (!bankFilter.value) return true
    const k = bankFilter.value.toLowerCase()
    return q.content.toLowerCase().includes(k) || (q.tags || []).some(t => t.toLowerCase().includes(k))
  })
})
// 内置预置题库（只读）：独立搜索，不与个人题库混存
const presetFilter = ref('')
const filteredPreset = computed(() => {
  const k = presetFilter.value.trim().toLowerCase()
  if (!k) return PRESET_QUESTIONS
  return PRESET_QUESTIONS.filter(q =>
    q.content.toLowerCase().includes(k) || (q.tags || []).some(t => t.toLowerCase().includes(k))
  )
})
function removeBank(id) {
  const i = state.questionBank.findIndex(q => q.id === id)
  if (i >= 0) state.questionBank.splice(i, 1)
}

// ---------- PDF 导出 ----------
const exportBankSel = ref(new Set())
const exportFavSel = ref(new Set())
function toggleBankExport(id) {
  if (exportBankSel.value.has(id)) exportBankSel.value.delete(id)
  else exportBankSel.value.add(id)
}
function toggleFavExport(id) {
  if (exportFavSel.value.has(id)) exportFavSel.value.delete(id)
  else exportFavSel.value.add(id)
}
// 背诵范文（面试模拟 / 深挖旁路生成）勾选导出
const allRecites = computed(() => [
  ...(state.session.recites || []).map(r => ({ ...r, group: '面试模拟' })),
  ...(state.deepDive.recites || []).map(r => ({
    ...r,
    group: r.source === 'intro' ? '自我介绍深挖' : '简历深挖'
  }))
])
const exportReciteSel = ref(new Set())
function toggleReciteExport(id) {
  if (exportReciteSel.value.has(id)) exportReciteSel.value.delete(id)
  else exportReciteSel.value.add(id)
}
async function doExport() {
  if (!checkFeature('pdfExport')) { upgradeOpen.value = true; return }
  const bank = state.questionBank.filter(q => exportBankSel.value.has(q.id))
  const favs = state.favorites.filter(f => exportFavSel.value.has(f.id))
  const recites = allRecites.value.filter(r => exportReciteSel.value.has(r.id))
  if (!bank.length && !favs.length && !recites.length) { toast.warn('请勾选要导出的条目'); return }
  const sections = []
  if (bank.length) {
    sections.push({ heading: '📚 题库精选', body: bank.map(q => `[${q.tags?.join('/') || '未分类'} · Difficulty ${q.difficulty || '-'}]\n${q.content}`).join('\n\n') })
  }
  if (favs.length) {
    sections.push({ heading: '⭐ 收藏手册', body: favs.map(f => `【${f.source || '—'}】\n${f.text}`).join('\n\n') })
  }
  if (recites.length) {
    sections.push({ heading: '📜 背诵范文', body: recites.map(r => `【${r.group} · 题目】${r.question}\n${r.text}`).join('\n\n') })
  }
  try {
    await buildPdf({ title: '英语口语面试 · 我的题库', sections, filename: `oral-bank-${Date.now()}` })
    toast.ok('PDF 已下载')
  } catch (e) {
    toast.err('导出失败：' + e.message)
  }
}

const upgradeOpen = ref(false)
function goSettings() {
  upgradeOpen.value = false
  window.dispatchEvent(new CustomEvent('spk:navigate', { detail: 'settings' }))
}

// ---------- 历史记录（按来源分类，四类不混在一起） ----------
const historyFilter = ref('resume')
const HISTORY_FILTERS = [
  { k: 'resume', label: '🔎 简历深挖' },
  { k: 'intro', label: '🗣️ 自我介绍深挖' },
  { k: 'mock', label: '🎙️ 面试模拟题' },
  { k: 'read', label: '📖 英文文本精读' }
]
const mockHistory = computed(() => {
  const out = []
  for (const s of state.allSessions) {
    for (const t of (s.turns || [])) {
      out.push({
        id: t.id,
        question: t.question,
        transcript: t.transcript,
        total: t.total,
        weak_tags: t.weak_tags,
        createdAt: t.createdAt,
        scene: s.scene,
        difficulty: s.difficulty
      })
    }
  }
  return out.sort((a, b) => b.createdAt - a.createdAt)
})
const filteredHistory = computed(() => {
  if (historyFilter.value === 'resume') return state.deepDiveHistory.filter(h => h.source === 'resume')
  if (historyFilter.value === 'intro') return state.deepDiveHistory.filter(h => h.source === 'intro')
  if (historyFilter.value === 'mock') return mockHistory.value
  return state.readHistory
})
const expandedHistory = ref('')
function removeHistoryItem(item) {
  if (historyFilter.value === 'read') {
    const i = state.readHistory.findIndex(h => h.id === item.id)
    if (i >= 0) state.readHistory.splice(i, 1)
    return
  }
  if (historyFilter.value === 'resume' || historyFilter.value === 'intro') {
    const i = state.deepDiveHistory.findIndex(h => h.id === item.id)
    if (i >= 0) state.deepDiveHistory.splice(i, 1)
    const j = state.deepDive.turns.findIndex(t => t.id === item.id)
    if (j >= 0) state.deepDive.turns.splice(j, 1)
    return
  }
  // 面试模拟：从所属 session 中删除
  for (const s of state.allSessions) {
    const i = (s.turns || []).findIndex(t => t.id === item.id)
    if (i >= 0) { s.turns.splice(i, 1); break }
  }
}

function isConfigured() { return state.settings.apiKey }
</script>

<template>
  <div>
    <header class="page-head">
      <div class="h1-hand">题库与收藏</div>
      <div class="page-head-en">Question Bank &amp; Favorites</div>
      <p>手动新增 / 文档导入 · AI 自动评估入库 · PDF 一键导出。<span class="page-desc-en">Add manually or import files, AI auto-assessment, one-click PDF export.</span></p>
    </header>

    <!-- 子 Tab -->
    <div class="tab-bar" style="position: static; border-bottom: 1px solid var(--border); background: transparent">
      <div class="tab-bar-inner">
        <div
          v-for="s in [
            { k: 'bank', label: '📚 个人题库' },
            { k: 'favorites', label: '⭐ 收藏手册' },
            { k: 'history', label: '🕘 历史记录' },
            { k: 'import', label: '📥 文档导入' },
            { k: 'export', label: '📄 PDF 导出' }
          ]" :key="s.k"
          class="tab-item"
          :class="{ active: activeSub === s.k }"
          @click="activeSub = s.k"
        >{{ s.label }}</div>
      </div>
    </div>

    <!-- ============ 题库 ============ -->
    <section v-if="activeSub === 'bank'" style="padding-top: 12px" class="stack">
      <!-- 手动新增 -->
      <div class="card">
        <div class="h3-hand" style="margin-top: 0">➕ 手动新增题目<span class="sub-en">Add Question</span></div>
        <textarea
          v-model="newQ"
          class="textarea"
          rows="3"
          placeholder="粘贴一道英文面试题…"
        ></textarea>
        <div class="row" style="margin-top: 8px">
          <button class="btn btn-ghost" :disabled="loadingEval || !newQ.trim()" @click="evalNewQuestion()">
            <span v-if="loadingEval"><span class="spinner"></span> 评估中…<span class="btn-en">Evaluating…</span></span>
            <span v-else>🤖 AI 评估<span class="btn-en">Evaluate</span></span>
          </button>
          <button class="btn btn-primary" :disabled="!newQ.trim()" @click="confirmAddQuestion()">直接入库<span class="btn-en">Add Directly</span></button>
        </div>
        <div v-if="newQEval" style="margin-top: 10px">
          <div class="row" style="flex-wrap: wrap; gap: 6px">
            <span v-for="t in newQEval.tags" :key="t" class="tag">{{ t }}</span>
            <span class="tag tag-ghost">Difficulty {{ newQEval.difficulty }}/5</span>
            <span class="tag" :class="newQEval.fit_score >= 3 ? '' : 'tag-warn'">fit_score {{ newQEval.fit_score }}/5</span>
          </div>
          <div class="muted" style="margin-top: 4px">{{ newQEval.reason }}</div>
          <button
            class="btn btn-primary" style="margin-top: 8px"
            :disabled="newQEval.fit_score < 3"
            @click="confirmAddQuestion()"
          >{{ newQEval.fit_score >= 3 ? '✅ 确认入库' : '评分低于 3，请编辑后重试' }}<span class="btn-en">{{ newQEval.fit_score >= 3 ? 'Confirm' : 'Retry' }}</span></button>
        </div>
        <RawFallback v-if="newQError" :raw="newQError.raw" @retry="evalNewQuestion" />
      </div>

      <!-- 自定义标签 -->
      <div class="card">
        <div class="h3-hand" style="margin-top: 0">🏷️ 标签管理<span class="sub-en">Tag Management</span></div>
        <div class="row" style="margin-top: 6px">
          <span v-for="t in FIXED_TAGS" :key="t" class="tag tag-ghost">{{ t }}</span>
          <span v-for="t in state.customTags" :key="t" class="tag" style="display: inline-flex; align-items: center">
            {{ t }}
            <button class="btn-link" style="padding: 0 2px; color: var(--danger)" @click="removeCustomTag(t)">×</button>
          </span>
        </div>
        <div class="row" style="margin-top: 10px">
          <input v-model="newTag" class="input" style="flex: 1" placeholder="新增自定义标签" @keyup.enter="addCustomTag" />
          <button class="btn btn-ghost" @click="addCustomTag">添加<span class="btn-en">Add</span></button>
        </div>
      </div>

      <!-- 内置预置题库（只读，不可编辑删除；与个人题库隔离，抽题时合并为候选池） -->
      <div class="card">
        <div class="row-spaced" style="margin-bottom: 8px">
          <span class="h3-hand" style="margin: 0">📖 内置预置题库（{{ PRESET_QUESTIONS.length }} · 只读）<span class="sub-en">Preset Bank</span></span>
          <input v-model="presetFilter" class="input" style="width: 40%; min-width: 140px" placeholder="搜索内置题目/标签" />
        </div>
        <div class="faint" style="margin-bottom: 8px">来源：外企面试题库 · 场景：职场面试。内置题不可编辑删除；面试抽题候选池 = 内置题库 + 个人题库。</div>
        <details>
          <summary style="cursor: pointer; padding: 4px 0">展开 / 收起题目列表（{{ filteredPreset.length }}）</summary>
          <div v-for="q in filteredPreset" :key="q.id" class="card card-soft note-card" style="margin: 8px 0 0; padding: 10px 12px">
            <div class="en-body">{{ q.content }}</div>
            <div class="row" style="margin-top: 6px; flex-wrap: wrap">
              <span v-for="t in q.tags" :key="t" class="tag tag-ghost">{{ t }}</span>
              <span class="tag tag-ghost">Difficulty {{ q.difficulty }}</span>
              <span class="tag">内置 · 只读</span>
            </div>
          </div>
        </details>
      </div>

      <!-- 题库列表 -->
      <div v-if="!state.questionBank.length" class="empty-state">
        <div style="font-size: 56px">📚</div>
        <div class="h2-hand">题库还是空的<span class="sub-en">Bank is empty</span></div>
        <p>手动加题或到「📥 文档导入」批量导入。</p>
      </div>

      <div v-else class="card">
        <div class="row-spaced" style="margin-bottom: 10px">
          <span class="h3-hand" style="margin: 0">全部题库（{{ state.questionBank.length }}）<span class="sub-en">All Questions</span></span>
          <input v-model="bankFilter" class="input" style="width: 40%; min-width: 140px" placeholder="搜索题目/标签" />
        </div>
        <div v-for="q in filteredBank" :key="q.id" class="card card-soft note-card" style="margin-bottom: 8px; padding: 10px 12px">
          <div class="row-spaced">
            <div style="flex: 1; cursor: pointer" @click="toggleBankExport(q.id)">
              <input type="checkbox" :checked="exportBankSel.has(q.id)" style="margin-right: 6px" />
              <span class="en-body">{{ q.content }}</span>
            </div>
            <button class="btn-link" style="color: var(--danger)" @click="removeBank(q.id)">删除<span class="btn-en">Delete</span></button>
          </div>
          <div class="row" style="margin-top: 6px; flex-wrap: wrap">
            <span v-for="t in (q.tags || [])" :key="t" class="tag tag-ghost">{{ t }}</span>
            <span class="tag tag-ghost">Difficulty {{ q.difficulty || '-' }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- ============ 收藏 ============ -->
    <section v-if="activeSub === 'favorites'" style="padding-top: 12px" class="stack">
      <div class="card">
        <div class="h3-hand" style="margin-top: 0">⭐ 收藏手册（{{ state.favorites.length }}）<span class="sub-en">Favorites</span></div>
        <div class="row" style="margin-top: 8px; flex-wrap: wrap">
          <button class="btn btn-ghost" @click="addManualFav()">+ 手动收藏<span class="btn-en">Favorite</span></button>
          <input v-model="favSearch" class="input" style="flex: 1; min-width: 140px" placeholder="搜索收藏" />
          <select v-model="favFilter" class="select" style="width: auto">
            <option value="all">全部</option>
            <option value="sample">范文</option>
            <option value="expression">表达</option>
            <option value="sentence">句子</option>
          </select>
        </div>
      </div>
      <div v-if="!filteredFavs.length" class="empty-state">
        <div style="font-size: 56px">⭐</div>
        <div class="h2-hand">收藏夹为空<span class="sub-en">No favorites</span></div>
        <p>在「面试模拟」「自我介绍打磨」里随时点 ⭐ 收藏。</p>
      </div>
      <div
        v-for="(f, i) in filteredFavs" :key="f.id"
        class="card card-soft note-card"
        :class="i % 3 === 0 ? 'note-sakura' : i % 3 === 1 ? 'note-lavender' : ''"
      >
        <div class="row-spaced">
          <span class="tag" style="flex-shrink: 0">{{ f.type }}</span>
          <SpeakPlayer :text="f.text" size="sm" label="🔊" />
          <button class="btn-link" style="color: var(--danger); flex-shrink: 0" @click="removeFav(f.id)">删除<span class="btn-en">Delete</span></button>
        </div>
        <p class="en-body" style="margin: 6px 0 0; white-space: pre-wrap">{{ f.text }}</p>
        <div class="faint">来源：{{ f.source || '—' }}</div>
      </div>
    </section>

    <!-- ============ 导入 ============ -->
    <section v-if="activeSub === 'import'" style="padding-top: 12px" class="stack">
      <div class="card">
        <div class="h3-hand" style="margin-top: 0">📥 从文档导入<span class="sub-en">Import from Documents</span></div>
        <p class="muted">请先将 PDF / Word 另存为 <b>.txt</b>（保持段落分隔），或直接粘贴到下方。每道题以英文问号结尾会自动识别。</p>
        <input type="file" accept=".txt,.md" @change="handleImportFile" style="margin-top: 8px" />
        <textarea
          v-model="importText"
          class="textarea" rows="8"
          style="margin-top: 8px; font-family: monospace"
          placeholder="粘贴纯文本…"
        ></textarea>
        <button class="btn btn-primary btn-block" style="margin-top: 10px" :disabled="importLoading || !importText.trim()" @click="runImport()">
          <span v-if="importLoading"><span class="spinner"></span> 逐题评估中…<span class="btn-en">Evaluating…</span></span>
          <span v-else>🤖 批量评估<span class="btn-en">Batch Evaluate</span></span>
        </button>
      </div>

      <div v-if="importResults.length" class="card">
        <div class="h3-hand" style="margin-top: 0">评估结果<span class="sub-en">Results</span></div>
        <div v-for="(r, i) in importResults" :key="i" class="card card-soft" style="margin-top: 8px">
          <div class="en-body" style="white-space: pre-wrap">{{ r.content }}</div>
          <template v-if="r.eval">
            <div class="row" style="margin-top: 6px; flex-wrap: wrap">
              <span v-for="t in r.eval.tags" :key="t" class="tag">{{ t }}</span>
              <span class="tag tag-ghost">Difficulty {{ r.eval.difficulty }}/5</span>
              <span class="tag" :class="r.eval.fit_score >= 3 ? '' : 'tag-warn'">fit_score {{ r.eval.fit_score }}/5</span>
            </div>
            <div class="muted">{{ r.eval.reason }}</div>
          </template>
          <div v-else class="tag tag-danger">无法评估：{{ r.error }}</div>
        </div>
        <button class="btn btn-primary btn-block" style="margin-top: 10px" @click="confirmImportAll()">✅ 批量入库 fit ≥ 3<span class="btn-en">Batch Add</span></button>
      </div>
    </section>

    <!-- ============ 历史记录（按来源分类） ============ -->
    <section v-if="activeSub === 'history'" style="padding-top: 12px" class="stack">
      <div class="row" style="flex-wrap: wrap">
        <button
          v-for="f in HISTORY_FILTERS" :key="f.k"
          class="btn" :class="historyFilter === f.k ? 'btn-primary' : 'btn-ghost'"
          @click="historyFilter = f.k; expandedHistory = ''"
        >{{ f.label }}</button>
      </div>

      <div v-if="!filteredHistory.length" class="empty-state">
        <div style="font-size: 48px">🗂️</div>
        <div class="h3-hand">这一类还没有记录<span class="sub-en">No records yet</span></div>
        <p class="muted">对应的练习完成后会自动归档到这里。</p>
      </div>

      <div v-for="(h, i) in filteredHistory" :key="h.id" class="card note-card">
        <!-- 深挖 / 面试模拟 -->
        <template v-if="historyFilter !== 'read'">
          <div class="row-spaced" style="align-items: flex-start">
            <div style="flex: 1">
              <div class="faint">
                {{ new Date(h.createdAt).toLocaleString() }}
                <span v-if="h.scene"> · {{ h.scene }}</span>
                <span v-if="h.difficulty"> · Difficulty {{ h.difficulty }}</span>
              </div>
              <div style="font-weight: 600; margin-top: 4px">{{ h.question }}</div>
            </div>
            <span class="tag">{{ h.total?.toFixed?.(1) ?? '-' }}</span>
          </div>
          <div class="row" style="margin-top: 8px">
            <button class="btn-link" @click="expandedHistory = expandedHistory === h.id ? '' : h.id">
              {{ expandedHistory === h.id ? '收起' : '查看作答与批改' }}<span class="btn-en">{{ expandedHistory === h.id ? 'Collapse' : 'View' }}</span>
            </button>
            <button class="btn-link" style="color: var(--danger)" @click="removeHistoryItem(h)">删除<span class="btn-en">Delete</span></button>
          </div>
          <div v-if="expandedHistory === h.id" style="margin-top: 8px">
            <div class="muted">我的作答</div>
            <div style="white-space: pre-wrap">{{ h.transcript }}</div>
            <ResultCards v-if="h.review" :review="h.review" style="margin-top: 10px" />
          </div>
        </template>

        <!-- 文本精读 -->
        <template v-else>
          <div class="row-spaced">
            <div class="faint">{{ new Date(h.createdAt).toLocaleString() }}</div>
            <span class="tag tag-ghost">{{ h.sentences?.length || 0 }} 句</span>
          </div>
          <div style="margin-top: 6px; white-space: pre-wrap; max-height: 120px; overflow: auto">{{
            (h.original || '').slice(0, 300)
          }}{{ (h.original || '').length > 300 ? '…' : '' }}</div>
          <div class="row" style="margin-top: 8px">
            <button class="btn-link" @click="expandedHistory = expandedHistory === h.id ? '' : h.id">
              {{ expandedHistory === h.id ? '收起' : '查看逐句精读' }}<span class="btn-en">{{ expandedHistory === h.id ? 'Collapse' : 'View' }}</span>
            </button>
            <button class="btn-link" style="color: var(--danger)" @click="removeHistoryItem(h)">删除<span class="btn-en">Delete</span></button>
          </div>
          <div v-if="expandedHistory === h.id" style="margin-top: 8px">
            <div v-for="(s, i) in h.sentences || []" :key="i" class="card card-soft" style="margin-bottom: 8px">
              <div><b>{{ i + 1 }}.</b> {{ s.original }}</div>
              <div v-if="s.structure" class="muted" style="margin-top: 4px">句式：{{ s.structure }}</div>
              <div v-if="s.polished" style="margin-top: 4px">改写：{{ s.polished }}</div>
            </div>
          </div>
        </template>
      </div>
    </section>

    <!-- ============ 导出 ============ -->
    <section v-if="activeSub === 'export'" style="padding-top: 12px" class="stack">
      <div class="card">
        <div class="h3-hand" style="margin-top: 0">📄 导出 PDF<span class="sub-en">Export</span></div>
        <p class="muted">勾选题库条目 / 收藏片段，一键生成本地 PDF（已嵌入中文字体，无乱码）。</p>
        <button class="btn btn-primary btn-block" :disabled="!checkFeature('pdfExport')" @click="doExport()" style="margin-top: 10px">
          ⬇️ 生成并下载 PDF<span class="btn-en">Generate PDF</span>
        </button>
        <div v-if="!checkFeature('pdfExport')" class="faint">买断版专属功能</div>
      </div>
      <div class="card">
        <div class="h3-hand" style="margin-top: 0">题库待勾选<span class="sub-en">Select Questions</span></div>
        <div class="muted">共 {{ state.questionBank.length }} 题，已勾选 {{ exportBankSel.size }}</div>
        <div class="faint">到「📚 个人题库」子 Tab 勾选</div>
      </div>
      <div class="card">
        <div class="h3-hand" style="margin-top: 0">收藏待勾选<span class="sub-en">Select Favorites</span></div>
        <div class="muted">点 ⬇️ 图标选择收藏条目一并导出</div>
      </div>
      <div class="card">
        <div class="h3-hand" style="margin-top: 0">📜 背诵范文（{{ allRecites.length }}）<span class="sub-en">Recitations</span></div>
        <div class="muted" style="margin-bottom: 8px">面试模拟 / 深挖中「📝 生成背诵版范文」生成的素材，勾选后一并导出。</div>
        <div v-if="!allRecites.length" class="faint">暂无背诵范文</div>
        <div
          v-for="r in allRecites"
          :key="r.id"
          class="card card-soft"
          style="margin-bottom: 8px; padding: 10px 12px; cursor: pointer"
          @click="toggleReciteExport(r.id)"
        >
          <div class="row">
            <input type="checkbox" :checked="exportReciteSel.has(r.id)" style="flex-shrink: 0" />
            <span class="tag tag-ghost" style="flex-shrink: 0">{{ r.group }}</span>
            <span>{{ r.question?.slice(0, 60) }}…</span>
          </div>
        </div>
      </div>
    </section>

    <UpgradeModal :open="upgradeOpen" @close="upgradeOpen = false" @go-settings="goSettings" />
  </div>
</template>
