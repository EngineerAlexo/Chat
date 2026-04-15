'use client'

import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { MessageCircle, Users, UserPlus, Radio } from 'lucide-react'

export default function ChatIndexPage() {
  const router = useRouter()

  return (
    <div className="flex-1 flex items-center justify-center bg-tg-bg-secondary dark:bg-tg-bg-dark-tertiary p-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center max-w-sm"
      >
        <div className="w-20 h-20 bg-tg-blue/10 rounded-full flex items-center justify-center mx-auto mb-5">
          <MessageCircle className="w-10 h-10 text-tg-blue" />
        </div>
        <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-2">Welcome to Telegram Clone</h2>
        <p className="text-tg-text-secondary text-sm mb-6">
          Select a chat from the sidebar or start a new conversation
        </p>

        <div className="grid grid-cols-1 gap-3">
          <ActionCard
            icon={<Users className="w-5 h-5 text-green-500" />}
            title="Find People"
            desc="Discover and message other users"
            onClick={() => router.push('/chat/people')}
            color="bg-green-50 dark:bg-green-900/20"
          />
          <ActionCard
            icon={<UserPlus className="w-5 h-5 text-purple-500" />}
            title="Create Group"
            desc="Start a group conversation"
            onClick={() => router.push('/chat/new-group')}
            color="bg-purple-50 dark:bg-purple-900/20"
          />
          <ActionCard
            icon={<Radio className="w-5 h-5 text-orange-500" />}
            title="Create Channel"
            desc="Broadcast to many subscribers"
            onClick={() => router.push('/chat/new-group')}
            color="bg-orange-50 dark:bg-orange-900/20"
          />
        </div>
      </motion.div>
    </div>
  )
}

function ActionCard({ icon, title, desc, onClick, color }: {
  icon: React.ReactNode
  title: string
  desc: string
  onClick: () => void
  color: string
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 p-4 rounded-2xl bg-white dark:bg-tg-bg-dark-secondary hover:shadow-md transition-all text-left active:scale-[0.98]"
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        {icon}
      </div>
      <div>
        <p className="font-semibold text-sm text-gray-900 dark:text-white">{title}</p>
        <p className="text-xs text-tg-text-secondary">{desc}</p>
      </div>
    </button>
  )
}
