'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { getSupabaseClient } from '@/lib/supabase/client'
import { MessageCircle, Mail, Lock, User, Eye, EyeOff, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import Link from 'next/link'

type Step = 'form' | 'confirming'

export default function RegisterPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState<Step>('form')

  // Debounce: track last submit time to prevent rapid re-submits
  const lastSubmitRef = useRef<number>(0)
  // Store credentials for the "try again" button on confirming screen
  const credRef = useRef({ email: '', password: '', username: '' })

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()

    // ── Debounce: 3 s between attempts ──────────────────────────────────────
    const now = Date.now()
    if (now - lastSubmitRef.current < 3000) {
      setError('Please wait a moment before trying again')
      return
    }
    lastSubmitRef.current = now

    if (loading) return
    setLoading(true)
    setError('')

    const cleanUsername = username.toLowerCase().trim().replace(/\s+/g, '_')
    if (!/^[a-z0-9_]{3,20}$/.test(cleanUsername)) {
      setError('Username: 3–20 chars, letters / numbers / underscore only')
      setLoading(false)
      return
    }

    const supabase = getSupabaseClient()

    // ── Check username uniqueness ────────────────────────────────────────────
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', cleanUsername)
      .maybeSingle()

    if (existing) {
      setError('Username already taken — choose another')
      setLoading(false)
      return
    }

    // ── Step 1: signUp ───────────────────────────────────────────────────────
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username: cleanUsername } },
    })

    if (signUpError) {
      const msg = signUpError.message.toLowerCase()

      if (msg.includes('rate limit') || msg.includes('too many') || msg.includes('429')) {
        setError('Too many attempts — please wait a few minutes and try again')
        setLoading(false)
        return
      }
      if (msg.includes('already registered') || msg.includes('already exists')) {
        // Account exists — just sign in
        credRef.current = { email, password, username: cleanUsername }
        await attemptSignIn(email, password, cleanUsername)
        return
      }
      setError(signUpError.message)
      setLoading(false)
      return
    }

    const userId = signUpData.user?.id
    if (!userId) {
      setError('Signup failed — please try again')
      setLoading(false)
      return
    }

    // ── Step 2: create profile (works even before email confirmation) ────────
    const { error: profileErr } = await supabase.from('profiles').upsert({
      id: userId,
      username: cleanUsername,
      avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${cleanUsername}`,
      bio: '',
      online_status: false,
    })

    if (profileErr) {
      console.error('[register] profile upsert error:', profileErr.message)
      // Non-fatal — continue to sign-in attempt
    }

    // ── Step 3: sign in immediately ──────────────────────────────────────────
    credRef.current = { email, password, username: cleanUsername }
    await attemptSignIn(email, password, cleanUsername)
  }

  async function attemptSignIn(em: string, pw: string, uname: string) {
    const supabase = getSupabaseClient()

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: em,
      password: pw,
    })

    if (!signInError && signInData.session) {
      // ── Ensure profile exists ──────────────────────────────────────────────
      const userId = signInData.user.id
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .maybeSingle()

      if (!profile) {
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
      return
    }

    // ── Sign-in failed ────────────────────────────────────────────────────────
    const msg = signInError?.message?.toLowerCase() ?? ''

    if (msg.includes('rate limit') || msg.includes('too many') || msg.includes('429')) {
      setError('Too many attempts — please wait a few minutes and try again')
      setLoading(false)
      return
    }

    if (
      msg.includes('email not confirmed') ||
      msg.includes('not confirmed') ||
      msg.includes('confirm')
    ) {
      // Email confirmation required — show the waiting screen
      setStep('confirming')
      setLoading(false)
      return
    }

    setError(signInError?.message ?? 'Sign-in failed — try the login page')
    setLoading(false)
  }

  // ── "Check your email" screen ─────────────────────────────────────────────
  if (step === 'confirming') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-tg-blue/10 to-tg-blue/5 dark:from-slate-900 dark:to-slate-800 p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-modal p-8 text-center"
        >
          <div className="w-16 h-16 bg-tg-blue/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Mail className="w-8 h-8 text-tg-blue" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Check your email</h2>
          <p className="text-tg-text-secondary text-sm mb-6">
            A confirmation link was sent to{' '}
            <strong className="text-gray-900 dark:text-white">{credRef.current.email}</strong>.
            Click it, then press the button below.
          </p>
          <button
            onClick={async () => {
              setLoading(true)
              const { email, password, username } = credRef.current
              await attemptSignIn(email, password, username)
            }}
            disabled={loading}
            className="w-full py-3 rounded-xl bg-tg-blue hover:bg-tg-blue-dark text-white font-semibold text-sm transition flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {loading
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : 'I confirmed — sign me in'}
          </button>
          {error && (
            <p className="mt-3 text-red-500 text-xs">{error}</p>
          )}
          <Link href="/auth/login" className="block mt-4 text-sm text-tg-blue hover:underline">
            Go to login page instead
          </Link>
        </motion.div>
      </div>
    )
  }

  // ── Main registration form ────────────────────────────────────────────────
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Create Account</h1>
          <p className="text-tg-text-secondary text-sm mt-1">Join the chat today</p>
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          {/* Username */}
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tg-text-secondary" />
            <input
              type="text"
              placeholder="Username (e.g. john_doe)"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              maxLength={20}
              disabled={loading}
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-tg-border dark:border-slate-600 bg-tg-bg-secondary dark:bg-slate-700 text-gray-900 dark:text-white placeholder-tg-text-secondary focus:outline-none focus:ring-2 focus:ring-tg-blue transition disabled:opacity-60"
            />
          </div>

          {/* Email */}
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tg-text-secondary" />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-tg-border dark:border-slate-600 bg-tg-bg-secondary dark:bg-slate-700 text-gray-900 dark:text-white placeholder-tg-text-secondary focus:outline-none focus:ring-2 focus:ring-tg-blue transition disabled:opacity-60"
            />
          </div>

          {/* Password */}
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tg-text-secondary" />
            <input
              type={showPass ? 'text' : 'password'}
              placeholder="Password (min 6 chars)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              disabled={loading}
              className="w-full pl-10 pr-10 py-3 rounded-xl border border-tg-border dark:border-slate-600 bg-tg-bg-secondary dark:bg-slate-700 text-gray-900 dark:text-white placeholder-tg-text-secondary focus:outline-none focus:ring-2 focus:ring-tg-blue transition disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => setShowPass(!showPass)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-tg-text-secondary"
            >
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* Error */}
          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-red-500 text-sm text-center bg-red-50 dark:bg-red-900/20 rounded-lg py-2 px-3"
            >
              {error}
            </motion.p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className={cn(
              'w-full py-3 rounded-xl font-semibold text-white transition flex items-center justify-center gap-2',
              'bg-tg-blue hover:bg-tg-blue-dark active:scale-[0.98]',
              loading && 'opacity-70 cursor-not-allowed'
            )}
          >
            {loading
              ? <><Loader2 className="w-5 h-5 animate-spin" /> Creating account...</>
              : 'Create Account & Sign In'}
          </button>
        </form>

        <p className="text-center text-sm text-tg-text-secondary mt-6">
          Already have an account?{' '}
          <Link href="/auth/login" className="text-tg-blue hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </motion.div>
    </div>
  )
}
