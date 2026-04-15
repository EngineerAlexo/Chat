import { getSupabaseClient } from '@/lib/supabase/client'
import type { MediaType } from '@/lib/types'

export function getMediaType(file: File): MediaType {
  if (file.type.startsWith('image/gif')) return 'gif'
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('audio/')) return 'audio'
  return 'file'
}

export async function uploadFile(
  file: File,
  bucket: string,
  path: string,
  onProgress?: (pct: number) => void
): Promise<string> {
  const supabase = getSupabaseClient()

  // Simulate progress since Supabase JS doesn't expose XHR progress
  let pct = 0
  const interval = setInterval(() => {
    pct = Math.min(pct + 10, 90)
    onProgress?.(pct)
  }, 200)

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: true, contentType: file.type })

  clearInterval(interval)
  onProgress?.(100)

  if (error) throw error

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data.path)
  return urlData.publicUrl
}

export async function compressImage(file: File, maxWidth = 1280): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file

  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxWidth / img.width)
      const canvas = document.createElement('canvas')
      canvas.width = img.width * scale
      canvas.height = img.height * scale
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        (blob) => {
          if (!blob) return resolve(file)
          resolve(new File([blob], file.name, { type: 'image/jpeg' }))
        },
        'image/jpeg',
        0.85
      )
    }
    img.onerror = () => resolve(file)
    img.src = url
  })
}
