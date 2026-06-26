import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

export default function useRealtimeData({ channelName, fetcher, initialData, tables }) {
  const [data, setData] = useState(initialData)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const next = await fetcher()
    setData(next)
    setLoading(false)
    return next
  }, [fetcher])

  useEffect(() => {
    let mounted = true

    async function loadIfMounted() {
      const next = await fetcher()
      if (!mounted) return
      setData(next)
      setLoading(false)
    }

    loadIfMounted()

    const channel = supabase.channel(channelName)
    tables.forEach(table => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, loadIfMounted)
    })
    channel.subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [channelName, fetcher, tables])

  return { data, loading, reload: load }
}
