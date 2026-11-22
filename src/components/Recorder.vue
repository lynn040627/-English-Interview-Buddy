<!--
  录音按钮：三态 —— 空闲灰 / 录音中红脉冲 / 处理中 loading
  使用 Web Speech API 实时转写；识别失败兜底手动输入
-->
<script setup>
import { ref, onBeforeUnmount } from 'vue'
import { createRecognizer, isSpeechRecognitionSupported } from '../lib/speech.js'

const props = defineProps({
  lang: { type: String, default: 'en-US' },
  // 自动停录（秒），0 表示不自动停
  autoStopSec: { type: Number, default: 0 }
})
const emit = defineEmits(['final', 'interim', 'state'])
// state: 'idle' | 'recording' | 'processing'

const state = ref('idle')
const interimText = ref('')
const finalText = ref('')
const manualText = ref('')
const showManualFallback = ref(false)
const recognizeAvailable = ref(isSpeechRecognitionSupported())

let rec = null
let stopTimer = null

async function start() {
  if (state.value !== 'idle') return
  interimText.value = ''
  finalText.value = ''
  manualText.value = ''
  showManualFallback.value = false

  if (!recognizeAvailable.value) {
    // 直接进入手动兜底
    showManualFallback.value = true
    state.value = 'idle'
    return
  }

  try {
    rec = createRecognizer({ lang: props.lang, interim: true })
    rec.onresult = (e) => {
      let interim = ''
      let finals = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) finals += r[0].transcript
        else interim += r[0].transcript
      }
      if (finals) finalText.value += finals
      interimText.value = interim
      emit('interim', currentText.value)
    }
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return
      // 错误时进入兜底
      showManualFallback.value = true
      stopInternal(false)
    }
    rec.onend = () => {
      if (state.value === 'recording') {
        // 自动重启（continuous=false 时某些浏览器会自动停）
        try { rec.start() } catch { showManualFallback.value = true; stopInternal(true) }
      } else {
        // 正常结束
        emit('final', finalText.value)
      }
    }
    rec.start()
    state.value = 'recording'
    emit('state', state.value)

    if (props.autoStopSec > 0) {
      stopTimer = setTimeout(() => stopInternal(true), props.autoStopSec * 1000)
    }
  } catch (err) {
    showManualFallback.value = true
    state.value = 'idle'
  }
}

function stopInternal(sendFinal = true) {
  if (stopTimer) { clearTimeout(stopTimer); stopTimer = null }
  state.value = 'processing'
  emit('state', state.value)
  try { rec?.stop() } catch {}
  setTimeout(() => {
    // 给 onresult 一个时间收 final
    state.value = 'idle'
    emit('state', state.value)
    if (sendFinal) emit('final', currentText.value)
  }, 500)
}

function stop() {
  if (state.value !== 'recording') return
  stopInternal(true)
}

function submitManual() {
  state.value = 'idle'
  emit('final', manualText.value.trim())
  showManualFallback.value = false
}

const currentText = () => (finalText.value + (interimText.value ? ' ' + interimText.value : '')).trim()

onBeforeUnmount(() => {
  try { rec?.abort() } catch {}
  if (stopTimer) clearTimeout(stopTimer)
})

defineExpose({ start, stop, state })
</script>

<template>
  <div class="recorder">
    <button
      v-if="!showManualFallback"
      class="btn"
      :class="{
        'btn-danger pulse-red': state === 'recording',
        'btn-ghost': state !== 'recording'
      }"
      :disabled="state === 'processing'"
      @click="state === 'recording' ? stop() : start()"
    >
      <span v-if="state === 'idle'">🎙️ 开始录音<span class="btn-en">Record</span></span>
      <span v-else-if="state === 'recording'">🔴 录音中 · 点击停止<span class="btn-en">Tap to Stop</span></span>
      <span v-else><span class="spinner"></span> 处理中…<span class="btn-en">Processing</span></span>
    </button>

    <!-- 实时转写预览 -->
    <div v-if="state === 'recording' || finalText || interimText" class="card card-soft" style="margin-top: 10px">
      <div class="muted">实时转写（可稍后手动修改）</div>
      <div style="margin-top: 6px; white-space: pre-wrap;">
        <span>{{ finalText }}</span>
        <span v-if="interimText" style="color: var(--text-faint)">{{ interimText }}</span>
      </div>
    </div>

    <!-- 手动兜底 -->
    <div v-if="showManualFallback" class="card card-soft" style="margin-top: 10px">
      <div class="muted">
        {{ recognizeAvailable ? '识别已停止，请手动输入或补充' : '当前浏览器不支持录音，请手动输入作答' }}
      </div>
      <textarea
        v-model="manualText"
        class="textarea"
        style="margin-top: 8px"
        placeholder="在此粘贴/输入你的回答…"
      ></textarea>
      <button class="btn btn-primary btn-block" style="margin-top: 8px" @click="submitManual">提交<span class="btn-en">Submit</span></button>
    </div>
  </div>
</template>
