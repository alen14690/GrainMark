import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import AIStudio from './routes/AIStudio'
import Batch from './routes/Batch'
import Editor from './routes/Editor'
import Extract from './routes/Extract'
import Filters from './routes/Filters'
import Library from './routes/Library'
import Settings from './routes/Settings'
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

  return (
    <div className="flex h-screen bg-ink-950 text-ink-50 overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 overflow-auto relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-ink-950/60 backdrop-blur z-40">
              <div className="text-ink-300 text-sm animate-pulse-soft">正在初始化...</div>
            </div>
          )}
          {error && (
            <div className="m-6 card p-4 border-red-500/40 bg-red-500/10 text-red-300 text-sm">⚠ {error}</div>
          )}
          <Routes>
            <Route path="/" element={<Navigate to="/library" replace />} />
            <Route path="/library" element={<Library />} />
            <Route path="/editor/:photoId?" element={<Editor />} />
            <Route path="/batch" element={<Batch />} />
            <Route path="/filters" element={<Filters />} />
            <Route path="/extract" element={<Extract />} />
            <Route path="/watermark" element={<Watermark />} />
            <Route path="/trending" element={<Trending />} />
            <Route path="/ai" element={<AIStudio />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
