import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './styles/global.css'

// 挂平台标识到 <html>，让 CSS 能用 [data-platform="darwin"] 做平台差异化样式
//   - macOS：启用标题栏安全区（避开交通灯）
//   - Windows / Linux：无需安全区，让系统原生窗口控件处理
if (typeof document !== 'undefined') {
  const platform = (window as unknown as { grain?: { platform?: string } }).grain?.platform ?? ''
  document.documentElement.setAttribute('data-platform', platform)
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
)
