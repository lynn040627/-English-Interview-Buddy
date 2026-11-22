<!-- TTS 播放按钮：默认浏览器内置，支持强制模型 TTS -->
<script setup>
import { ref, onBeforeUnmount } from 'vue'
import { createSpeaker } from '../lib/speech.js'

const props = defineProps({
  text: { type: String, required: true },
  label: { type: String, default: '播放' },
  forceModel: { type: Boolean, default: false },
  lang: { type: String, default: 'en-US' },
  size: { type: String, default: 'md' } // sm / md / lg
})

const playing = ref(false)
let speaker = null

async function toggle() {
  if (playing.value) { speaker?.stop(); return }
  speaker = createSpeaker(props.text, { forceModel: props.forceModel, lang: props.lang })
  playing.value = true
  try { await speaker.play() }
  catch (e) { alert('播放失败：' + e.message) }
  finally { playing.value = false }
}

onBeforeUnmount(() => speaker?.stop())
</script>

<template>
  <button
    class="btn btn-ghost"
    :class="size === 'sm' ? '' : size === 'lg' ? '' : ''"
    :disabled="!text"
    @click="toggle"
  >
    <span>{{ playing ? '⏹ 停止' : '▶️ ' + label }}<span class="btn-en">{{ playing ? 'Stop' : '' }}</span></span>
  </button>
</template>
