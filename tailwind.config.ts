import type { Config } from 'tailwindcss'

/**
 * 卤化银设计系统 → Tailwind 映射
 * 与 src/design/tokens.ts 保持一致
 */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // 背景层
        bg: {
          0: '#0E0E10',
          1: '#16161A',
          2: '#1E1E24',
          3: '#2A2A32',
        },
        // 前景层
        fg: {
          1: '#F5F3EE',
          2: '#A8A39A',
          3: '#6C6860',
          4: '#3D3A35',
        },
        // 品牌色
        brand: {
          red: '#C8302A',
          amber: '#E8B961',
          'amber-soft': '#F0C983',
          cyan: '#4A8A9E',
        },
        // 情绪色
        sem: {
          success: '#7A9A6B',
          warn: '#C89A4A',
          error: '#B04A42',
          info: '#6C8FA6',
        },
        // 评分色
        score: {
          surpass: '#E8B961',
          reach: '#7A9A6B',
          near: '#C89A4A',
          below: '#B08560',
          far: '#7A5553',
        },
      },
      fontFamily: {
        display: ['"Fraunces"', '"Source Serif 4"', 'Georgia', 'serif'],
        body: ['"Inter"', '"SF Pro Text"', '-apple-system', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"SF Mono"', 'ui-monospace', 'Menlo', 'monospace'],
        numeric: ['"IBM Plex Mono"', '"JetBrains Mono"', 'ui-monospace', 'Menlo', 'monospace'],
      },
      fontSize: {
        xxs: ['10px', { lineHeight: '1.4' }],
        xs: ['11px', { lineHeight: '1.45' }],
        sm: ['12px', { lineHeight: '1.5' }],
        base: ['13px', { lineHeight: '1.55' }],
        md: ['14px', { lineHeight: '1.55' }],
        lg: ['16px', { lineHeight: '1.5' }],
        xl: ['20px', { lineHeight: '1.35' }],
        '2xl': ['26px', { lineHeight: '1.25' }],
        '3xl': ['32px', { lineHeight: '1.2' }],
        '4xl': ['44px', { lineHeight: '1.15' }],
      },
      borderRadius: {
        xs: '3px',
        sm: '5px',
        md: '8px',
        lg: '12px',
        xl: '16px',
      },
      boxShadow: {
        'soft-xs': '0 1px 2px rgba(0,0,0,0.18)',
        'soft-sm': '0 2px 4px rgba(0,0,0,0.22), 0 0 0 1px rgba(255,255,255,0.02)',
        'soft-md': '0 4px 12px rgba(0,0,0,0.32), 0 0 0 1px rgba(255,255,255,0.03)',
        'soft-lg': '0 12px 32px rgba(0,0,0,0.42), 0 0 0 1px rgba(255,255,255,0.04)',
        // 高光 CTA 暖光辉
        glow: '0 0 20px rgba(232, 185, 97, 0.25), 0 0 40px rgba(232, 185, 97, 0.10)',
        // 评分徽章
        badge: '0 1px 0 rgba(255,255,255,0.06) inset, 0 1px 2px rgba(0,0,0,0.4)',
      },
      animation: {
        'fade-in': 'fadeIn 250ms cubic-bezier(0, 0, 0.2, 1)',
        'slide-up': 'slideUp 320ms cubic-bezier(0.2, 0, 0, 1)',
        'scale-in': 'scaleIn 200ms cubic-bezier(0.65, 0.05, 0.36, 1)',
        'glow-pulse': 'glowPulse 3s cubic-bezier(0.4, 0, 0.2, 1) infinite',
        shimmer: 'shimmer 2.4s linear infinite',
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
          '0%,100%': { boxShadow: '0 0 20px rgba(232, 185, 97, 0.25)' },
          '50%': { boxShadow: '0 0 28px rgba(232, 185, 97, 0.4)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
      transitionTimingFunction: {
        standard: 'cubic-bezier(0.4, 0.0, 0.2, 1)',
        emphasized: 'cubic-bezier(0.2, 0.0, 0.0, 1)',
        decelerate: 'cubic-bezier(0.0, 0.0, 0.2, 1)',
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
