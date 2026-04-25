import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import { AuroraBackdrop, GrainOverlay } from './design'
import { useAppNavigation } from './lib/useAppNavigation'
import { useGlobalHotkeys } from './lib/useGlobalHotkeys'
import AIStudio from './routes/AIStudio'
import Batch from './routes/Batch'
import Editor from './routes/Editor'
import Extract from './routes/Extract'
import Filters from './routes/Filters'
import Library from './routes/Library'
import Settings from './routes/Settings'
import TasteLab from './routes/TasteLab'
import Trending from './routes/Trending'
import Watermark from './routes/Watermark'
import { useAppStore } from './stores/appStore'

export default function App() {
  const init = useAppStore((s) => s.init)
  const error = useAppStore((s) => s.error)
  const loading = useAppStore((s) => s.loading)

  useEffect(() => {
    init()
  }, [init])

  // 菜单点击 / 原生 accelerator 的路由桥接
  useAppNavigation()
  // 渲染端兜底快捷键（⌘, 等）
  useGlobalHotkeys()

  return (
    <div className="flex h-screen bg-bg-0 text-fg-1 overflow-hidden relative isolate">
      {/* Aurora 极光底层（60s 漂移） */}
      <AuroraBackdrop />
      {/* 极淡颗粒（保留胶片灵魂，Q3-A） */}
      <GrainOverlay opacity={0.02} />

      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        <TopBar />
        <main className="flex-1 overflow-auto relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-bg-0/60 backdrop-blur-sm z-40">
              <div className="text-fg-2 text-sm font-mono animate-pulse">Loading…</div>
            </div>
          )}
          {error && (
            <div className="m-6 card p-4 border-sem-error/40 bg-sem-error/10 text-sem-error text-sm">
              ⚠ {error}
            </div>
          )}
          <Routes>
            <Route path="/" element={<Navigate to="/library" replace />} />
            <Route path="/library" element={<Library />} />
            <Route path="/editor/:photoId?" element={<Editor />} />
            <Route path="/batch" element={<Batch />} />
            <Route path="/filters" element={<Filters />} />
            <Route path="/extract" element={<Extract />} />
            <Route path="/taste" element={<TasteLab />} />
            <Route path="/watermark" element={<Watermark />} />
            <Route path="/ai" element={<AIStudio />} />
            <Route path="/trending" element={<Trending />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
