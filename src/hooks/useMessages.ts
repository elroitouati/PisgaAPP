import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  deleteMessage,
  editMessage,
  fetchMessages,
  markConversationRead,
  sendMessage,
  type ChatMessage,
} from '@/lib/chat'

/**
 * One thread's messages, kept live.
 *
 * Realtime rather than polling: a chat that lags behind by a poll interval
 * reads as broken. The initial fetch and the stream are reconciled by id, so a
 * message that arrives on the socket while the fetch is in flight cannot be
 * inserted twice.
 */
export function useMessages(conversationId: string | undefined) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const upsert = useCallback((incoming: ChatMessage) => {
    setMessages((current) => {
      const index = current.findIndex((message) => message.id === incoming.id)
      if (index === -1) {
        return [...current, incoming].sort((a, b) => a.created_at.localeCompare(b.created_at))
      }
      const next = [...current]
      next[index] = incoming
      return next
    })
  }, [])

  useEffect(() => {
    if (!conversationId) return
    let active = true

    setLoading(true)
    setError(null)

    fetchMessages(conversationId).then(
      (rows) => {
        if (!active) return
        // Merge rather than replace: anything the socket delivered first stays.
        setMessages((current) => {
          const byId = new Map(current.map((message) => [message.id, message]))
          for (const row of rows) byId.set(row.id, row)
          return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at))
        })
        setLoading(false)
        void markConversationRead(conversationId)
      },
      (caught: Error) => {
        if (!active) return
        setError(caught)
        setLoading(false)
      },
    )

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const removed = payload.old as { id: string }
            setMessages((current) => current.filter((message) => message.id !== removed.id))
            return
          }
          upsert(payload.new as ChatMessage)
        },
      )
      .subscribe()

    return () => {
      active = false
      void supabase.removeChannel(channel)
    }
  }, [conversationId, upsert])

  const send = useCallback(
    async (body: string | null, sharedGoalId?: string | null) => {
      if (!conversationId) return
      const row = await sendMessage(conversationId, body, sharedGoalId)
      upsert(row)
    },
    [conversationId, upsert],
  )

  const edit = useCallback(
    async (messageId: string, body: string) => {
      upsert(await editMessage(messageId, body))
    },
    [upsert],
  )

  const remove = useCallback(
    async (messageId: string) => {
      await deleteMessage(messageId)
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? { ...message, body: null, shared_goal_id: null, deleted_at: new Date().toISOString() }
            : message,
        ),
      )
    },
    [],
  )

  return { messages, loading, error, send, edit, remove }
}
