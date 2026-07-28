import { useMemo } from 'react'
import { useAuth } from '@/providers/useAuth'
import { useAsync } from './useAsync'
import { fetchConversations, type ConversationSummary } from '@/lib/chat'

export function useConversations() {
  const { user } = useAuth()
  const { data, loading, error, reload } = useAsync<ConversationSummary[]>(
    () => (user ? fetchConversations(user.id) : Promise.resolve([])),
    [user?.id],
  )
  const conversations = useMemo(() => data ?? [], [data])
  return { conversations, loading, error, reload }
}
