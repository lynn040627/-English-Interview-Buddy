import { createApp } from 'vue'
import App from './App.vue'
import './styles/global.css'

// 全局启动：注册 store、挂载根组件
const app = createApp(App)
app.mount('#app')
