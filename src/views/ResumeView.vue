<!-- Tab · 简历深挖：上传/粘贴简历，AI 顺着经历连环追问 -->
<script setup>
import DeepDivePanel from '../components/DeepDivePanel.vue'

defineProps({ active: { type: Boolean, default: true } })
</script>

<template>
  <div>
    <header class="page-head">
      <div class="h1-hand">简历深挖</div>
      <div class="page-head-en">Resume Deep Dive</div>
      <p>AI面试官顺着简历的项目、数据、职责往下挖<span class="page-desc-en">AI interviewer digs into projects, data &amp; responsibilities on your resume</span></p>
    </header>
    <DeepDivePanel mode="resume" :active="active" />
  </div>
</template>
