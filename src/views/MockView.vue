<!--
  Tab2 · 面试模拟（核心模块）
  - 配置面板：场景 / 难度 / 限时 / 背诵模式
  - 抽题：题库命中优先 → 智能出题（模型生成） → 随机兜底
  - 流程：展示题目 → 录音 → 转写可手动改 → 提交 → 批改 → 范文 → 追问
  - 同一会话不重复抽题
  - 追问温和 / 压力面两种；不入题库
-->
<script setup>
import { ref, computed, watch, nextTick, reactive } from 'vue'
import {
  state, uid, computeTotal, bumpPractice,
  checkFeature, checkDailyBankLimit, incDailyBankUsed,
  DIMENSIONS, SCENES, FIXED_TAGS, isPro
} from '../store/state.js'
import { chat, isConfigured } from '../lib/llm.js'
import { parseJson, normalizeReview } from '../lib/parse.js'
import { buildCandidatePool, filterByDifficulty } from '../lib/presetBank.js'
import {
  buildReviewPrompt, buildSmartPickPrompt, buildFollowUpPrompt, buildRecitePrompt
} from '../lib/prompts.js'
import { toast } from '../composables/useUi.js'
import { createSpeaker, createLineReader } from '../lib/speech.js'
import { formatDate } from '../lib/text.js'
import Recorder from '../components/Recorder.vue'
import SpeakPlayer from '../components/SpeakPlayer.vue'
import ResultCards from '../components/ResultCards.vue'
import RawFallback from '../components/RawFallback.vue'
import UpgradeModal from '../components/UpgradeModal.vue'

// ---------- 配置 ----------
const cfg = reactive({
  scene: state.session.scene || '职场面试',
  difficulty: state.session.difficulty || 3,
  enableTimer: state.session.enableTimer || false,
  timerSec: state.session.timerSec || 90,
  reciteMode: false,
  tagFilter: state.session.tagFilter || ''   // 题型标签筛选（空 = 全部）
})
watch(cfg, () => {
  state.session.scene = cfg.scene
  state.session.difficulty = cfg.difficulty
  state.session.enableTimer = cfg.enableTimer
  state.session.timerSec = cfg.timerSec
  state.session.tagFilter = cfg.tagFilter
}, { deep: true })

// ---------- 当前状态 ----------
const phase = ref('config')  // config | question | answering | reviewing | followup
const currentQuestion = ref(null)     // { content, tags, difficulty, source }
const transcript = ref('')
const reviewRaw = ref('')
const review = ref(null)
const lastError = ref(null)
const loadingSubmit = ref(false)
const loadingPick = ref(false)
const recorderRef = ref(null)
const historyTurns = ref([])          // 当前会话历史
const totalTimer = ref(0)
const questionTimerInterval = ref(null)
const recordingMinutes = ref(0)

// ---------- 背诵版范文（旁路能力，独立于录音-作答-批改主链路） ----------
// 存当前会话，持久化在 currentSession；不进入 historyTurns / allSessions，不影响配额与六维打分
if (!Array.isArray(state.session.recites)) state.session.recites = []
const reciteText = ref('')
const loadingRecite = ref(false)
const reciteError = ref('')
const upgradeNotice = ref('')

async function generateRecite() {
  if (!currentQuestion.value) return
  // 免费版：仅弹窗提示，不发起 AI 调用
  if (!isPro()) {
    upgradeNotice.value = '该功能为买断版高级功能，请解锁全部功能后使用'
    upgradeOpen.value = true
    return
  }
  if (!isConfigured()) { toast.warn('请先到设置页填 API Key'); return }
  loadingRecite.value = true
  reciteError.value = ''
  try {
    const raw = await chat(buildRecitePrompt(currentQuestion.value.content), {
      system: '', maxTokens: 900, temperature: 0.7
    })
    const text = String(raw || '').trim()
    if (!text) throw new Error('模型未返回内容')
    reciteText.value = text
    // 保存进当前会话历史记录，支持回看与 PDF 勾选导出
    state.session.recites.push({
      id: uid(),
      question: currentQuestion.value.content,
      text,
      scene: cfg.scene,
      difficulty: cfg.difficulty,
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
    id: uid(), type: 'sample', text: reciteText.value,
    source: '背诵范文 · ' + (currentQuestion.value?.content || '').slice(0, 40),
    createdAt: Date.now()
  })
  toast.ok('已收藏到题库 & 收藏')
}

// 背诵范文逐行高亮跟读
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

// ---------- 抽题 ----------
// 候选池 = 内置预置题库（只读） + 个人题库，按 scene / 标签 / 难度过滤
const candidatePool = computed(() => filterByDifficulty(
  buildCandidatePool({ scene: cfg.scene, tags: cfg.tagFilter ? [cfg.tagFilter] : [] }, state.questionBank),
  cfg.difficulty
))

async function pickQuestion() {
  loadingPick.value = true
  currentQuestion.value = null
  phase.value = 'question'

  // 配额检查：免费版每天 1 道题库题（智能出题和抽题库都算）
  const limit = checkDailyBankLimit()
  const fromBank = candidatePool.value.length > 0
  const useSmart = isPro() && checkFeature('smartPick')

  try {
    let q = null
    if (fromBank) {
      q = pickFromBank()
      if (q) {
        q.source = q.readonly ? 'preset' : 'bank'
        incDailyBankUsed()
      }
    }
    if (!q && useSmart) {
      q = await pickFromSmart()
      if (q) q.source = 'smart'
    }
    if (!q && fromBank) {
      q = pickRandomBank()
      q.source = q.readonly ? 'preset' : 'bank'
      incDailyBankUsed()
    }
    if (!q) {
      // 兜底：随机生成一道
      q = { content: 'Tell me about your strengths and weaknesses.' }
      q.source = 'fallback'
    }
    // 同一会话去重
    const usedContents = historyTurns.value.map(t => t.question)
    if (usedContents.includes(q.content)) {
      // 换一道
      if (fromBank) {
        const alt = pickRandomBank()
        if (alt && !usedContents.includes(alt.content)) { q = alt; q.source = alt.readonly ? 'preset' : 'bank' }
      }
    }
    // 免费版弹窗提醒
    if (!isPro() && !limit.ok && (q.source === 'bank' || q.source === 'preset')) {
      upgradeOpen.value = true
      loadingPick.value = false
      phase.value = 'config'
      return
    }
    currentQuestion.value = q
    transcript.value = ''
    review.value = null
    reviewRaw.value = ''
    lastError.value = null
    // 换题时重置背诵范文（历史记录保留在下方回看面板）
    stopReciteRead()
    reciteText.value = ''
    reciteError.value = ''
    phase.value = 'answering'
    totalTimer.value = cfg.timerSec
    if (cfg.enableTimer) startQuestionTimer()
  } catch (e) {
    toast.err('抽题失败：' + e.message)
  } finally {
    loadingPick.value = false
  }
}

function pickFromBank() {
  if (!candidatePool.value.length) return null
  const asked = historyTurns.value.map(t => t.question)
  const avails = candidatePool.value.filter(q => !asked.includes(q.content))
  if (!avails.length) return null
  // 优先命中薄弱标签 / 难度 5
  const weak = findWeakTags()
  const matches = avails.filter(q => q.tags?.some(t => weak.includes(t)))
  const pool = matches.length ? matches : avails
  return { ...pool[Math.floor(Math.random() * pool.length)] }
}
function pickRandomBank() {
  if (!candidatePool.value.length) return null
  const asked = historyTurns.value.map(t => t.question)
  const avails = candidatePool.value.filter(q => !asked.includes(q.content))
  const pool = avails.length ? avails : candidatePool.value
  return { ...pool[Math.floor(Math.random() * pool.length)] }
}
async function pickFromSmart() {
  const lowDims = findLowDimensions()
  const lowTags = findWeakTags()
  const raw = await chat(buildSmartPickPrompt({
    scene: cfg.scene, difficulty: cfg.difficulty, lowDims, lowTags
  }), { system: '你是面试官，严格按 JSON 输出。', maxTokens: 200 })
  const p = parseJson(raw)
  if (!p.ok) return null
  return { content: String(p.data.question || '').trim(), tags: p.data.suggested_tags || [], source: 'smart' }
}

function findLowDimensions() {
  // 从 allSessions 最近 5 次拿最弱 2 个维度
  const recent = flattenTurns(state.allSessions).slice(-10)
  if (!recent.length) return []
  const sums = {}
  const counts = {}
  DIMENSIONS.forEach(d => { sums[d.key] = 0; counts[d.key] = 0 })
  for (const t of recent) {
    if (!t.scores) continue
    for (const d of DIMENSIONS) {
      const v = t.scores[d.key]
      if (v != null) { sums[d.key] += v; counts[d.key]++ }
    }
  }
  const list = DIMENSIONS
    .map(d => ({ key: d.key, avg: counts[d.key] ? sums[d.key] / counts[d.key] : 10 }))
    .sort((a, b) => a.avg - b.avg)
    .slice(0, 2)
  return list.map(x => DIMENSIONS.find(d => d.key === x.key)?.label).filter(Boolean)
}
function findWeakTags() {
  const recent = flattenTurns(state.allSessions).slice(-10)
  const m = {}
  for (const t of recent) {
    for (const tag of (t.weak_tags || [])) m[tag] = (m[tag] || 0) + 1
  }
  return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 2).map(x => x[0])
}
function flattenTurns(sessions) {
  const out = []
  for (const s of sessions) {
    for (const t of (s.turns || [])) {
      out.push({ ...t })
    }
  }
  return out
}

// ---------- 限时 ----------
function startQuestionTimer() {
  totalTimer.value = cfg.timerSec
  questionTimerInterval.value = setInterval(() => {
    totalTimer.value -= 1
    if (totalTimer.value <= 0) {
      clearInterval(questionTimerInterval.value)
      questionTimerInterval.value = null
      toast.warn('⏰ 限时结束，自动停止录音')
      recorderRef.value?.stop()
    }
  }, 1000)
}
function stopQuestionTimer() {
  if (questionTimerInterval.value) {
    clearInterval(questionTimerInterval.value)
    questionTimerInterval.value = null
  }
}

// ---------- 录音回调 ----------
const recordingStartAt = ref(0)
function onRecorderState(s) {
  if (s === 'recording') recordingStartAt.value = Date.now()
  if (s === 'idle' && recordingStartAt.value) {
    const mins = (Date.now() - recordingStartAt.value) / 60000
    recordingMinutes.value = mins
  }
}
function onRecorderFinal(text) {
  if (text) transcript.value = text
  stopQuestionTimer()
}
function onRecorderInterim(text) {
  transcript.value = text
}

function startRecording() {
  nextTick(() => recorderRef.value?.start())
}

// ---------- 提交批改 ----------
async function submit() {
  if (!transcript.value.trim()) { toast.warn('还没有作答内容'); return }
  loadingSubmit.value = true
  reviewRaw.value = ''
  lastError.value = null

  try {
    const raw = await chat(buildReviewPrompt({
      question: currentQuestion.value.content,
      transcript: transcript.value,
      scene: cfg.scene, difficulty: cfg.difficulty
    }), { system: '你是资深英语口语面试官，严格按 JSON 输出。' })
    reviewRaw.value = raw
    const p = parseJson(raw)
    if (!p.ok) { lastError.value = { raw, error: p.error }; phase.value = 'reviewing'; return }
    const r = normalizeReview(p.data)
    review.value = r
    phase.value = 'reviewing'

    // 存历史
    const scores = r.scores
    const turn = {
      id: uid(),
      question: currentQuestion.value.content,
      transcript: transcript.value,
      scores,
      total: computeTotal(scores),
      weak_tags: r.weak_tags,
      cards: r.cards,
      sample_answer: r.sample_answer,
      followUps: [],
      createdAt: Date.now()
    }
    historyTurns.value.push(turn)
    bumpPractice({ minutes: recordingMinutes.value })

    // 写 allSessions
    let sess = state.allSessions.find(s => s.id === state.sessionId)
    if (!sess) {
      sess = { id: uid(), scene: cfg.scene, difficulty: cfg.difficulty, startedAt: Date.now(), turns: [] }
      state.allSessions.unshift(sess)
      state.sessionId = sess.id
    }
    sess.turns.push(turn)
    state.session.questions = state.session.questions.concat(historyTurns.value.map(t => t.id))
  } catch (e) {
    toast.err('请求失败：' + e.message)
  } finally {
    loadingSubmit.value = false
  }
}

// ---------- 范文播放（用户自己的 vs AI 范文） ----------
let myAudio = null
async function playMine() {
  if (!transcript.value) return
  myAudio = createSpeaker(transcript.value)
  await myAudio.play()
}

// ---------- 连环追问 ----------
const followUpMode = ref('gentle')
const loadingFollowUp = ref(false)
const currentFollowUp = ref(null)

async function askFollowUp() {
  if (!checkFeature('followUp')) { upgradeOpen.value = true; return }
  if (!review.value) return
  loadingFollowUp.value = true
  currentFollowUp.value = null
  try {
    const mode = followUpMode.value
    const raw = await chat(buildFollowUpPrompt({
      mode,
      question: currentQuestion.value.content,
      transcript: transcript.value,
      review: review.value
    }), { system: '' })
    currentFollowUp.value = String(raw || '').trim()
    // 追问不入题库，不占配额
    const lastTurn = historyTurns.value[historyTurns.value.length - 1]
    if (lastTurn) lastTurn.followUps.push({ mode, question: currentFollowUp.value, at: Date.now() })
  } catch (e) {
    toast.err('追问失败：' + e.message)
  } finally {
    loadingFollowUp.value = false
  }
}

// 收藏表达片段
function favoriteSample() {
  if (!review.value?.sample_answer) return
  state.favorites.push({
    id: uid(), type: 'sample', text: review.value.sample_answer,
    source: '面试范文 · ' + currentQuestion.value?.content?.slice(0, 40),
    createdAt: Date.now()
  })
  toast.ok('已收藏到题库 & 收藏')
}

function resetAll() {
  phase.value = 'config'
  currentQuestion.value = null
  transcript.value = ''
  review.value = null
  reviewRaw.value = ''
  historyTurns.value = []
  stopReciteRead()
  reciteText.value = ''
  reciteError.value = ''
  state.session.recites = []
  stopQuestionTimer()
  // 开始新会话
  state.sessionId = ''
}

const upgradeOpen = ref(false)
function closeUpgrade() {
  upgradeOpen.value = false
  upgradeNotice.value = ''
}
function goSettings() {
  closeUpgrade()
  window.dispatchEvent(new CustomEvent('spk:navigate', { detail: 'settings' }))
}
</script>

<template>
  <div>
    <header class="page-head">
      <div class="h1-hand">面试模拟</div>
      <div class="page-head-en">Mock Interview</div>
      <p>场景 / 难度 / 限时 —— 智能出题 + 六维评分 + 连环追问。<span class="page-desc-en">Scene, difficulty &amp; timer — smart questions, 6-dimension scoring, follow-ups.</span></p>
    </header>

    <!-- 未配置 Key 提示 -->
    <div v-if="!isConfigured()" class="card" style="border-color: var(--warn); background: var(--warn-soft)">
      <b>⚠️ 请先到「设置」填一个 API Key</b>
      <p class="muted" style="margin: 4px 0 10px">Key 只在你本机，不会上传到任何中间服务器。</p>
      <button class="btn btn-primary" @click="goSettings()">去设置<span class="btn-en">Settings</span></button>
    </div>

    <!-- 配置面板 -->
    <div v-if="phase === 'config' || phase === 'reviewing'" class="card" style="margin-bottom: 14px">
      <div class="h3-hand">配置<span class="sub-en">Configuration</span></div>
      <div class="grid-2" style="margin-top: 10px">
        <div>
          <label class="muted">场景</label>
          <select v-model="cfg.scene" class="select">
            <option v-for="s in SCENES" :key="s">{{ s }}</option>
          </select>
        </div>
        <div>
          <label class="muted">难度 {{ cfg.difficulty }}/5</label>
          <input type="range" v-model.number="cfg.difficulty" min="1" max="5" step="1" style="width: 100%" />
        </div>
        <div>
          <label class="muted">题型标签（候选池 = 内置题库 + 个人题库）</label>
          <select v-model="cfg.tagFilter" class="select">
            <option value="">全部题型</option>
            <option v-for="t in FIXED_TAGS" :key="t" :value="t">{{ t }}</option>
          </select>
        </div>
      </div>
      <div class="row" style="margin-top: 10px; flex-wrap: wrap; gap: 14px">
        <label style="display: flex; align-items: center; gap: 6px">
          <input type="checkbox" v-model="cfg.enableTimer" /> 答题限时
        </label>
        <label v-if="cfg.enableTimer" style="display: flex; align-items: center; gap: 6px">
          秒数
          <input type="number" v-model.number="cfg.timerSec" min="30" max="600" class="input" style="width: 80px" />
        </label>
        <label style="display: flex; align-items: center; gap: 6px">
          <input type="checkbox" v-model="cfg.reciteMode" :disabled="!checkFeature('reciteMode')" />
          背诵模式
          <span v-if="!checkFeature('reciteMode')" class="tag tag-warn">Pro</span>
        </label>
      </div>
      <button class="btn btn-primary btn-block" style="margin-top: 12px" :disabled="loadingPick || !isConfigured()" @click="pickQuestion()">
        <span v-if="loadingPick"><span class="spinner"></span> 抽题中…<span class="btn-en">Picking...</span></span>
        <span v-else>🎯 开始抽题<span class="btn-en">Start</span></span>
      </button>
      <div class="faint" style="margin-top: 6px">
        会话已答：{{ historyTurns.length }} 题 · 题库题日配额：免费 {{ checkFeature('smartPick') ? '不限' : `${checkDailyBankLimit().ok ? 1 - state.dailyUsedBankQuestions : 0}/1` }}
      </div>
    </div>

    <!-- 当前题目 -->
    <div v-if="phase === 'question' || phase === 'answering' || phase === 'reviewing'" class="card" style="margin-bottom: 14px">
      <div class="row-spaced">
        <div class="h3-hand" style="margin: 0">🎯 题目<span class="sub-en">Question</span></div>
        <div class="row" style="gap: 6px">
          <span class="tag">{{ cfg.scene }}</span>
          <span class="tag tag-ghost">Difficulty {{ cfg.difficulty }}</span>
          <span v-if="currentQuestion?.source === 'bank'" class="tag">个人题库</span>
          <span v-if="currentQuestion?.source === 'preset'" class="tag">内置题库</span>
          <span v-if="currentQuestion?.source === 'smart'" class="tag tag-warn">智能出题</span>
          <button class="btn btn-ghost" style="padding: 6px 14px; min-height: 32px; font-size: 13px"
                  :disabled="loadingPick" @click="pickQuestion(true)">
            <span v-if="loadingPick"><span class="spinner" style="width:12px;height:12px;border-width:1.5px"></span></span>
            <span v-else>🔄 换题<span class="btn-en">Change</span></span>
          </button>
        </div>
      </div>
      <p class="en-body" style="font-size: 17px; line-height: 1.7; margin-top: 8px">{{ currentQuestion?.content }}</p>
      <div v-if="currentQuestion?.tags?.length" class="row" style="flex-wrap: wrap">
        <span v-for="t in currentQuestion.tags" :key="t" class="tag tag-ghost" style="margin-top: 4px">{{ t }}</span>
      </div>

      <!-- 限时倒计时 -->
      <div v-if="phase === 'answering' && cfg.enableTimer" style="margin-top: 10px">
        <div class="faint">剩余时间</div>
        <div style="font-size: 28px; font-weight: 700; color: totalTimer <= 10 ? 'var(--danger)' : 'var(--primary-deep)'">{{ totalTimer }}s</div>
      </div>

      <!-- 右下角按钮组：开始录音（主链路） + 生成背诵版范文（旁路） -->
      <div class="row" style="justify-content: flex-end; flex-wrap: wrap; margin-top: 12px">
        <button v-if="phase === 'answering'" class="btn btn-primary" @click="startRecording()">🎙️ 开始录音<span class="btn-en">Record</span></button>
        <button class="btn btn-ghost" :disabled="loadingRecite" @click="generateRecite()">
          <span v-if="loadingRecite"><span class="spinner"></span> 生成中…<span class="btn-en">Generating...</span></span>
          <span v-else>📝 生成背诵版范文<span class="btn-en">Recite</span></span>
        </button>
      </div>
    </div>

    <!-- 独立「背诵范文」卡片：虚线边框区分录音作答产出的润色范文 -->
    <div
      v-if="reciteText || reciteError"
      class="card"
      style="margin-bottom: 14px; border: 1.5px dashed var(--primary); background: var(--primary-soft)"
    >
      <div class="row-spaced">
        <div class="h3-hand" style="margin: 0">📜 背诵范文（约 2 分钟）<span class="sub-en">Recite Sample</span></div>
        <span class="tag">AI 背诵素材 · 不计入练习记录</span>
      </div>

      <div v-if="reciteError" class="row" style="margin-top: 10px; flex-wrap: wrap">
        <span class="tag tag-danger">生成失败：{{ reciteError }}</span>
        <button class="btn btn-ghost" :disabled="loadingRecite" @click="generateRecite()">🔄 重试<span class="btn-en">Retry</span></button>
      </div>

      <template v-if="reciteText">
        <div class="row" style="margin-top: 10px; flex-wrap: wrap">
          <SpeakPlayer :text="reciteText" label="播放范文" />
          <button class="btn btn-ghost" @click="reciteReadIdx >= 0 ? stopReciteRead() : startReciteRead()">
            {{ reciteReadIdx >= 0 ? '⏹ 停止跟读' : '▶️ 逐行高亮跟读' }}
          </button>
          <button class="btn btn-ghost" @click="favoriteRecite()">⭐ 收藏<span class="btn-en">Save</span></button>
        </div>
        <div class="en-body" style="margin-top: 10px; line-height: 1.8; white-space: pre-wrap">
          <div
            v-for="(ln, i) in reciteText.split(/(?<=[.!?])\s+/).filter(Boolean)"
            :key="i"
            class="hl-line"
            :class="{ active: reciteReadIdx === i }"
          >{{ ln }}</div>
        </div>
      </template>
    </div>

    <!-- 背诵模式：提示隐藏 -->
    <div v-if="cfg.reciteMode && phase === 'answering'" class="card card-soft" style="margin-bottom: 14px">
      <div class="h3-hand" style="margin: 0; color: var(--text-soft)">🤫 背诵模式<span class="sub-en">Recite Mode</span></div>
      <p class="muted" style="margin: 4px 0 0">凭记忆作答，提交后才会展示批改与范文。</p>
    </div>

    <!-- 录音 / 作答区 -->
    <div v-if="phase === 'answering'" class="card" style="margin-bottom: 14px">
      <div class="h3-hand" style="margin-top: 0">🎙️ 作答<span class="sub-en">Answer</span></div>
      <Recorder
        ref="recorderRef"
        :auto-stop-sec="cfg.enableTimer ? cfg.timerSec : 0"
        @state="onRecorderState"
        @final="onRecorderFinal"
        @interim="onRecorderInterim"
      />
      <div v-if="transcript" style="margin-top: 10px">
        <div class="muted">转写文本（可直接修改后提交）</div>
        <textarea v-model="transcript" class="textarea" style="margin-top: 6px" rows="5"></textarea>
      </div>
      <div class="row" style="margin-top: 12px">
        <button class="btn btn-primary btn-block" :disabled="loadingSubmit || !transcript.trim()" @click="submit()">
          <span v-if="loadingSubmit"><span class="spinner"></span> 批改中…<span class="btn-en">Reviewing...</span></span>
          <span v-else>✨ 提交批改<span class="btn-en">Submit</span></span>
        </button>
      </div>
    </div>

    <!-- 批改结果 -->
    <template v-if="phase === 'reviewing' && review">
      <ResultCards :review="review" />

      <!-- 播放我的 vs AI -->
      <div class="card" style="margin-top: 14px">
        <div class="h3-hand" style="margin-top: 0">🔊 对比播放<span class="sub-en">Compare</span></div>
        <div class="row" style="flex-wrap: wrap">
          <SpeakPlayer :text="transcript" label="播放我的作答" />
          <SpeakPlayer :text="review.sample_answer" label="播放范文" />
          <button class="btn btn-ghost" @click="favoriteSample()">⭐ 收藏范文<span class="btn-en">Save</span></button>
        </div>
      </div>

      <!-- 连环追问 -->
      <div class="card" style="margin-top: 14px">
        <div class="h3-hand" style="margin-top: 0">🔁 连环追问<span class="sub-en">Follow-ups</span></div>
        <div class="row" style="margin-top: 6px">
          <label style="display: flex; align-items: center; gap: 6px">
            <input type="radio" v-model="followUpMode" value="gentle" /> 温和
          </label>
          <label style="display: flex; align-items: center; gap: 6px">
            <input type="radio" v-model="followUpMode" value="pressure" /> 压力面
          </label>
          <button class="btn btn-ghost" :disabled="loadingFollowUp" @click="askFollowUp()">
            <span v-if="loadingFollowUp"><span class="spinner"></span></span>
            <span v-else>追问下一题<span class="btn-en">Follow-up</span></span>
          </button>
        </div>
        <div v-if="currentFollowUp" class="card card-soft" style="margin-top: 10px">
          <b>面试官：</b>{{ currentFollowUp }}
        </div>
      </div>

      <!-- 下一题 / 新会话 -->
      <div class="row" style="margin-top: 14px">
        <button class="btn btn-primary" @click="pickQuestion()">🎯 下一题<span class="btn-en">Next</span></button>
        <button class="btn btn-ghost" @click="resetAll()">🔄 新会话<span class="btn-en">New Session</span></button>
      </div>
    </template>

    <RawFallback v-if="phase === 'reviewing' && lastError" :raw="lastError.raw" @retry="submit" />

    <!-- 会话历史 -->
    <div v-if="historyTurns.length" class="card" style="margin-top: 14px">
      <div class="h3-hand" style="margin-top: 0">📚 本次会话历史（{{ historyTurns.length }} 题）<span class="sub-en">Session History</span></div>
      <details v-for="(t, i) in [...historyTurns].reverse()" :key="t.id" style="margin-top: 6px">
        <summary style="cursor: pointer; padding: 4px">
          #{{ historyTurns.length - i }} · {{ t.question?.slice(0, 60) }}… · <b>{{ (t.total ?? 0).toFixed(1) }}</b>/10 · {{ formatDate(t.createdAt, false) }}
        </summary>
        <div class="card card-soft" style="margin-top: 4px">
          <div class="muted">你的作答</div>
          <p style="margin: 4px 0">{{ t.transcript }}</p>
          <div v-if="t.followUps?.length" class="muted">追问（不入题库）</div>
          <div v-for="f in t.followUps" :key="f.at" style="margin-top: 4px">
            <span class="tag tag-ghost">{{ f.mode }}</span> {{ f.question }}
          </div>
        </div>
      </details>
    </div>

    <!-- 背诵范文记录（当前会话，可回看；PDF 导出在「题库与收藏 → PDF 导出」勾选） -->
    <div v-if="state.session.recites?.length" class="card" style="margin-top: 14px">
      <div class="h3-hand" style="margin-top: 0">📜 背诵范文记录（{{ state.session.recites.length }}）<span class="sub-en">Recite Records</span></div>
      <details v-for="r in [...state.session.recites].reverse()" :key="r.id" style="margin-top: 6px">
        <summary style="cursor: pointer; padding: 4px">
          {{ r.question?.slice(0, 60) }}… · {{ formatDate(r.createdAt, false) }}
        </summary>
        <div class="card card-soft" style="margin-top: 4px">
          <p style="margin: 4px 0; white-space: pre-wrap; line-height: 1.75">{{ r.text }}</p>
          <div class="row" style="flex-wrap: wrap">
            <SpeakPlayer :text="r.text" label="播放" />
          </div>
        </div>
      </details>
      <div class="faint" style="margin-top: 8px">💡 到「题库与收藏 → 📄 PDF 导出」可勾选导出这些背诵范文。</div>
    </div>

    <UpgradeModal :open="upgradeOpen" :notice="upgradeNotice" @close="closeUpgrade" @go-settings="goSettings" />
  </div>
</template>
