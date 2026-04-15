# Telegram Clone

A pixel-perfect, full-featured Telegram Web clone built with Next.js 14, Supabase, Zustand, and Framer Motion.

## Features

- Real-time messaging with Supabase Realtime
- Optimistic UI (messages appear instantly)
- Voice messages with waveform visualization
- Image/video/file sharing with drag & drop
- Emoji picker + sticker panel
- Message reactions (double-click or hover)
- Reply, edit, delete (for me / for everyone)
- Typing indicators with presence system
- Online/offline status
- Dark/Light mode
- Virtualized message list (60fps scrolling)
- Infinite scroll with cursor-based pagination
- Saved Messages (personal cloud)
- New chat search by username

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Create a Supabase project
Go to [supabase.com](https://supabase.com) and create a new project.

### 3. Run the SQL schema
In your Supabase Dashboard → SQL Editor, paste and run the contents of `supabase/schema.sql`.

### 4. Configure environment variables
Edit `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Both values are in Supabase Dashboard → Settings → API.

### 5. Enable Realtime
In Supabase Dashboard → Database → Replication, enable realtime for:
- `messages`
- `reactions`
- `profiles`

### 6. Run the dev server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS |
| State | Zustand |
| Animations | Framer Motion |
| Backend | Supabase (Postgres + Auth + Realtime + Storage) |
| Icons | Lucide React |
| Audio | Howler.js |
| Virtualization | @tanstack/react-virtual |
| Emoji | emoji-picker-react |

## Project Structure

```
app/
  auth/login/         Login page
  auth/register/      Register page
  chat/               Chat index (empty state)
  chat/[id]/          Active chat page

components/
  chat/
    ChatLayout.tsx    Root layout with presence
    ChatSidebar.tsx   Conversation list
    ChatWindow.tsx    Chat container
    ChatHeader.tsx    Chat header with status
    MessageList.tsx   Virtualized message list
    MessageBubble.tsx Individual message with actions
    MessageInput.tsx  Input with voice/media/emoji
    VoiceMessage.tsx  Voice playback with waveform
    MediaMessage.tsx  Image/video/file renderer
    NewChatModal.tsx  User search + start chat
  ui/
    Avatar.tsx        User avatar with online dot
    EmojiPickerPanel  Emoji picker wrapper
    StickerPicker.tsx Sticker grid panel

lib/
  types/              TypeScript interfaces
  stores/             Zustand store
  supabase/           Client, server, middleware, realtime
  utils/              cn, formatTime, groupMessages, upload

supabase/
  schema.sql          Full DB schema + RLS + triggers
```

## Deployment

Deploy to Vercel:
```bash
npx vercel --prod
```

Add the same env vars in Vercel Dashboard → Settings → Environment Variables.
