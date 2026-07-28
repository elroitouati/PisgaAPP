import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '@/i18n/useI18n'
import { useAuth } from '@/providers/useAuth'
import { useProfile } from '@/providers/useProfile'
import { useAsync } from '@/hooks/useAsync'
import { useTrackedGoals } from '@/hooks/useGoals'
import { fetchFriends, type FriendProgress } from '@/lib/api'
import { CATEGORIES, categoryStyle, type Category } from '@/lib/categories'
import { AddFriendIcon, SummitIcon } from '@/components/icons'
import { Card, EmptyState, ErrorState, SectionLabel } from '@/components/ui'
import { Spinner } from '@/components/Spinner'
import { useConversations } from '@/hooks/useConversations'
import { usePresence } from '@/hooks/usePresence'
import { openDirectConversation } from '@/lib/chat'
import { ChatIcon } from '@/components/icons'

/**
 * Designs 5e (light) and 2e (dark) — one screen, both palettes.
 *
 * PRD 6.7: friends see each other's progress. Only structured goals feed the
 * comparison; the "done today" counts come straight from the tracking data,
 * which RLS already limits to accepted friends.
 */
export default function Friends() {
  const { t } = useI18n()
  const { user } = useAuth()
  const { profile } = useProfile()
  const { goals } = useTrackedGoals()
  const { conversations } = useConversations()
  const { isOnline } = usePresence()
  const navigate = useNavigate()
  const [opening, setOpening] = useState<string | null>(null)

  // Tapping a friend opens (or reuses) the 1:1 thread — find-or-create lives in
  // the database, so two taps cannot produce two threads.
  async function openChat(friendId: string) {
    setOpening(friendId)
    try {
      const conversation = await openDirectConversation(friendId)
      navigate(`/chat/${conversation.id}`)
    } finally {
      setOpening(null)
    }
  }

  const { data, loading, error, reload } = useAsync<FriendProgress[]>(
    () => (user ? fetchFriends(user.id) : Promise.resolve([])),
    [user?.id],
  )

  const friends = useMemo(() => data ?? [], [data])
  const active = friends.filter((friend) => friend.doneToday > 0)
  const idle = friends.filter((friend) => friend.doneToday === 0)

  const myDone = goals.filter((goal) => goal.completedToday).length
  const myStreak = goals.reduce((best, goal) => Math.max(best, goal.streak), 0)

  // Rank by goals completed today; ties keep the higher streak ahead.
  const myRank =
    friends.filter(
      (friend) =>
        friend.doneToday > myDone || (friend.doneToday === myDone && friend.streak > myStreak),
    ).length + 1

  return (
    <>
      <header className="flex items-center justify-between">
        <div>
          <div className="text-fg-subtle mb-1 flex items-center gap-1.5 text-[11px] font-extrabold tracking-[0.18em]">
            <SummitIcon size={12} strokeWidth={2} />
            {t('app.wordmark')}
          </div>
          <h1 className="text-[22px] font-bold">{t('nav.friends')}</h1>
          <p className="text-fg-muted mt-1 text-[13px]">
            {friends.length} {t('friends.count')}
          </p>
        </div>
        <button
          type="button"
          aria-label={t('friends.add')}
          className="border-line text-fg flex size-[38px] items-center justify-center rounded-full border"
        >
          <AddFriendIcon size={20} />
        </button>
      </header>

      {/* You, highlighted in the personal accent like the handoff. */}
      {/* Both the wash and its border mix toward the theme's tint base, so the
          row carries the same weight in light and dark. */}
      <div
        style={{
          ...categoryStyle('personal'),
          background: 'color-mix(in oklch, var(--cat) 10%, var(--pisga-tint-base))',
          borderColor: 'color-mix(in oklch, var(--cat) 30%, var(--pisga-tint-base))',
        }}
        className="mt-4.5 flex items-center gap-[13px] rounded-[16px] border px-[15px] py-3.5"
      >
        <Avatar name={profile?.display_name ?? ''} url={profile?.avatar_url} filled />
        <div className="flex-1">
          <div className="text-[15px] font-bold">
            {profile?.display_name ?? t('friends.you')}
            <span className="text-fg-muted text-xs font-medium"> · {t('friends.you')}</span>
          </div>
          <div className="text-fg-muted mt-0.5 text-xs">
            {myDone} {t('common.of')} {goals.length} {t('home.goalsToday')}
          </div>
        </div>
        <div className="text-center">
          <div className="text-base font-bold">{myStreak}</div>
          <div className="text-fg-muted mt-px text-[11px]">
            {t('friends.streak')} · {t('friends.rank')} {myRank}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner className="size-7" />
        </div>
      ) : error ? (
        <div className="mt-4.5">
          <ErrorState onRetry={reload} />
        </div>
      ) : friends.length === 0 ? (
        <div className="mt-4.5">
          <EmptyState>{t('friends.empty')}</EmptyState>
        </div>
      ) : (
        <>
          {active.length > 0 ? (
            <>
              <div className="mt-4.5 mb-2.5">
                <SectionLabel>{t('friends.activeToday')}</SectionLabel>
              </div>
              <div className="flex flex-col gap-2.5">
                {active.map((friend) => (
                  <FriendRow
                    key={friend.id}
                    friend={friend}
                    online={isOnline(friend.id)}
                    opening={opening === friend.id}
                    onOpenChat={() => void openChat(friend.id)}
                  />
                ))}
              </div>
            </>
          ) : null}

          {idle.length > 0 ? (
            <>
              <div className="mt-4.5 mb-2.5">
                <SectionLabel>{t('friends.notStarted')}</SectionLabel>
              </div>
              <div className="flex flex-col gap-2.5">
                {idle.map((friend) => (
                  <FriendRow
                    key={friend.id}
                    friend={friend}
                    idle
                    online={isOnline(friend.id)}
                    opening={opening === friend.id}
                    onOpenChat={() => void openChat(friend.id)}
                  />
                ))}
              </div>
            </>
          ) : null}
        </>
      )}

      {conversations.length > 0 ? (
        <>
          <div className="mt-6 mb-2.5">
            <SectionLabel>{t('friends.conversations')}</SectionLabel>
          </div>
          <div className="flex flex-col gap-2.5">
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => navigate(`/chat/${conversation.id}`)}
                className="border-line bg-surface flex items-center gap-[13px] rounded-[16px] border px-[15px] py-[13px] text-start"
              >
                <span className="relative flex-none">
                  <Avatar
                    name={conversation.title}
                    accent={CATEGORIES[hashToIndex(conversation.id, CATEGORIES.length)]}
                  />
                  {conversation.otherUserId && isOnline(conversation.otherUserId) ? (
                    <span
                      aria-label={t('chat.online')}
                      style={categoryStyle('physical')}
                      className="border-bg absolute bottom-0 start-0 size-2.5 rounded-full border-2 bg-[var(--cat)]"
                    />
                  ) : null}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[15px] font-semibold">{conversation.title}</span>
                    <span className="text-fg-subtle flex-none text-[11px]">
                      {conversation.lastAt ? shortTime(conversation.lastAt) : ''}
                    </span>
                  </span>
                  <span className="text-fg-muted mt-0.5 block truncate text-xs">
                    {conversation.lastSenderName ? `${conversation.lastSenderName}: ` : ''}
                    {conversation.lastMessage ?? t('chat.deleted')}
                  </span>
                </span>

                {conversation.unread > 0 ? (
                  <span
                    style={categoryStyle('physical')}
                    className="text-on-cat flex size-5 flex-none items-center justify-center rounded-full bg-[var(--cat)] text-[11px] font-bold"
                  >
                    {conversation.unread}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </>
  )
}

/** Same-day messages show a time, older ones a date — as in design 4c. */
function shortTime(iso: string) {
  const at = new Date(iso)
  const sameDay = at.toDateString() === new Date().toDateString()
  return new Intl.DateTimeFormat(undefined, sameDay ? { timeStyle: 'short' } : { dateStyle: 'short' })
    .format(at)
}

function FriendRow({
  friend,
  idle = false,
  online = false,
  opening = false,
  onOpenChat,
}: {
  friend: FriendProgress
  idle?: boolean
  online?: boolean
  opening?: boolean
  onOpenChat?: () => void
}) {
  const { t } = useI18n()
  // A stable accent per person so their avatar colour does not change between
  // renders or screens.
  const accent = CATEGORIES[hashToIndex(friend.id, CATEGORIES.length)]

  return (
    <Card className={`flex items-center gap-[13px] px-[15px] py-[13px] ${idle ? 'opacity-65' : ''}`}>
      <span className="relative flex-none">
        <Avatar name={friend.displayName} url={friend.avatarUrl} accent={idle ? null : accent} />
        {online ? (
          <span
            aria-label={t('chat.online')}
            style={categoryStyle('physical')}
            className="border-bg absolute bottom-0 start-0 size-2.5 rounded-full border-2 bg-[var(--cat)]"
          />
        ) : null}
      </span>

      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold">{friend.displayName}</div>
        <div className={`mt-0.5 text-xs ${idle ? 'text-fg-subtle' : 'text-fg-muted'}`}>
          {idle
            ? t('friends.notStartedYet')
            : `${friend.doneToday} ${t('friends.completedToday')}`}
        </div>
        {friend.categories.length > 0 ? (
          <div className="mt-[7px] flex gap-1.5">
            {friend.categories.map((category) => (
              <span
                key={category}
                style={categoryStyle(category)}
                className="size-2 rounded-full bg-[var(--cat)]"
              />
            ))}
          </div>
        ) : null}
      </div>

      <div className="text-center">
        <div className={`text-[15px] font-bold ${idle ? 'text-fg-muted' : ''}`}>
          {friend.streak}
        </div>
        <div className={`mt-px text-[10px] ${idle ? 'text-fg-subtle' : 'text-fg-muted'}`}>
          {t('friends.streak')}
        </div>
      </div>

      <button
        type="button"
        onClick={onOpenChat}
        disabled={opening}
        aria-label={t('friends.conversations')}
        className="border-line text-fg-muted flex size-8 flex-none items-center justify-center rounded-full border"
      >
        {opening ? (
          <Spinner className="size-3.5 border-current/30 border-t-current" />
        ) : (
          <ChatIcon size={16} />
        )}
      </button>
    </Card>
  )
}

function Avatar({
  name,
  url,
  accent,
  filled = false,
}: {
  name: string
  url?: string | null
  accent?: Category | null
  filled?: boolean
}) {
  if (url) {
    return <img src={url} alt="" className="size-11 flex-none rounded-full object-cover" />
  }

  const initial = name.trim().charAt(0) || '?'

  if (filled) {
    // Fixed grey, not category-tinted — the design's latest export gives
    // "you" a neutral placeholder regardless of theme, same as every other
    // person's initial-avatar elsewhere in the app.
    return (
      <div className="flex size-11 flex-none items-center justify-center rounded-full bg-[#6b6d74] text-[17px] font-bold text-white">
        {initial}
      </div>
    )
  }

  if (!accent) {
    return (
      <div className="bg-surface-raised text-fg-muted flex size-11 flex-none items-center justify-center rounded-full text-[17px] font-bold">
        {initial}
      </div>
    )
  }

  return (
    <div
      style={{
        ...categoryStyle(accent),
        background: 'color-mix(in oklch, var(--cat) 24%, var(--pisga-tint-base))',
      }}
      className="flex size-11 flex-none items-center justify-center rounded-full text-[17px] font-bold text-[var(--cat)]"
    >
      {initial}
    </div>
  )
}

/** Deterministic so a person keeps the same accent everywhere. */
function hashToIndex(value: string, buckets: number) {
  let hash = 0
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  return hash % buckets
}
