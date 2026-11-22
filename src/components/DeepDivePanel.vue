<!--
  深挖面板（简历深挖 / 自我介绍深挖 共用）
  - 素材：简历（PDF/Word/粘贴，多份）或 已保存的自我介绍版本（可加语音输入）
  - 出题：自动连环深挖 / 选中段落深挖，温和 or 压力面
  - 作答：复用录音转写 → 可手改 → 批改卡片 + 六维打分 + 范文
  - 旁路：生成背诵版范文（不计配额、不打分）
  - 深挖题默认只存本次会话，可选择存入个人题库
-->
<script setup>
import { ref, computed, nextTick, watch, onMounted, onBeforeUnmount } from 'vue'
import { state, uid, isPro, bumpPractice, computeTotal } from '../store/state.js'
import { chat, isConfigured } from '../lib/llm.js'
import { parseJson, normalizeReview } from '../lib/parse.js'
import {
  buildDeepDiveQuestionPrompt, buildSegmentDivePrompt,
  buildDeepDiveReviewPrompt, buildRecitePrompt
} from '../lib/prompts.js'
import { extractTextFromFile } from '../lib/docParse.js'
import { createLineReader } from '../lib/speech.js'
import { toast } from '../composables/useUi.js'
import Recorder from './Recorder.vue'
import SpeakPlayer from './SpeakPlayer.vue'
import ResultCards from './ResultCards.vue'
import RawFallback from './RawFallback.vue'
import UpgradeModal from './UpgradeModal.vue'

const props = defineProps({
  mode: { type: String, default: 'resume' }, // resume | intro
  active: { type: Boolean, default: true }   // 所在 Tab 是否激活（用于免费版提示时机）
})

const dd = state.deepDive
// 兼容旧数据
if (!Array.isArray(dd.turns)) dd.turns = []
if (!Array.isArray(dd.recites)) dd.recites = []

// ---------- 权限 ----------
const upgradeOpen = ref(false)
const upgradeNotice = ref('该功能为买断版高级功能，请解锁后使用')
function openUpgrade() {
  upgradeNotice.value = '该功能为买断版高级功能，请解锁后使用'
  upgradeOpen.value = true
}
function goSettings() {
  upgradeOpen.value = false
  window.dispatchEvent(new CustomEvent('spk:navigate', { detail: 'settings' }))
}
/** 所有 AI 调用前的统一关口：免费版只弹窗，不发请求 */
function ensurePro() {
  if (isPro()) return true
  openUpgrade()
  return false
}

onMounted(() => {
  // 免费版激活该模块时提示一次
  if (props.active && !isPro()) upgradeOpen.value = true
  // 默认选中第一份素材
  if (props.mode === 'resume' && !dd.resumeId && state.resumes.length) dd.resumeId = state.resumes[0].id
  if (props.mode === 'intro' && !dd.introId && state.intros.length) dd.introId = state.intros[0].id
})

// Tab 切到本模块时，免费版给提示
watch(() => props.active, (v) => {
  if (v && !isPro()) upgradeOpen.value = true
})
// 解锁后关闭遗留的升级弹窗
watch(() => isPro(), (v) => {
  if (v) upgradeOpen.value = false
})

// ==================== 素材：简历 ====================
const uploading = ref(false)
const fileInput = ref(null)
const showPasteForm = ref(false)
const pasteTitle = ref('')
const pasteText = ref('')

const activeResume = computed(() => state.resumes.find(r => r.id === dd.resumeId) || null)

async function onFilePicked(e) {
  const file = e.target.files?.[0]
  if (!file) return
  uploadName.value = file.name
  uploading.value = true
  try {
    const text = await extractTextFromFile(file)
    const clean = (text || '').replace(/\n{3,}/g, '\n\n').trim()
    if (!clean) throw new Error('未解析到文字（可能是扫描版 PDF，请改用粘贴文本）')
    const item = {
      id: uid(),
      title: file.name.replace(/\.[^.]+$/, ''),
      text: clean,
      createdAt: Date.now()
    }
    state.resumes.unshift(item)
    dd.resumeId = item.id
    toast.ok(`已解析 ${clean.length} 个字符 ✨`)
  } catch (err) {
    toast.err('解析失败：' + (err.message || err))
  } finally {
    uploading.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}
const uploadName = ref('')

function savePasted() {
  if (!pasteText.value.trim()) { toast.warn('请先粘贴简历文本'); return }
  const item = {
    id: uid(),
    title: pasteTitle.value.trim() || `粘贴简历 ${state.resumes.length + 1}`,
    text: pasteText.value.trim(),
    createdAt: Date.now()
  }
  state.resumes.unshift(item)
  dd.resumeId = item.id
  pasteText.value = ''
  pasteTitle.value = ''
  showPasteForm.value = false
  toast.ok('已保存')
}

function removeResume(id) {
  if (!confirm('确定删除这份简历？深挖历史不会删除。')) return
  const i = state.resumes.findIndex(r => r.id === id)
  if (i >= 0) state.resumes.splice(i, 1)
  if (dd.resumeId === id) dd.resumeId = state.resumes[0]?.id || ''
}

// ==================== 素材：自我介绍 ====================
const spokenIntro = ref('')     // 语音输入追加的自我介绍文本
const introVoiceOpen = ref(false)
const introRecorderRef = ref(null)

const activeIntro = computed(() => state.intros.find(x => x.id === dd.introId) || null)
const activeIntroDraft = computed(() => {
  const a = activeIntro.value
  if (!a) return null
  return a.drafts.find(d => d.id === a.currentDraftId) || a.drafts[0]
})

function onIntroVoiceFinal(text) {
  if (!text) return
  spokenIntro.value = (spokenIntro.value ? spokenIntro.value + '\n' : '') + text
  toast.ok('语音已转写，可用于深挖')
  introVoiceOpen.value = false
}

// 主素材文本
const material = computed(() => {
  if (props.mode === 'resume') return activeResume.value?.text || ''
  const base = activeIntroDraft.value?.content || ''
  return [base, spokenIntro.value].filter(Boolean).join('\n\n')
})

// 交叉引用素材（另一份材料）
const crossMaterial = computed(() => {
  if (!dd.crossRef) return ''
  if (props.mode === 'resume') {
    const a = activeIntro.value || state.intros[0]
    if (!a) return ''
    return a.drafts.find(d => d.id === a.currentDraftId)?.content || a.drafts[0]?.content || ''
  }
  const r = activeResume.value || state.resumes[0]
  return r?.text || ''
})

const materialLabel = computed(() => props.mode === 'resume' ? '简历原文' : '自我介绍原文')

// ==================== 选中段落深挖 ====================
const materialRef = ref(null)
const selectedSegment = ref('')

function captureSelection() {
  const el = materialRef.value
  if (!el) return
  const s = el.value.slice(el.selectionStart, el.selectionEnd).trim()
  selectedSegment.value = s
  if (!s) toast.warn('请先用鼠标选中一段文字')
}

// ==================== 出题 ====================
const dq = ref(null)              // { content, difficulty, reason, segment }
const loadingAsk = ref(false)
const askRaw = ref('')
const askError = ref('')

function resetAnswerState() {
  transcript.value = ''
  review.value = null
  reviewQuestion.value = ''
  reviewRaw.value = ''
  submitError.value = null
  reciteText.value = ''
  reciteError.value = ''
  stopReciteRead()
  stopTimer()
  recordingMinutes.value = 0
}

async function askNext(segment = '') {
  if (!ensurePro()) return
  if (!material.value.trim()) { toast.warn(`请先加载${materialLabel.value}`); return }
  if (!isConfigured()) { toast.warn('请先到设置页配置 API Key'); return }

  loadingAsk.value = true
  askRaw.value = ''
  askError.value = ''
  const asked = dd.turns.map(t => t.question).slice(-8)
  const last = dd.turns[dd.turns.length - 1]

  try {
    const prompt = segment
      ? buildSegmentDivePrompt({
          segment,
          mode: props.mode,
          style: dd.style,
          context: material.value
        })
      : buildDeepDiveQuestionPrompt({
          mode: props.mode,
          style: dd.style,
          material: material.value,
          crossText: crossMaterial.value,
          lastQuestion: last?.question || '',
          lastAnswer: last?.transcript || '',
          asked
        })

    const raw = await chat(prompt, {
      system: '你是外企英文面试官，严格按 JSON 输出。',
      maxTokens: 700,
      temperature: dd.style === 'pressure' ? 0.8 : 0.6
    })
    askRaw.value = raw
    const p = parseJson(raw)
    if (!p.ok || !p.data?.question) {
      askError.value = raw || '模型未返回有效题目'
      return
    }
    const q = String(p.data.question).trim()
    if (asked.includes(q)) {
      // 极少数重复，直接换一个（不递归递归过深）
      await askNext(segment)
      return
    }
    resetAnswerState()
    dq.value = {
      content: q,
      difficulty: Number(p.data.difficulty) >= 1 && Number(p.data.difficulty) <= 5 ? Number(p.data.difficulty) : 3,
      reason: String(p.data.reason || ''),
      segment
    }
    selectedSegment.value = ''
    if (dd.enableTimer) startTimer()
    nextTick(() => questionCardRef.value?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  } catch (e) {
    toast.err('出题失败：' + e.message)
    askError.value = e.message
  } finally {
    loadingAsk.value = false
  }
}

function askSegment() {
  if (!selectedSegment.value) { toast.warn('请先在素材里选中一段文字'); return }
  const seg = selectedSegment.value
  askNext(seg)
}

// ==================== 作答与批改 ====================
const recorderRef = ref(null)
const questionCardRef = ref(null)
const transcript = ref('')
const loadingSubmit = ref(false)
const review = ref(null)
const reviewQuestion = ref('')
const reviewRaw = ref('')
const submitError = ref(null)
const recordingMinutes = ref(0)
const recordingStartAt = ref(0)

function onRecorderState(s) {
  if (s === 'recording') recordingStartAt.value = Date.now()
  if (s === 'idle' && recordingStartAt.value) {
    recordingMinutes.value = (Date.now() - recordingStartAt.value) / 60000
  }
}
function onRecorderFinal(text) {
  if (text) transcript.value = text
  stopTimer()
}
function onRecorderInterim(text) {
  transcript.value = text
}
function startRecording() {
  nextTick(() => recorderRef.value?.start())
}

// 限时
const totalTimer = ref(0)
let timerInterval = null
function startTimer() {
  totalTimer.value = dd.timerSec || 90
  timerInterval = setInterval(() => {
    totalTimer.value -= 1
    if (totalTimer.value <= 0) {
      stopTimer()
      toast.warn('⏰ 限时结束，自动停止录音')
      recorderRef.value?.stop()
    }
  }, 1000)
}
function stopTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null }
}

async function submit() {
  if (!ensurePro()) return
  if (!dq.value) return
  if (!transcript.value.trim()) { toast.warn('还没有作答内容'); return }
  if (!isConfigured()) { toast.warn('请先到设置页配置 API Key'); return }

  loadingSubmit.value = true
  reviewRaw.value = ''
  submitError.value = null

  try {
    const raw = await chat(buildDeepDiveReviewPrompt({
      question: dq.value.content,
      transcript: transcript.value,
      mode: props.mode,
      style: dd.style,
      material: material.value
    }), { system: '你是资深英语面试官，严格按 JSON 输出。', maxTokens: 1400 })

    reviewRaw.value = raw
    const p = parseJson(raw)
    if (!p.ok) {
      submitError.value = { raw, error: p.error }
      return
    }
    const r = normalizeReview(p.data)
    review.value = r
    reviewQuestion.value = dq.value.content

    const total = computeTotal(r.scores)
    const turn = {
      id: uid(),
      question: dq.value.content,
      difficulty: dq.value.difficulty,
      transcript: transcript.value,
      review: r,
      total,
      createdAt: Date.now()
    }
    dd.turns.push(turn)
    if (dd.turns.length > 200) dd.turns.shift()
    // 全局历史（按来源分类）
    state.deepDiveHistory.unshift({
      id: turn.id,
      source: props.mode,          // resume | intro
      style: dd.style,
      question: turn.question,
      transcript: turn.transcript,
      review: r,
      total,
      createdAt: turn.createdAt
    })
    if (state.deepDiveHistory.length > 300) state.deepDiveHistory.length = 300
    bumpPractice({ minutes: recordingMinutes.value })

    // 自动连环深挖：答完自动出下一题
    if (dd.autoChain && isPro()) {
      await askNext()
    }
  } catch (e) {
    toast.err('批改失败：' + e.message)
  } finally {
    loadingSubmit.value = false
  }
}

// ==================== 存入个人题库 ====================
function saveQuestionToBank() {
  if (!dq.value) return
  if (state.questionBank.some(q => q.content === dq.value.content)) {
    toast.info('这道题已在个人题库里了')
    return
  }
  state.questionBank.unshift({
    id: uid(),
    content: dq.value.content,
    tags: [props.mode === 'resume' ? '简历深挖' : '自我介绍深挖'],
    difficulty: dq.value.difficulty || 3,
    scene: '职场面试',
    createdAt: Date.now()
  })
  toast.ok('已存入个人题库')
}

// ==================== 背诵版范文（旁路） ====================
const reciteText = ref('')
const loadingRecite = ref(false)
const reciteError = ref('')

async function generateRecite() {
  if (!ensurePro()) return
  if (!dq.value) return
  if (!isConfigured()) { toast.warn('请先到设置页填 API Key'); return }
  loadingRecite.value = true
  reciteError.value = ''
  try {
    const raw = await chat(buildRecitePrompt(dq.value.content), {
      system: '', maxTokens: 900, temperature: 0.7
    })
    const text = String(raw || '').trim()
    if (!text) throw new Error('模型未返回内容')
    reciteText.value = text
    dd.recites.push({
      id: uid(),
      source: props.mode,
      question: dq.value.content,
      text,
      createdAt: Date.now()
    })
    toast.ok('背诵范文已生成 ✨')
  } catch (e) {
    reciteError.value = e.message || '生成失败'
  } finally {
    loadingRecite.value = false
  }
}

function favoriteRecite() {
  if (!reciteText.value) return
  state.favorites.push({
    id: uid(),
    type: 'sample',
    text: reciteText.value,
    source: '深挖背诵范文 · ' + (dq.value?.content || '').slice(0, 40),
    createdAt: Date.now()
  })
  toast.ok('已收藏')
}

// 逐行高亮
const reciteReadIdx = ref(-1)
let reciteReader = null
function startReciteRead() {
  if (!reciteText.value) return
  if (reciteReader) reciteReader.stop()
  reciteReader = createLineReader(reciteText.value, {
    onHighlight: (i) => { reciteReadIdx.value = i }
  })
  reciteReader.play().finally(() => { reciteReadIdx.value = -1 })
}
function stopReciteRead() { reciteReader?.stop(); reciteReadIdx.value = -1 }
const reciteLines = computed(() =>
  (reciteText.value || '').split(/(?<=[.!?])\s+/).filter(Boolean)
)

// ==================== 会话记录 ====================
const sessionTurns = computed(() =>
  dd.turns.filter(t => t.review).slice().reverse().slice(0, 20)
)
const expandedTurn = ref('')

function removeTurn(id) {
  const i = dd.turns.findIndex(t => t.id === id)
  if (i >= 0) dd.turns.splice(i, 1)
  const j = state.deepDiveHistory.findIndex(t => t.id === id)
  if (j >= 0) state.deepDiveHistory.splice(j, 1)
}

onBeforeUnmount(() => {
  stopTimer()
  reciteReader?.stop()
  recorderRef.value?.stop?.()
})
</script>

<template>
  <div class="stack">
    <!-- 免费版锁定 -->
    <div v-if="!isPro()" class="empty-state">
      <div style="font-size: 56px">🔒</div>
      <div class="h2-hand">深挖功能为买断版专属<span class="sub-en">Pro Feature</span></div>
      <p>{{ upgradeNotice }}</p>
      <button class="btn btn-primary" @click="openUpgrade">🔓 解锁全部功能<span class="btn-en">Unlock</span></button>
    </div>

    <template v-else>
      <!-- ============ 素材区 ============ -->
      <div class="card">
        <div class="row-spaced" style="margin-bottom: 8px">
          <span class="h3-hand" style="margin: 0">
            {{ mode === 'resume' ? '📄 简历素材' : '🗣️ 自我介绍素材' }}
          </span>
          <span class="faint">仅存本机</span>
        </div>

        <!-- 简历：多份管理 + 上传 -->
        <template v-if="mode === 'resume'">
          <div class="row" style="flex-wrap: wrap; margin-bottom: 10px">
            <div
              v-for="r in state.resumes"
              :key="r.id"
              class="tag"
              :class="r.id === dd.resumeId ? '' : 'tag-ghost'"
              :style="{ background: r.id === dd.resumeId ? 'var(--primary-soft)' : '', cursor: 'pointer', padding: '8px 12px' }"
              @click="dd.resumeId = r.id"
            >
              {{ r.title }}
              <button class="btn-link" style="padding: 0 4px; color: var(--danger)" @click.stop="removeResume(r.id)">×</button>
            </div>
            <button class="btn btn-ghost" :disabled="uploading" @click="fileInput?.click()">
              <span v-if="uploading"><span class="spinner"></span> 解析中…<span class="btn-en">Parsing</span></span>
              <span v-else>📎 上传 PDF / Word<span class="btn-en">Upload</span></span>
            </button>
            <button class="btn btn-ghost" @click="showPasteForm = !showPasteForm">✏️ 粘贴文本<span class="btn-en">Paste</span></button>
            <input ref="fileInput" type="file" accept=".pdf,.docx,.doc,.txt,.md" style="display: none" @change="onFilePicked" />
          </div>
          <div class="faint" style="margin-bottom: 8px">支持 PDF / DOCX / TXT；扫描版 PDF 无法解析，请改用粘贴。</div>

          <div v-if="showPasteForm" class="card card-soft" style="margin-bottom: 10px">
            <input v-model="pasteTitle" class="input" placeholder="简历名称，例如：社招版" />
            <textarea v-model="pasteText" class="textarea" style="margin-top: 8px" rows="6" placeholder="粘贴简历纯文本…"></textarea>
            <div class="row" style="margin-top: 8px">
              <button class="btn btn-primary" @click="savePasted">保存简历<span class="btn-en">Save</span></button>
              <button class="btn btn-ghost" @click="showPasteForm = false">取消<span class="btn-en">Cancel</span></button>
            </div>
          </div>
        </template>

        <!-- 自我介绍：选择版本 + 语音输入 -->
        <template v-else>
          <div v-if="!state.intros.length" class="muted">
            还没有自我介绍。请先到「自我介绍打磨」创建一份，或直接语音输入一段。
          </div>
          <div v-else class="row" style="flex-wrap: wrap; margin-bottom: 10px">
            <select v-model="dd.introId" class="select" style="max-width: 260px">
              <option v-for="it in state.intros" :key="it.id" :value="it.id">{{ it.title }}（{{ it.scene }}）</option>
            </select>
            <span class="faint">当前版本：{{ activeIntroDraft?.content ? '已有内容' : '空草稿' }}</span>
          </div>
          <div class="row" style="margin-bottom: 8px">
            <button class="btn btn-ghost" @click="introVoiceOpen = !introVoiceOpen">
              🎙️ {{ introVoiceOpen ? '收起语音输入' : '语音输入自我介绍' }}
            </button>
            <button v-if="spokenIntro" class="btn-link" style="color: var(--danger)" @click="spokenIntro = ''">清空语音补充<span class="btn-en">Clear</span></button>
          </div>
          <Recorder
            v-if="introVoiceOpen"
            ref="introRecorderRef"
            style="margin-bottom: 10px"
            @final="onIntroVoiceFinal"
          />
          <div v-if="spokenIntro" class="card card-soft" style="margin-bottom: 10px">
            <div class="muted">语音转写（将作为深挖素材）</div>
            <div style="white-space: pre-wrap; margin-top: 6px">{{ spokenIntro }}</div>
          </div>
        </template>

        <!-- 素材原文（可选段深挖） -->
        <div v-if="material" class="muted" style="margin: 6px 0">
          {{ materialLabel }}（{{ material.length }} 字符）· 用鼠标选中一段可针对该段深挖
        </div>
        <textarea
          v-if="material"
          ref="materialRef"
          class="textarea"
          :value="material"
          readonly
          rows="7"
          style="font-size: 13px; background: var(--bg-soft)"
        ></textarea>
        <div v-else class="faint">尚未加载素材</div>

        <div class="row" style="margin-top: 10px; flex-wrap: wrap">
          <button class="btn btn-ghost" :disabled="!selectedSegment" @click="askSegment">
            🎯 针对选中段落深挖<span class="btn-en">Dive Segment</span>
          </button>
          <span v-if="selectedSegment" class="faint">已选中 {{ selectedSegment.length }} 字符</span>
          <button class="btn-link" @click="captureSelection">读取当前选区<span class="btn-en">Capture</span></button>
        </div>

        <!-- 交叉引用 -->
        <div style="margin-top: 10px">
          <label style="display: flex; gap: 8px; align-items: center; font-size: 14px">
            <input type="checkbox" v-model="dd.crossRef" />
            交叉引用{{ mode === 'resume' ? '自我介绍' : '简历' }}（AI 会针对矛盾点 / 重复点提问）
          </label>
          <div v-if="dd.crossRef && !crossMaterial" class="faint" style="margin-left: 24px">
            暂无可交叉的材料{{ mode === 'resume' ? '（未创建自我介绍）' : '（未上传简历）' }}
          </div>
        </div>
      </div>

      <!-- ============ 配置控制 ============ -->
      <div class="card">
        <div class="grid-2">
          <div>
            <label class="muted">深挖风格</label>
            <div class="row">
              <button class="btn" :class="dd.style === 'gentle' ? 'btn-primary' : 'btn-ghost'" @click="dd.style = 'gentle'">🌿 温和深挖<span class="btn-en">Gentle</span></button>
              <button class="btn" :class="dd.style === 'pressure' ? 'btn-primary' : 'btn-ghost'" @click="dd.style = 'pressure'">🔥 压力面深挖<span class="btn-en">Pressure</span></button>
            </div>
          </div>
          <div>
            <label class="muted">自动连环深挖</label>
            <div class="row">
              <label style="display: flex; gap: 6px; align-items: center">
                <input type="checkbox" v-model="dd.autoChain" /> 答完一题自动出下一题
              </label>
            </div>
          </div>
        </div>
        <div class="row" style="margin-top: 10px; flex-wrap: wrap">
          <label style="display: flex; gap: 6px; align-items: center">
            <input type="checkbox" v-model="dd.enableTimer" /> 答题限时
          </label>
          <input v-model.number="dd.timerSec" class="input" type="number" min="30" max="600" step="15" style="width: 90px" />
          <span class="faint">秒</span>
        </div>
        <div class="row" style="margin-top: 12px">
          <button class="btn btn-primary" :disabled="loadingAsk" @click="askNext()">
            <span v-if="loadingAsk"><span class="spinner"></span> 出题中…<span class="btn-en">Generating</span></span>
            <span v-else>🔎 开始深挖<span class="btn-en">Start</span></span>
          </button>
          <button v-if="dq" class="btn btn-ghost" :disabled="loadingAsk" @click="askNext()">➡️ 下一题<span class="btn-en">Next</span></button>
          <span v-if="!isConfigured()" class="faint">⚠️ 还没配置 API Key</span>
        </div>
      </div>

      <RawFallback v-if="askError" :raw="askError" @retry="askNext()" />

      <!-- ============ 当前题目 ============ -->
      <div v-if="dq" ref="questionCardRef" class="card">
        <div class="row-spaced" style="align-items: flex-start">
          <div style="flex: 1">
            <div class="faint">
              {{ mode === 'resume' ? '简历深挖' : '自我介绍深挖' }} · {{ dd.style === 'pressure' ? '压力面' : '温和' }}
              · Difficulty {{ dq.difficulty }}
              <span v-if="dq.segment" class="tag tag-ghost" style="margin-left: 6px">针对选中段落</span>
            </div>
            <div class="h2-hand en-body" style="margin: 6px 0 0">{{ dq.content }}</div>
            <div v-if="dq.reason" class="faint" style="margin-top: 6px">出题依据：{{ dq.reason }}</div>
          </div>
          <div v-if="dd.enableTimer" class="tag tag-warn" style="font-size: 16px">⏱️ {{ totalTimer }}s</div>
        </div>

        <!-- 旁路动作 -->
        <div class="row" style="margin-top: 12px; flex-wrap: wrap">
          <button class="btn btn-primary" @click="startRecording">🎙️ 开始录音<span class="btn-en">Record</span></button>
          <button class="btn btn-ghost" :disabled="loadingRecite" @click="generateRecite">
            <span v-if="loadingRecite"><span class="spinner"></span> 生成中…<span class="btn-en">Generating</span></span>
            <span v-else>📝 生成背诵版范文<span class="btn-en">Recite</span></span>
          </button>
          <button class="btn btn-ghost" @click="saveQuestionToBank">📥 存入我的题库<span class="btn-en">Save to Bank</span></button>
        </div>

        <Recorder
          ref="recorderRef"
          style="margin-top: 12px"
          @state="onRecorderState"
          @final="onRecorderFinal"
          @interim="onRecorderInterim"
        />

        <div class="muted" style="margin-top: 10px">作答转录（可手动修改后再提交）</div>
        <textarea v-model="transcript" class="textarea" rows="5" placeholder="录音转写会出现在这里，也可以直接手写…"></textarea>

        <div class="row" style="margin-top: 10px">
          <button class="btn btn-primary" :disabled="loadingSubmit" @click="submit">
            <span v-if="loadingSubmit"><span class="spinner"></span> 批改中…<span class="btn-en">Grading</span></span>
            <span v-else>✅ 提交批改<span class="btn-en">Grade</span></span>
          </button>
          <SpeakPlayer v-if="transcript" :text="transcript" label="播放我的作答" />
        </div>
      </div>

      <RawFallback v-if="submitError" :raw="submitError.raw" @retry="submit" />

      <!-- 背诵范文卡片（虚线边框，区别于批改范文） -->
      <div
        v-if="reciteText || reciteError"
        class="card"
        style="border-style: dashed; border-color: var(--primary); background: var(--primary-soft)"
      >
        <div class="row-spaced">
          <div class="h3-hand" style="margin: 0">📝 背诵范文<span class="sub-en">Recitation</span></div>
          <span class="tag tag-ghost">AI 背诵素材 · 不计入练习记录</span>
        </div>
        <div v-if="reciteError" style="margin-top: 8px; color: var(--danger)">
          {{ reciteError }}
          <button class="btn btn-ghost" style="margin-left: 8px" @click="generateRecite">🔄 重试<span class="btn-en">Retry</span></button>
        </div>
        <template v-else>
          <div style="margin-top: 10px; line-height: 1.85">
            <div
              v-for="(ln, i) in reciteLines"
              :key="i"
              class="hl-line"
              :class="{ active: reciteReadIdx === i }"
            >{{ ln }}</div>
          </div>
          <div class="row" style="margin-top: 10px; flex-wrap: wrap">
            <SpeakPlayer :text="reciteText" label="播放范文" />
            <button class="btn btn-ghost" @click="reciteReadIdx >= 0 ? stopReciteRead() : startReciteRead()">
              {{ reciteReadIdx >= 0 ? '⏹ 停止跟读' : '▶️ 逐行高亮跟读' }}
            </button>
            <button class="btn btn-ghost" @click="favoriteRecite">⭐ 收藏<span class="btn-en">Favorite</span></button>
          </div>
        </template>
      </div>

      <!-- ============ 上一题批改 ============ -->
      <template v-if="review">
        <div class="faint">上一题批改：{{ reviewQuestion }}</div>
        <ResultCards :review="review" />
      </template>

      <!-- ============ 本次会话记录 ============ -->
      <div v-if="sessionTurns.length" class="card">
        <details>
          <summary style="cursor: pointer">📜 本次深挖记录（{{ sessionTurns.length }}）</summary>
          <div v-for="t in sessionTurns" :key="t.id" class="card card-soft" style="margin-top: 8px; padding: 10px 12px">
            <div class="row-spaced">
              <b style="font-size: 14px">{{ t.question }}</b>
              <span class="faint">{{ t.total?.toFixed?.(1) }}</span>
            </div>
            <div class="faint" style="margin-top: 4px">
              {{ new Date(t.createdAt).toLocaleString() }} · 难度 {{ t.difficulty }}
            </div>
            <button class="btn-link" @click="expandedTurn = expandedTurn === t.id ? '' : t.id">
              {{ expandedTurn === t.id ? '收起' : '查看作答与批改' }}
            </button>
            <button class="btn-link" style="color: var(--danger); margin-left: 8px" @click="removeTurn(t.id)">删除<span class="btn-en">Delete</span></button>
            <div v-if="expandedTurn === t.id" style="margin-top: 8px">
              <div class="muted">我的作答</div>
              <div style="white-space: pre-wrap">{{ t.transcript }}</div>
              <ResultCards v-if="t.review" :review="t.review" style="margin-top: 10px" />
            </div>
          </div>
        </details>
      </div>

      <!-- 背诵范文记录 -->
      <div v-if="dd.recites.length" class="card">
        <details>
          <summary style="cursor: pointer">📝 背诵范文记录（{{ dd.recites.length }}）</summary>
          <div v-for="r in dd.recites.slice().reverse()" :key="r.id" class="card card-soft" style="margin-top: 8px; padding: 10px 12px">
            <div class="faint">{{ r.question }}</div>
            <div class="en-body" style="margin-top: 6px; white-space: pre-wrap; font-size: 14px">{{ r.text }}</div>
            <div class="row" style="margin-top: 8px">
              <SpeakPlayer :text="r.text" label="播放" size="sm" />
            </div>
          </div>
        </details>
      </div>
    </template>

    <UpgradeModal :open="upgradeOpen" :notice="upgradeNotice" @close="upgradeOpen = false" @go-settings="goSettings" />
  </div>
</template>
