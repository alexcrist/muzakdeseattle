import { supabase } from './supabase.js'

const BUCKET = 'profile-pictures'
const MAX_SOURCE_BYTES = 8 * 1024 * 1024
const MAX_SIDE = 512

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read that image.'))
    }
    image.src = url
  })
}

function canvasToBlob(canvas, type, quality) {
  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob), type, quality)
  })
}

async function resizeImage(file) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Choose an image file.')
  }

  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error('Choose an image under 8 MB.')
  }

  const image = await loadImage(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  context.drawImage(image, 0, 0, width, height)

  const webp = await canvasToBlob(canvas, 'image/webp', 0.84)
  if (webp) return { blob: webp, extension: 'webp' }

  const jpeg = await canvasToBlob(canvas, 'image/jpeg', 0.86)
  if (jpeg) return { blob: jpeg, extension: 'jpg' }

  throw new Error('Could not prepare that image for upload.')
}

export async function uploadProfilePicture(playerId, file) {
  const { blob, extension } = await resizeImage(file)
  const path = `players/${playerId}/avatar.${extension}`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, {
      cacheControl: '31536000',
      contentType: blob.type,
      upsert: true,
    })

  if (error) {
    throw new Error(error.message || 'Could not upload profile picture.')
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return `${data.publicUrl}?v=${Date.now()}`
}
