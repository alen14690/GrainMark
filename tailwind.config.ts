import type { Config } from 'tailwindcss'

/**
 * Aurora Glass 设计系统 → Tailwind 映射
 * 与 src/design/tokens.ts 保持一致（Pass 2.5）
 *
 * 兼容策略：保留原 bg-bg-0..3 / text-fg-1..4 / brand-amber / sem-* 等类名，
 *         只切换底层色值；新增 glass-*, aurora-*, glow-violet/cyan 等工具。
 */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // 背景层 —— Aurora 深空
        bg: {
          0: '#05060E',
          1: '#0A0B1E',
          2: '#141430',
          3: '#1E1E3C',
        },
        // 前景层 —— 冷白
        fg: {
          1: '#E8E6F0',
          2: '#A8A5B8',
          3: '#6A6882',
          4: '#2D2D45',
        },
        // 品牌色
        brand: {
          red: '#C8302A', // 仅 error / 破坏性操作
          amber: '#D4B88A',
          'amber-soft': '#E8D2A8',
          violet: '#B589FF',
          'violet-soft': '#CCABFF',
          cyan: '#5ECDF7',
          // 旧名兼容（Slider/Histogram 等用过 brand-cyan）
          'cyan-deep': '#5ECDF7',
        },
        // 情绪色
        sem: {
          success: '#7DDAB2',
          warn: '#E8B961',
          error: '#FF5A5F',
          info: '#8AB4F8',
        },
        // 评分色
        score: {
          surpass: '#D4B88A',
          reach: '#7DDAB2',
          near: '#E8B961',
          below: '#D0907A',
          far: '#8A6575',
        },
        // 玻璃层（可做 bg-glass-surface 之类）
        glass: {
          surface: 'rgba(255,255,255,0.04)',
          elevated: 'rgba(255,255,255,0.06)',
          overlay: 'rgba(255,255,255,0.08)',
          border: 'rgba(255,255,255,0.10)',
          'border-strong': 'rgba(255,255,255,0.18)',
        },
        // Aurora 光源
        aurora: {
          violet: '#3A2D7A',
          cyan: '#5ECDF7',
          magenta: '#B589FF',
          rose: '#E06BA8',
        },
      },
      fontFamily: {
        // Display：意式斜体衬线（大标题用）
        display: ['"Instrument Serif"', '"Source Serif 4"', 'Georgia', 'serif'],
        body: ['"Inter"', '"SF Pro Text"', '-apple-system', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"SF Mono"', 'ui-monospace', 'Menlo', 'monospace'],
        numeric: ['"JetBrains Mono"', '"SF Mono"', 'ui-monospace', 'Menlo', 'monospace'],
      },
      fontSize: {
        xxs: ['10px', { lineHeight: '1.4' }],
        xs: ['11px', { lineHeight: '1.45' }],
        sm: ['12px', { lineHeight: '1.5' }],
        base: ['13px', { lineHeight: '1.55' }],
        md: ['14px', { lineHeight: '1.55' }],
        lg: ['16px', { lineHeight: '1.5' }],
        xl: ['20px', { lineHeight: '1.35' }],
        '2xl': ['28px', { lineHeight: '1.2' }],
        '3xl': ['36px', { lineHeight: '1.15' }],
        '4xl': ['48px', { lineHeight: '1.1' }],
      },
      borderRadius: {
        xs: '4px',
        sm: '6px',
        md: '10px',
        lg: '14px',
        xl: '20px',
      },
      boxShadow: {
        'soft-xs': '0 1px 2px rgba(0,0,0,0.20)',
        'soft-sm': '0 2px 6px rgba(0,0,0,0.28), 0 0 0 1px rgba(255,255,255,0.04)',
        'soft-md': '0 8px 24px rgba(0,0,0,0.36), 0 0 0 1px rgba(255,255,255,0.05)',
        'soft-lg': '0 20px 50px rgba(0,0,0,0.46), 0 0 0 1px rgba(255,255,255,0.06)',
        // 玻璃顶部高光
        'glass-inset': 'inset 0 1px 0 rgba(255,255,255,0.15)',
        // CTA 金辉
        glow: '0 0 20px rgba(212, 184, 138, 0.28), 0 0 40px rgba(212, 184, 138, 0.12)',
        // Aurora 紫辉 / 青辉
        'glow-violet': '0 0 16px rgba(181, 137, 255, 0.40), 0 0 32px rgba(181, 137, 255, 0.18)',
        'glow-cyan': '0 0 16px rgba(94, 205, 247, 0.35), 0 0 32px rgba(94, 205, 247, 0.12)',
        badge: '0 1px 0 rgba(255,255,255,0.08) inset, 0 1px 2px rgba(0,0,0,0.5)',
      },
      backgroundImage: {
        'aurora-fill': 'linear-gradient(90deg, #5ECDF7, #B589FF)',
      },
      animation: {
        'fade-in': 'fadeIn 250ms cubic-bezier(0, 0, 0.2, 1)',
        'slide-up': 'slideUp 320ms cubic-bezier(0.2, 0, 0, 1)',
        'scale-in': 'scaleIn 200ms cubic-bezier(0.65, 0.05, 0.36, 1)',
        'glow-pulse': 'glowPulse 3s cubic-bezier(0.4, 0, 0.2, 1) infinite',
        shimmer: 'shimmer 2.4s linear infinite',
        // Aurora 60s 漂移（Q2-B）
        'aurora-drift': 'auroraDrift 60s cubic-bezier(0.4, 0, 0.2, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        glowPulse: {
          '0%,100%': { boxShadow: '0 0 20px rgba(212, 184, 138, 0.28)' },
          '50%': { boxShadow: '0 0 28px rgba(212, 184, 138, 0.44)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        auroraDrift: {
          '0%,100%': { transform: 'translate3d(0,0,0) scale(1)' },
          '25%': { transform: 'translate3d(2%, -2%, 0) scale(1.04)' },
          '50%': { transform: 'translate3d(-1%, 3%, 0) scale(0.98)' },
          '75%': { transform: 'translate3d(-3%, -1%, 0) scale(1.02)' },
        },
      },
      backdropBlur: {
        xs: '4px',
        sm: '12px',
        md: '20px',
        lg: '28px',
        xl: '40px',
      },
      transitionTimingFunction: {
        standard: 'cubic-bezier(0.4, 0.0, 0.2, 1)',
        emphasized: 'cubic-bezier(0.2, 0.0, 0.0, 1)',
        decelerate: 'cubic-bezier(0.0, 0.0, 0.2, 1)',
        liquid: 'cubic-bezier(0.22, 1.0, 0.36, 1.0)',
        filmic: 'cubic-bezier(0.65, 0.05, 0.36, 1)',
      },
      transitionDuration: {
        instant: '80ms',
        fast: '150ms',
        base: '250ms',
        slow: '420ms',
      },
    },
  },
  plugins: [],
} satisfies Config
