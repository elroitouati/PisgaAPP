import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useI18n } from '@/i18n/useI18n'
import { useAuth } from '@/providers/useAuth'
import { useAsync } from '@/hooks/useAsync'
import { fetchFriends, type FriendProgress } from '@/lib/api'
import {
  addGroupMember,
  fetchConversationDetail,
  fetchMemberProfiles,
  leaveGroupConversation,
  promoteGroupMember,
  removeGroupMember,
  setGroupPostingMode,
  type MemberProfile,
} from '@/lib/chat'
import { BackIcon, PlusIcon, WarningIcon } from '@/components/icons'
import { Spinner } from '@/components/Spinner'
import { PrimaryButton } from '@/components/ui'

/** Designs 9a/9b (management) and 9c/9d (last-admin leave warning). */
export default function GroupManage() {
  const { conversationId } = useParams<{ conversationId: string }>()
  const { t } = useI18n()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [leaveWarning, setLeaveWarning] = useState(false)
  const [choosingPromotion, setChoosingPromotion] = useState(false)

  const { data: detail, reload } = useAsync(
    () => fetchConversationDetail(conversationId!),
    [conversationId],
  )

  const { data: profiles, reload: reloadProfiles } = useAsync<MemberProfile[]>(
    () => (detail ? fetchMemberProfiles(detail.members.map((m) => m.id)) : Promise.resolve([])),
    [detail?.members.map((m) => m.id).join(',')],
  )

  const { data: friendData } = useAsync<FriendProgress[]>(
    () => (user ? fetchFriends(user.id) : Promise.resolve([])),
    [user?.id],
  )

  const members = profiles ?? []
  const memberIds = useMemo(() => new Set(detail?.members.map((m) => m.id) ?? []), [detail])
  const isAdmin = detail?.members.find((m) => m.id === user?.id)?.isAdmin ?? false
  const addable = useMemo(
    () => (friendData ?? []).filter((friend) => !memberIds.has(friend.id)),
    [friendData, memberIds],
  )
  const promotable = members.filter((member) => member.id !== user?.id)

  function memberRole(memberId: string) {
    return detail?.members.find((m) => m.id === memberId)?.isAdmin ?? false
  }

  async function togglePostingMode() {
    if (!detail) return
    setBusy('toggle')
    setError(null)
    try {
      await setGroupPostingMode(conversationId!, !detail.membersCanPost)
      reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('error.load'))
    } finally {
      setBusy(null)
    }
  }

  async function add(friendId: string) {
    setBusy(friendId)
    setError(null)
    try {
      await addGroupMember(conversationId!, friendId)
      reload()
      reloadProfiles()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('error.load'))
    } finally {
      setBusy(null)
    }
  }

  async function remove(memberId: string) {
    setBusy(memberId)
    setError(null)
    try {
      await removeGroupMember(conversationId!, memberId)
      reload()
      reloadProfiles()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('error.load'))
    } finally {
      setBusy(null)
    }
  }

  async function leave() {
    setBusy('leave')
    setError(null)
    try {
      await leaveGroupConversation(conversationId!)
      navigate('/friends', { replace: true })
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : ''
      if (message.includes('promote another member')) {
        setLeaveWarning(true)
      } else {
        setError(message || t('group.leaveError'))
      }
    } finally {
      setBusy(null)
    }
  }

  async function promoteAndLeave(memberId: string) {
    setBusy(memberId)
    setError(null)
    try {
      await promoteGroupMember(conversationId!, memberId)
      await leaveGroupConversation(conversationId!)
      navigate('/friends', { replace: true })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('group.leaveError'))
      setLeaveWarning(false)
      setChoosingPromotion(false)
    } finally {
      setBusy(null)
    }
  }

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5.5 px-[22px] pt-14 pb-8"
      style={{ paddingTop: 'calc(3.5rem + env(safe-area-inset-top))' }}
    >
      <header className="flex flex-shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label={t('common.back')}
          className="text-fg-muted flex"
        >
          <BackIcon />
        </button>
        <h1 className="text-[19px] font-bold">{t('group.manage')}</h1>
      </header>

      <div className="flex flex-shrink-0 flex-col items-center gap-3">
        <div className="bg-fg-subtle flex size-[76px] items-center justify-center rounded-full text-[29px] font-bold text-white">
          {(detail?.title ?? '?').trim().charAt(0)}
        </div>
        <div className="text-[18px] font-bold">{detail?.title}</div>
        {detail ? (
          <span className="text-fg-muted text-[12.5px]">
            {detail.members.length} {t('group.memberCount')}
          </span>
        ) : null}
      </div>

      <div className="flex-shrink-0">
        <div className="text-fg-subtle mb-2.5 text-[11px] font-semibold tracking-[0.08em]">
          {t('group.members')}
        </div>
        <div className="flex flex-col gap-2">
          {members.map((member) => (
            <div
              key={member.id}
              className="border-line bg-surface flex items-center gap-3 rounded-[14px] border px-3.5 py-3"
            >
              <div className="bg-fg-subtle flex size-[38px] flex-none items-center justify-center rounded-full text-[15px] font-bold text-white">
                {(member.display_name ?? '?').trim().charAt(0)}
              </div>
              <div className="min-w-0 flex-1 text-[14.5px] font-semibold">
                {member.display_name}
                {member.id === user?.id ? (
                  <span className="text-fg-muted ms-1 text-xs font-medium"> · {t('group.you')}</span>
                ) : null}
              </div>
              {memberRole(member.id) ? (
                <span className="border-line text-fg-muted rounded-full border px-2.5 py-1 text-[11px] font-semibold">
                  {t('group.admin')}
                </span>
              ) : isAdmin ? (
                <button
                  type="button"
                  onClick={() => void remove(member.id)}
                  disabled={busy === member.id}
                  className="text-danger text-[13px] font-semibold"
                >
                  {busy === member.id ? <Spinner className="size-3.5" /> : t('group.removeMember')}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {isAdmin ? (
        <>
          {adding ? (
            <div className="flex-shrink-0">
              {addable.length === 0 ? (
                <p className="text-fg-subtle text-[13px]">{t('group.noFriendsToAdd')}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {addable.map((friend) => (
                    <button
                      key={friend.id}
                      type="button"
                      onClick={() => void add(friend.id)}
                      disabled={busy === friend.id}
                      className="border-line bg-surface flex items-center gap-3 rounded-[14px] border px-3.5 py-3 text-start"
                    >
                      <div className="bg-fg-subtle flex size-9 flex-none items-center justify-center rounded-full text-sm font-bold text-white">
                        {friend.displayName.trim().charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1 text-[14.5px] font-semibold">
                        {friend.displayName}
                      </div>
                      {busy === friend.id ? <Spinner className="size-4" /> : <PlusIcon size={17} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="border-line flex flex-shrink-0 items-center justify-center gap-2 rounded-[14px] border py-3.5 text-[14.5px] font-semibold"
            >
              <PlusIcon size={18} />
              {t('group.addMember')}
            </button>
          )}

          <div className="flex-shrink-0">
            <div className="text-fg-subtle mb-2.5 text-[11px] font-semibold tracking-[0.08em]">
              {t('group.settings')}
            </div>
            <button
              type="button"
              onClick={() => void togglePostingMode()}
              disabled={busy === 'toggle'}
              className="border-line bg-surface flex w-full items-center justify-between rounded-[16px] border px-4 py-[15px] text-start"
            >
              <span>
                <span className="block text-[14.5px] font-semibold">{t('group.postingMode')}</span>
                <span className="text-fg-muted mt-0.5 block text-xs">
                  {t('group.postingModeSub')}
                </span>
              </span>
              <span
                className={`relative h-[27px] w-[46px] flex-none rounded-full transition-colors ${
                  detail && !detail.membersCanPost ? 'bg-fg' : 'bg-line'
                }`}
              >
                <span
                  className={`absolute top-[3px] size-[21px] rounded-full transition-all ${
                    detail && !detail.membersCanPost ? 'bg-bg end-[3px]' : 'bg-fg-muted start-[3px]'
                  }`}
                />
              </span>
            </button>
          </div>
        </>
      ) : null}

      {error ? (
        <p role="alert" className="text-danger flex-shrink-0 text-center text-xs">
          {error}
        </p>
      ) : null}

      <div className="border-line mt-auto flex-shrink-0 border-t pt-4.5">
        <button
          type="button"
          onClick={() => void leave()}
          disabled={busy === 'leave'}
          className="text-danger border-danger/45 flex w-full items-center justify-center gap-2 rounded-[14px] border py-3.5 text-[14.5px] font-bold"
        >
          {busy === 'leave' ? <Spinner className="size-4" /> : null}
          {t('group.leave')}
        </button>
      </div>

      {leaveWarning ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center px-[22px]">
          <button
            type="button"
            aria-label={t('group.cancel')}
            onClick={() => {
              setLeaveWarning(false)
              setChoosingPromotion(false)
            }}
            className="bg-scrim absolute inset-0 backdrop-blur-[2px]"
          />
          <div className="border-line bg-surface relative w-full max-w-sm rounded-[20px] border px-[22px] pt-[26px] pb-[22px]">
            {choosingPromotion ? (
              <>
                <div className="mb-3.5 text-center text-[16px] font-bold">
                  {t('group.choosePromote')}
                </div>
                <div className="flex flex-col gap-2">
                  {promotable.map((member) => (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => void promoteAndLeave(member.id)}
                      disabled={busy === member.id}
                      className="border-line bg-bg flex items-center gap-3 rounded-[13px] border px-3.5 py-2.5 text-start"
                    >
                      <div className="bg-fg-subtle flex size-8 flex-none items-center justify-center rounded-full text-xs font-bold text-white">
                        {(member.display_name ?? '?').trim().charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1 text-[14px] font-semibold">
                        {member.display_name}
                      </div>
                      {busy === member.id ? <Spinner className="size-4" /> : null}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setChoosingPromotion(false)}
                  className="text-fg-muted mt-3 w-full py-2 text-center text-[14px] font-semibold"
                >
                  {t('group.cancel')}
                </button>
              </>
            ) : (
              <>
                <div className="flex flex-col items-center gap-3.5">
                  <div className="bg-danger/16 text-danger flex size-13 items-center justify-center rounded-full">
                    <WarningIcon size={26} />
                  </div>
                  <div className="text-center">
                    <div className="text-[17px] font-bold">{t('group.leaveWarningTitle')}</div>
                    <p className="text-fg-muted mt-2 text-[13.5px] leading-relaxed">
                      {t('group.leaveWarningBody')}
                    </p>
                  </div>
                </div>
                <div className="mt-5.5 flex flex-col gap-2">
                  <PrimaryButton className="h-[50px]" onClick={() => setChoosingPromotion(true)}>
                    {t('group.promoteOther')}
                  </PrimaryButton>
                  <button
                    type="button"
                    onClick={() => setLeaveWarning(false)}
                    className="border-line text-fg-muted h-[50px] rounded-[14px] border text-[14.5px] font-semibold"
                  >
                    {t('group.cancel')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </main>
  )
}
