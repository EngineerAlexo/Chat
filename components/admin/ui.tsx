'use client'

import { cn } from '@/lib/utils/cn'
import { ReactNode } from 'react'

// ── Stat Card ──────────────────────────────────────────────────────────────
export function StatCard({
  label, value, sub, icon, color = 'blue', trend
}: {
  label: string; value: string | number; sub?: string
  icon: ReactNode; color?: 'blue' | 'green' | 'purple' | 'orange' | 'red'
  trend?: { value: number; label: string }
}) {
  const colors = {
    blue:   'bg-blue-500/10 text-blue-400',
    green:  'bg-green-500/10 text-green-400',
    purple: 'bg-purple-500/10 text-purple-400',
    orange: 'bg-orange-500/10 text-orange-400',
    red:    'bg-red-500/10 text-red-400',
  }
  return (
    <div className="bg-[#0f1117] border border-white/5 rounded-xl p-5 hover:border-white/10 transition-all">
      <div className="flex items-start justify-between mb-4">
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', colors[color])}>
          {icon}
        </div>
        {trend && (
          <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full',
            trend.value >= 0 ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
          )}>
            {trend.value >= 0 ? '+' : ''}{trend.value}% {trend.label}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-white mb-0.5">{value}</p>
      <p className="text-sm text-white/40">{label}</p>
      {sub && <p className="text-xs text-white/25 mt-1">{sub}</p>}
    </div>
  )
}

// ── Section Header ─────────────────────────────────────────────────────────
export function SectionHeader({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-xl font-semibold text-white">{title}</h1>
        {sub && <p className="text-sm text-white/40 mt-0.5">{sub}</p>}
      </div>
      {action}
    </div>
  )
}

// ── Badge ──────────────────────────────────────────────────────────────────
export function Badge({ label, color = 'gray' }: { label: string; color?: string }) {
  const map: Record<string, string> = {
    admin:     'bg-purple-500/15 text-purple-400 border-purple-500/20',
    moderator: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    user:      'bg-white/5 text-white/50 border-white/10',
    active:    'bg-green-500/15 text-green-400 border-green-500/20',
    suspended: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
    banned:    'bg-red-500/15 text-red-400 border-red-500/20',
    gray:      'bg-white/5 text-white/50 border-white/10',
  }
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border', map[color] ?? map.gray)}>
      {label}
    </span>
  )
}

// ── Table ──────────────────────────────────────────────────────────────────
export function Table({ headers, children, empty }: {
  headers: string[]; children: ReactNode; empty?: boolean
}) {
  return (
    <div className="bg-[#0f1117] border border-white/5 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/5">
            {headers.map((h) => (
              <th key={h} className="text-left px-4 py-3 text-white/40 font-medium text-xs uppercase tracking-wide">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {empty
            ? <tr><td colSpan={headers.length} className="text-center py-12 text-white/30 text-sm">No data found</td></tr>
            : children}
        </tbody>
      </table>
    </div>
  )
}

export function Tr({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <tr className={cn('border-b border-white/5 hover:bg-white/[0.02] transition-colors', className)}>
      {children}
    </tr>
  )
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn('px-4 py-3 text-white/70', className)}>{children}</td>
}

// ── Search Input ───────────────────────────────────────────────────────────
export function SearchInput({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder ?? 'Search...'}
      className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-tg-blue/50 focus:bg-white/8 transition w-full md:w-64"
    />
  )
}

// ── Button ─────────────────────────────────────────────────────────────────
export function AdminBtn({
  children, onClick, variant = 'default', size = 'sm', disabled, className
}: {
  children: ReactNode; onClick?: () => void
  variant?: 'default' | 'danger' | 'ghost' | 'success'
  size?: 'sm' | 'md'; disabled?: boolean; className?: string
}) {
  const variants = {
    default: 'bg-tg-blue hover:bg-tg-blue-dark text-white',
    danger:  'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20',
    ghost:   'bg-white/5 hover:bg-white/10 text-white/70 hover:text-white',
    success: 'bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20',
  }
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm' }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded-lg font-medium transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed',
        variants[variant], sizes[size], className
      )}
    >
      {children}
    </button>
  )
}

// ── Avatar ─────────────────────────────────────────────────────────────────
export function AdminAvatar({ src, name, size = 32 }: { src?: string | null; name?: string | null; size?: number }) {
  const initials = (name ?? '?')[0].toUpperCase()
  return (
    <div className="rounded-full overflow-hidden bg-tg-blue/20 flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size }}>
      {src
        ? <img src={src} alt={name ?? ''} className="w-full h-full object-cover" />
        : <span className="text-tg-blue font-semibold" style={{ fontSize: size * 0.4 }}>{initials}</span>
      }
    </div>
  )
}
