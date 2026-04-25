/**
 * Sidebar — 卤化银风格导航栏
 */
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
  Target,
  Wand2,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { cn } from '../design'

interface NavItem {
  to: string
  icon: typeof Images
  label: string
  desc: string
  badge?: string
}

const NAV_MAIN: NavItem[] = [
  { to: '/library', icon: Images, label: '图库', desc: 'Library' },
  { to: '/editor', icon: Wand2, label: '编辑器', desc: 'Editor' },
  { to: '/batch', icon: Layers, label: '批量处理', desc: 'Batch' },
]

const NAV_STUDIO: NavItem[] = [
  { to: '/filters', icon: Film, label: '滤镜库', desc: 'Filters' },
  { to: '/extract', icon: FlaskConical, label: '风格提取', desc: 'Extract' },
  { to: '/taste', icon: Target, label: '口味参考集', desc: 'Taste Lab', badge: 'NEW' },
  { to: '/watermark', icon: Stamp, label: '水印', desc: 'Watermark' },
  { to: '/ai', icon: Sparkles, label: 'AI 工作室', desc: 'AI Studio' },
  { to: '/trending', icon: Flame, label: '热度榜', desc: 'Trending' },
]

export default function Sidebar() {
  return (
    <aside className="w-60 shrink-0 border-r border-fg-4/60 bg-bg-0 flex flex-col relative">
      {/* 品牌 */}
      <div className="h-14 px-4 flex items-center gap-2.5 drag-region border-b border-fg-4/40">
        <div className="relative w-8 h-8 rounded-md bg-gradient-to-br from-brand-amber to-brand-red flex items-center justify-center overflow-hidden shadow-glow">
          <ScanSearch className="w-4 h-4 text-bg-0" strokeWidth={2.5} />
        </div>
        <div className="no-drag flex-1 min-w-0">
          <div className="font-display-serif text-md tracking-tight text-fg-1 leading-none">GrainMark</div>
          <div className="text-xxs text-fg-3 font-mono mt-1">FILM · POST v1.0</div>
        </div>
      </div>

      {/* 导航 */}
      <nav className="flex-1 overflow-y-auto py-3 no-drag">
        <NavGroup title="工作台">
          {NAV_MAIN.map((item) => (
            <NavItemLink key={item.to} {...item} />
          ))}
        </NavGroup>
        <NavGroup title="Studio">
          {NAV_STUDIO.map((item) => (
            <NavItemLink key={item.to} {...item} />
          ))}
        </NavGroup>
      </nav>

      {/* 设置 */}
      <div className="p-3 border-t border-fg-4/40 no-drag">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm',
              'transition-colors duration-fast',
              isActive ? 'bg-bg-2 text-fg-1' : 'text-fg-2 hover:text-fg-1 hover:bg-bg-2',
            )
          }
          title="设置（⌘,）"
        >
          <SettingsIcon className="w-4 h-4" strokeWidth={1.8} />
          <span className="flex-1">设置</span>
          <span className="kbd" aria-hidden>
            ⌘,
          </span>
        </NavLink>
      </div>
    </aside>
  )
}

function NavGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-3 mb-4">
      <div className="px-3 mb-1.5 text-xxs uppercase tracking-[0.12em] text-fg-3 font-mono">{title}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

function NavItemLink({ to, icon: Icon, label, desc, badge }: NavItem) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-3 px-3 py-2 rounded-md',
          'transition-colors duration-fast',
          isActive ? 'bg-bg-2 text-fg-1' : 'text-fg-2 hover:text-fg-1 hover:bg-bg-1',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            className={cn(
              'w-4 h-4 shrink-0 transition-colors',
              isActive ? 'text-brand-amber' : 'text-fg-3 group-hover:text-fg-2',
            )}
            strokeWidth={1.8}
          />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium leading-tight">{label}</div>
            <div className="text-xxs text-fg-3 font-mono leading-tight mt-0.5">{desc}</div>
          </div>
          {badge && (
            <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-brand-amber/20 text-brand-amber tracking-wider">
              {badge}
            </span>
          )}
          {isActive && <span className="w-1 h-1 rounded-full bg-brand-amber shadow-glow" />}
        </>
      )}
    </NavLink>
  )
}
