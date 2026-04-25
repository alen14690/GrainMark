import clsx from 'clsx'
import {
  Film,
  Flame,
  FlaskConical,
  Images,
  Layers,
  ScanSearch,
  Settings as SettingsIcon,
  Sparkles,
  Stamp,
  Wand2,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'

const NAV = [
  { to: '/library', icon: Images, label: '图库', desc: '导入 / 浏览照片' },
  { to: '/editor', icon: Wand2, label: '编辑器', desc: '单图后期' },
  { to: '/batch', icon: Layers, label: '批量处理', desc: '一键应用到多张' },
  { to: '/filters', icon: Film, label: '滤镜库', desc: '内置 + 用户滤镜' },
  { to: '/extract', icon: FlaskConical, label: '风格提取', desc: '从参考图生成滤镜' },
  { to: '/watermark', icon: Stamp, label: '水印', desc: 'EXIF 驱动水印' },
  { to: '/ai', icon: Sparkles, label: 'AI 工作室', desc: '降噪 / 超分 / 天空 / 消除' },
  { to: '/trending', icon: Flame, label: '热度榜', desc: '社区胶片趋势' },
]

export default function Sidebar() {
  return (
    <aside className="w-64 shrink-0 border-r border-ink-900 bg-ink-950/90 flex flex-col">
      {/* Logo */}
      <div className="h-14 px-5 flex items-center gap-2.5 drag-region border-b border-ink-900/80">
        <div className="relative w-8 h-8 rounded-md bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center overflow-hidden">
          <ScanSearch className="w-4 h-4 text-ink-950" />
          <span className="absolute inset-0 film-grain" />
        </div>
        <div className="no-drag">
          <div className="font-display font-semibold text-[15px] tracking-tight leading-none">GrainMark</div>
          <div className="text-[10px] text-ink-500 font-mono mt-0.5">AI POST · v1.0</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5 no-drag">
        {NAV.map(({ to, icon: Icon, label, desc }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                'group flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150',
                isActive
                  ? 'bg-ink-800/80 text-ink-50 shadow-sm'
                  : 'text-ink-400 hover:bg-ink-900 hover:text-ink-100',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  className={clsx(
                    'w-[18px] h-[18px] shrink-0 transition-colors',
                    isActive ? 'text-accent-400' : 'text-ink-500 group-hover:text-ink-300',
                  )}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium leading-tight">{label}</div>
                  <div className="text-[10.5px] text-ink-500 truncate mt-0.5">{desc}</div>
                </div>
                {isActive && <span className="w-1 h-1 rounded-full bg-accent-500" />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer — Settings */}
      <div className="p-3 border-t border-ink-900/80 no-drag">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            clsx(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-colors',
              isActive ? 'bg-ink-800 text-ink-50' : 'text-ink-400 hover:bg-ink-900 hover:text-ink-100',
            )
          }
        >
          <SettingsIcon className="w-[18px] h-[18px]" />
          <span>设置</span>
        </NavLink>
      </div>
    </aside>
  )
}
