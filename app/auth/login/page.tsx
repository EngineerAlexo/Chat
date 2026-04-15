'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { getSupabaseClient } from '@/lib/supabase/client'
import { MessageCircle, Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import Link from 'next/link'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  useEffect(() => {
    if (searchParams.get('registered') === '1') {
      setInfo('Account created! Sign in below.')
    }
  }, [searchParams])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = getSupabaseClient()
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    if (signInError) {
      // Email not confirmed — give a clear message
      if (
        signInError.message.toLowerCase().includes('email') ||
        signInError.message.toLowerCase().includes('confirm') ||
        signInError.message.toLowerCase().includes('not confirmed')
      ) {
        setError('Please confirm your email first — check your inbox, then try again.')
      } else {
        setError(signInError.message)
      }
      setLoading(false)
      return
    }

    if (!data.session) {
      setError('Login failed — please try again')
      setLoading(false)
      return
    }

    // Auto-create profile if missing
    const userId = data.user.id
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle()

    if (!profile) {
      const uname = data.user.email?.split('@')[0]?.replace(/[^a-z0-9_]/gi, '_') ?? `user_${userId.slice(0, 6)}`
      await supabase.from('profiles').upsert({
        id: userId,
        username: uname,
        avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${uname}`,
        bio: '',
        online_status: false,
      })
    }

    router.push('/chat')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-tg-blue/10 to-tg-blue/5 dark:from-slate-900 dark:to-slate-800 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-modal p-8"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-tg-blue rounded-full flex items-center justify-center mb-4">
            <MessageCircle className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Sign in</h1>
          <p className="text-tg-text-secondary text-sm mt-1">Welcome back</p>
        </div>

        {info && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-green-600 text-sm text-center bg-green-50 dark:bg-green-900/20 rounded-lg py-2 px-3 mb-4"
          >
            {info}
          </motion.p>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tg-text-secondary" />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-tg-border dark:border-slate-600 bg-tg-bg-secondary dark:bg-slate-700 text-gray-900 dark:text-white placeholder-tg-text-secondary focus:outline-none focus:ring-2 focus:ring-tg-blue transition"
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tg-text-secondary" />
            <input
              type={showPass ? 'text' : 'password'}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full pl-10 pr-10 py-3 rounded-xl border border-tg-border dark:border-slate-600 bg-tg-bg-secondary dark:bg-slate-700 text-gray-900 dark:text-white placeholder-tg-text-secondary focus:outline-none focus:ring-2 focus:ring-tg-blue transition"
            />
            <button
              type="button"
              onClick={() => setShowPass(!showPass)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-tg-text-secondary"
            >
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-red-500 text-sm text-center bg-red-50 dark:bg-red-900/20 rounded-lg py-2 px-3"
            >
              {error}
            </motion.p>
          )}

          <button
            type="submit"
            disabled={loading}
            className={cn(
              'w-full py-3 rounded-xl font-semibold text-white transition flex items-center justify-center',
              'bg-tg-blue hover:bg-tg-blue-dark active:scale-[0.98]',
              loading && 'opacity-70 cursor-not-allowed'
            )}
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-sm text-tg-text-secondary mt-6">
          Don&apos;t have an account?{' '}
          <Link href="/auth/register" className="text-tg-blue hover:underline font-medium">
            Sign up
          </Link>
        </p>
      </motion.div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
