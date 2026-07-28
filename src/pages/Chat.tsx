import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useI18n } from '@/i18n/useI18n'
import { useAuth } from '@/providers/useAuth'
import { useMessages } from '@/hooks/useMessages'
import { usePresence } from '@/hooks/usePresence'
import { useConversations } from '@/hooks/useConversations'
import { useTrackedGoals } from '@/hooks/useGoals'
import { blockUser } from '@/lib/chat'
import { categoryStyle } from '@/lib/categories'
import { BackIcon, CloseIcon, PlusIcon, SendIcon, SummitIcon } from '@/components/icons'
import { Spinner } from '@/components/Spinner'
import type { ChatMessage } from '@/lib/chat'

/** Designs 7b (light) and 7a (dark) — one screen, both palettes. */
export default function Chat() {
  const { conversationId } = useParams<{ conversationId: string }>()
  const { t, lang } = useI18n()
  const { user } = useAuth()
  const navigate = useNavigate()

  const { conversations } = useConversations()
  const { messages, loading, send, edit, remove } = useMessages(conversationId)
  const { isOnline } = usePresence()
  const { goals } = useTrackedGoals()

  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<ChatMessage | null>(null)
  const [sharing, setSharing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const conversation = conversations.find((candidate) => candidate.id === conversationId)
  const bottom = useRef<HTMLDivElement>(null)

  // Stick to the newest message, the way a chat is expected to behave.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  const online = conversation?.otherUserId ? isOnline(conversation.otherUserId) : false
  const personalGoals = useMemo(() => goals.filter((goal) => goal.is_custom), [goals])

  async function submit(event: FormEvent) {
    event.preventDefault()
    const text = draft.trim()
    if (text === '' || !conversationId) return

    setBusy(true)
    setError(null)
    try {
      if (editing) {
        await edit(editing.id, text)
        setEditing(null)
      } else {
        await send(text)
      }
      setDraft('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('error.load'))
    } finally {
      setBusy(false)
    }
  }

  async function handleBlock() {
    if (!conversation?.otherUserId) return
    if (!window.confirm(t('chat.blockConfirm'))) return
    await blockUser(conversation.otherUserId)
    navigate('/friends', { replace: true })
  }

  return (
    <div
      style={categoryStyle('physical')}
      className="mx-auto flex h-dvh w-full max-w-md flex-col"
    >
      <header
        className="border-line flex flex-shrink-0 items-center gap-3 border-b px-[18px] pb-3.5"
        style={{ paddingTop: 'calc(3.25rem + env(safe-area-inset-top))' }}
      >
        <button
          type="button"
          onClick={() => navigate('/friends')}
          aria-label={t('common.back')}
          className="text-fg-muted flex"
        >
          <BackIcon />
        </button>

        <div className="relative flex-none">
          <div
            style={{ background: 'color-mix(in oklch, var(--cat) 30%, var(--pisga-card))' }}
            className="flex size-[38px] items-center justify-center rounded-full text-[15px] font-bold text-[var(--cat)]"
          >
            {conversation?.kind === 'direct' ? (
              (conversation.title.trim().charAt(0) || '?')
            ) : (
              <SummitIcon size={19} />
            )}
          </div>
          {online ? (
            <span
              aria-label={t('chat.online')}
              className="border-bg absolute bottom-0 start-0 size-2.5 rounded-full border-2 bg-[var(--cat)]"
            />
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate text-[15.5px] font-semibold">{conversation?.title ?? ''}</div>
          {conversation?.kind === 'direct' && online ? (
            <div className="mt-px text-xs text-[var(--cat)]">{t('chat.online')}</div>
          ) : null}
        </div>

        {conversation?.kind === 'direct' ? (
          <button
            type="button"
            onClick={() => void handleBlock()}
            className="text-fg-subtle text-[11px]"
          >
            {t('chat.block')}
          </button>
        ) : null}
      </header>

      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-[18px] py-4">
        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner className="size-7" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-fg-muted my-auto text-center text-sm">{t('chat.empty')}</p>
        ) : (
          messages.map((message, index) => (
            <Bubble
              key={message.id}
              message={message}
              mine={message.sender_id === user?.id}
              showDate={index === 0 || !sameDay(messages[index - 1], message)}
              lang={lang}
              goalTitle={
                message.shared_goal_id
                  ? (goals.find((goal) => goal.id === message.shared_goal_id)?.title ?? null)
                  : null
              }
              onEdit={() => {
                setEditing(message)
                setDraft(message.body ?? '')
              }}
              onDelete={() => void remove(message.id)}
            />
          ))
        )}
        <div ref={bottom} />
      </div>

      {sharing ? (
        <div className="border-line bg-surface flex-shrink-0 border-t px-[18px] py-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-fg-muted text-xs font-medium">{t('chat.shareGoal')}</span>
            <button type="button" onClick={() => setSharing(false)} className="text-fg-muted">
              <CloseIcon size={16} />
            </button>
          </div>
          {personalGoals.length === 0 ? (
            <p className="text-fg-subtle text-xs">{t('chat.noPersonalGoals')}</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {personalGoals.map((goal) => (
                <button
                  key={goal.id}
                  type="button"
                  onClick={() => {
                    setSharing(false)
                    void send(null, goal.id)
                  }}
                  style={categoryStyle(goal.category)}
                  className="border-line bg-bg rounded-xl border px-3 py-2 text-start text-[13px]"
                >
                  {goal.title}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {editing ? (
        <div className="border-line bg-surface-raised text-fg-muted flex flex-shrink-0 items-center justify-between border-t px-[18px] py-2 text-xs">
          {t('chat.editing')}
          <button
            type="button"
            onClick={() => {
              setEditing(null)
              setDraft('')
            }}
          >
            <CloseIcon size={15} />
          </button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-danger px-[18px] pb-1 text-center text-[11px]">
          {error}
        </p>
      ) : null}

      <form
        onSubmit={submit}
        className="border-line flex flex-shrink-0 items-center gap-2.5 border-t px-[18px] pt-3"
        style={{ paddingBottom: 'calc(1.375rem + env(safe-area-inset-bottom))' }}
      >
        <button
          type="button"
          onClick={() => setSharing((previous) => !previous)}
          aria-label={t('chat.shareGoal')}
          className="border-line text-fg-muted flex size-9 flex-none items-center justify-center rounded-full border"
        >
          <PlusIcon size={18} />
        </button>

        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t('chat.placeholder')}
          className="border-line bg-surface min-w-0 flex-1 rounded-[20px] border px-4 py-2.5 text-sm outline-none"
        />

        <button
          type="submit"
          disabled={busy || draft.trim() === ''}
          aria-label={t('chat.send')}
          className="text-on-cat flex size-9 flex-none items-center justify-center rounded-full bg-[var(--cat)] disabled:opacity-50"
        >
          {busy ? <Spinner className="size-4 border-current/30 border-t-current" /> : <SendIcon size={17} />}
        </button>
      </form>
    </div>
  )
}

function Bubble({
  message,
  mine,
  showDate,
  lang,
  goalTitle,
  onEdit,
  onDelete,
}: {
  message: ChatMessage
  mine: boolean
  showDate: boolean
  lang: 'he' | 'en'
  goalTitle: string | null
  onEdit: () => void
  onDelete: () => void
}) {
  const { t } = useI18n()
  const locale = lang === 'he' ? 'he-IL' : 'en-US'
  const at = new Date(message.created_at)

  return (
    <>
      {showDate ? (
        <div className="text-fg-subtle mb-1 self-center text-[11px]">
          {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(at)}
        </div>
      ) : null}

      <div
        className={`max-w-[78%] px-[13px] py-2.5 text-[14.5px] leading-relaxed ${
          mine
            ? 'text-on-cat self-end rounded-[16px_16px_4px_16px] bg-[var(--cat)] font-medium'
            : 'border-line bg-surface self-start rounded-[16px_16px_16px_4px] border'
        }`}
      >
        {message.deleted_at ? (
          <span className="opacity-60 italic">{t('chat.deleted')}</span>
        ) : goalTitle ? (
          <span className="flex items-center gap-2">
            <SummitIcon size={16} />
            {goalTitle}
          </span>
        ) : (
          message.body
        )}
      </div>

      <div
        className={`text-fg-subtle -mt-1 flex items-center gap-2 text-[11px] ${
          mine ? 'self-end' : 'self-start'
        }`}
      >
        <span>{new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(at)}</span>
        {message.edited_at ? <span>{t('chat.edited')}</span> : null}
        {mine && !message.deleted_at ? (
          <>
            <button type="button" onClick={onEdit} className="underline">
              {t('chat.edit')}
            </button>
            <button type="button" onClick={onDelete} className="underline">
              {t('chat.delete')}
            </button>
          </>
        ) : null}
      </div>
    </>
  )
}

function sameDay(a: ChatMessage, b: ChatMessage) {
  return a.created_at.slice(0, 10) === b.created_at.slice(0, 10)
}
