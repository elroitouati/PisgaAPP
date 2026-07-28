import { supabase } from './supabase'

export type ConversationKind = 'direct' | 'group' | 'challenge'

export type ConversationSummary = {
  id: string
  kind: ConversationKind
  /** Resolved for display: the other person's name for a direct thread. */
  title: string
  /** The other participant, for a direct thread — drives the presence dot. */
  otherUserId: string | null
  lastMessage: string | null
  /** Sender's name, prefixed on the preview in group threads (design 4c). */
  lastSenderName: string | null
  lastAt: string | null
  unread: number
}

export type ChatMessage = {
  id: string
  conversation_id: string
  sender_id: string
  body: string | null
  shared_goal_id: string | null
  created_at: string
  edited_at: string | null
  deleted_at: string | null
}

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message)
  return data as T
}

/**
 * Every thread the user belongs to, with the last message and an unread count.
 *
 * Assembled from three small queries rather than one join: the unread count
 * depends on each member's own last_read_at, which a single flat select cannot
 * express without a correlated subquery per row.
 */
export async function fetchConversations(userId: string): Promise<ConversationSummary[]> {
  const memberships = unwrap(
    await supabase
      .from('conversation_members')
      .select('conversation_id, last_read_at')
      .eq('user_id', userId),
  ) as { conversation_id: string; last_read_at: string }[]

  if (memberships.length === 0) return []
  const ids = memberships.map((m) => m.conversation_id)

  const [conversationRows, memberRows, messageRows] = await Promise.all([
    supabase.from('conversations').select('id, kind, title, user_a, user_b').in('id', ids),
    supabase.from('conversation_members').select('conversation_id, user_id').in('conversation_id', ids),
    supabase
      .from('messages')
      .select('conversation_id, sender_id, body, shared_goal_id, created_at, deleted_at')
      .in('conversation_id', ids)
      .order('created_at', { ascending: false }),
  ])

  const conversations = unwrap(conversationRows) as {
    id: string
    kind: ConversationKind
    title: string | null
    user_a: string | null
    user_b: string | null
  }[]
  const members = unwrap(memberRows) as { conversation_id: string; user_id: string }[]
  const messages = unwrap(messageRows) as {
    conversation_id: string
    sender_id: string
    body: string | null
    shared_goal_id: string | null
    created_at: string
    deleted_at: string | null
  }[]

  const otherIds = new Set(members.filter((m) => m.user_id !== userId).map((m) => m.user_id))
  const names = new Map<string, string>()
  if (otherIds.size > 0) {
    const people = unwrap(
      await supabase.from('profiles').select('id, display_name').in('id', [...otherIds]),
    ) as { id: string; display_name: string | null }[]
    for (const person of people) names.set(person.id, person.display_name ?? '')
  }

  const readAt = new Map(memberships.map((m) => [m.conversation_id, m.last_read_at]))

  return conversations
    .map((conversation) => {
      const thread = messages.filter((m) => m.conversation_id === conversation.id)
      const last = thread[0] ?? null
      const since = readAt.get(conversation.id) ?? '1970-01-01'

      const otherUserId =
        conversation.kind === 'direct'
          ? conversation.user_a === userId
            ? conversation.user_b
            : conversation.user_a
          : null

      return {
        id: conversation.id,
        kind: conversation.kind,
        title:
          conversation.kind === 'direct'
            ? (otherUserId ? names.get(otherUserId) : '') || ''
            : (conversation.title ?? ''),
        otherUserId,
        lastMessage: last?.deleted_at ? null : (last?.body ?? null),
        lastSenderName:
          last && conversation.kind !== 'direct' && last.sender_id !== userId
            ? (names.get(last.sender_id) ?? null)
            : null,
        lastAt: last?.created_at ?? null,
        // Your own messages never count as unread.
        unread: thread.filter((m) => m.sender_id !== userId && m.created_at > since).length,
      }
    })
    .sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''))
}

export async function fetchMessages(conversationId: string): Promise<ChatMessage[]> {
  return unwrap(
    await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true }),
  )
}

export async function openDirectConversation(otherUserId: string): Promise<{ id: string }> {
  return unwrap(
    await supabase.rpc('open_direct_conversation', { p_other_user: otherUserId }).single(),
  )
}

export async function createGroupConversation(
  title: string,
  memberIds: string[],
): Promise<{ id: string }> {
  return unwrap(
    await supabase
      .rpc('create_group_conversation', { p_title: title, p_member_ids: memberIds })
      .single(),
  )
}

export async function sendMessage(
  conversationId: string,
  body: string | null,
  sharedGoalId?: string | null,
): Promise<ChatMessage> {
  return unwrap(
    await supabase
      .rpc('send_message', {
        p_conversation_id: conversationId,
        p_body: body,
        p_shared_goal_id: sharedGoalId ?? null,
      })
      .single(),
  )
}

export async function editMessage(messageId: string, body: string): Promise<ChatMessage> {
  return unwrap(await supabase.rpc('edit_message', { p_message_id: messageId, p_body: body }).single())
}

export async function deleteMessage(messageId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_message', { p_message_id: messageId })
  if (error) throw new Error(error.message)
}

export async function markConversationRead(conversationId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_conversation_read', {
    p_conversation_id: conversationId,
  })
  if (error) throw new Error(error.message)
}

export async function blockUser(userId: string): Promise<void> {
  const { error } = await supabase.rpc('block_user', { p_user_id: userId })
  if (error) throw new Error(error.message)
}

export async function unblockUser(userId: string): Promise<void> {
  const { error } = await supabase.rpc('unblock_user', { p_user_id: userId })
  if (error) throw new Error(error.message)
}

// ── Group management (owner-only) ───────────────────────────────────────────

export async function setGroupPostingMode(
  conversationId: string,
  membersCanPost: boolean,
): Promise<void> {
  const { error } = await supabase.rpc('set_group_posting_mode', {
    p_conversation_id: conversationId,
    p_members_can_post: membersCanPost,
  })
  if (error) throw new Error(error.message)
}

export async function addGroupMember(conversationId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('add_group_member', {
    p_conversation_id: conversationId,
    p_user_id: userId,
  })
  if (error) throw new Error(error.message)
}

export async function removeGroupMember(conversationId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_group_member', {
    p_conversation_id: conversationId,
    p_user_id: userId,
  })
  if (error) throw new Error(error.message)
}

export type ConversationDetail = {
  id: string
  kind: 'direct' | 'group' | 'challenge'
  title: string | null
  createdBy: string
  membersCanPost: boolean
  memberIds: string[]
}

export type MemberProfile = { id: string; display_name: string | null; avatar_url: string | null }

/** Names/avatars for the group-management sheet's member list. */
export async function fetchMemberProfiles(memberIds: string[]): Promise<MemberProfile[]> {
  if (memberIds.length === 0) return []
  return unwrap(
    await supabase.from('profiles').select('id, display_name, avatar_url').in('id', memberIds),
  )
}

/** Full membership + settings for the group-management sheet. */
export async function fetchConversationDetail(conversationId: string): Promise<ConversationDetail> {
  const [conversation, members] = await Promise.all([
    supabase
      .from('conversations')
      .select('id, kind, title, created_by, members_can_post')
      .eq('id', conversationId)
      .single(),
    supabase.from('conversation_members').select('user_id').eq('conversation_id', conversationId),
  ])

  const c = unwrap(conversation) as {
    id: string
    kind: 'direct' | 'group' | 'challenge'
    title: string | null
    created_by: string
    members_can_post: boolean
  }
  const rows = unwrap(members) as { user_id: string }[]

  return {
    id: c.id,
    kind: c.kind,
    title: c.title,
    createdBy: c.created_by,
    membersCanPost: c.members_can_post,
    memberIds: rows.map((r) => r.user_id),
  }
}
