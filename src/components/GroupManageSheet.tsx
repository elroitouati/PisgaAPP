import { useMemo, useState } from 'react'
import { useI18n } from '@/i18n/useI18n'
import { useAuth } from '@/providers/useAuth'
import { useAsync } from '@/hooks/useAsync'
import { fetchFriends, type FriendProgress } from '@/lib/api'
import {
  addGroupMember,
  fetchConversationDetail,
  fetchMemberProfiles,
  removeGroupMember,
  setGroupPostingMode,
  type MemberProfile,
} from '@/lib/chat'
import { PlusIcon } from '@/components/icons'
import { Spinner } from '@/components/Spinner'

/**
 * Undesigned — no mockup covers group management, so this is a plain,
 * functional sheet rather than a rebuild of the app's visual language.
 */
export function GroupManageSheet({
  conversationId,
  onClose,
}: {
  conversationId: string
  onClose: () => void
}) {
  const { t } = useI18n()
  const { user } = useAuth()
  const [busy, setBusy] = useState<string | null>(null)

  const { data: detail, reload } = useAsync(
    () => fetchConversationDetail(conversationId),
    [conversationId],
  )

  const { data: profiles, reload: reloadProfiles } = useAsync<MemberProfile[]>(
    () => (detail ? fetchMemberProfiles(detail.memberIds) : Promise.resolve([])),
    [detail?.memberIds.join(',')],
  )

  const { data: friendData } = useAsync<FriendProgress[]>(
    () => (user ? fetchFriends(user.id) : Promise.resolve([])),
    [user?.id],
  )

  const members = profiles ?? []
  const isOwner = detail?.createdBy === user?.id
  const addable = useMemo(
    () => (friendData ?? []).filter((friend) => !detail?.memberIds.includes(friend.id)),
    [friendData, detail?.memberIds],
  )

  async function toggle() {
    if (!detail) return
    setBusy('toggle')
    try {
      await setGroupPostingMode(conversationId, !detail.membersCanPost)
      reload()
    } finally {
      setBusy(null)
    }
  }

  async function add(friendId: string) {
    setBusy(friendId)
    try {
      await addGroupMember(conversationId, friendId)
      reload()
      reloadProfiles()
    } finally {
      setBusy(null)
    }
  }

  async function remove(memberId: string) {
    setBusy(memberId)
    try {
      await removeGroupMember(conversationId, memberId)
      reload()
      reloadProfiles()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="fixed inset-0 z-30">
      <button
        type="button"
        aria-label={t('common.close')}
        onClick={onClose}
        className="bg-scrim absolute inset-0 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('group.manage')}
        className="border-line bg-bg absolute inset-x-0 bottom-0 mx-auto flex max-h-[80vh] max-w-md flex-col rounded-t-[26px] border-t px-[22px] pt-3.5"
        style={{ paddingBottom: 'calc(1.875rem + env(safe-area-inset-bottom))' }}
      >
        <div className="bg-line mx-auto mb-[18px] h-1 w-[38px] flex-none rounded-full" />
        <h2 className="mb-4 flex-none text-[17px] font-bold">{t('group.manage')}</h2>

        <div className="flex-1 overflow-y-auto">
          {isOwner ? (
            <button
              type="button"
              onClick={() => void toggle()}
              disabled={busy === 'toggle'}
              className="border-line bg-surface mb-4 flex items-center justify-between rounded-[14px] border px-4 py-3.5 text-start"
            >
              <span>
                <span className="block text-[14.5px] font-semibold">{t('group.postingMode')}</span>
                <span className="text-fg-muted mt-0.5 block text-xs">
                  {t('group.postingModeSub')}
                </span>
              </span>
              <span
                className={`relative h-[26px] w-[44px] flex-none rounded-full transition-colors ${
                  detail && !detail.membersCanPost ? 'bg-fg' : 'bg-line'
                }`}
              >
                <span
                  className={`absolute top-[3px] size-5 rounded-full transition-all ${
                    detail && !detail.membersCanPost ? 'bg-bg end-[3px]' : 'bg-fg-muted start-[3px]'
                  }`}
                />
              </span>
            </button>
          ) : null}

          <div className="text-fg-subtle mb-2 text-[11px] font-semibold tracking-[0.08em]">
            {t('group.members')}
          </div>
          <div className="mb-4 flex flex-col gap-2">
            {members.map((member) => (
              <div
                key={member.id}
                className="border-line bg-surface flex items-center gap-3 rounded-[13px] border px-3.5 py-2.5"
              >
                <div className="bg-surface-raised text-fg-muted flex size-8 flex-none items-center justify-center rounded-full text-xs font-bold">
                  {(member.display_name ?? '?').trim().charAt(0)}
                </div>
                <div className="min-w-0 flex-1 text-[14px] font-semibold">
                  {member.display_name}
                  {member.id === detail?.createdBy ? (
                    <span className="text-fg-subtle ms-1.5 text-[11px] font-normal">
                      · {t('group.owner')}
                    </span>
                  ) : null}
                </div>
                {isOwner && member.id !== user?.id ? (
                  <button
                    type="button"
                    onClick={() => void remove(member.id)}
                    disabled={busy === member.id}
                    className="text-fg-muted text-[12.5px] font-semibold"
                  >
                    {busy === member.id ? <Spinner className="size-3.5" /> : t('group.removeMember')}
                  </button>
                ) : null}
              </div>
            ))}
          </div>

          {isOwner ? (
            <>
              <div className="text-fg-subtle mb-2 text-[11px] font-semibold tracking-[0.08em]">
                {t('group.addMember')}
              </div>
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
                      className="border-line bg-surface flex items-center gap-3 rounded-[13px] border px-3.5 py-2.5 text-start"
                    >
                      <div className="bg-surface-raised text-fg-muted flex size-8 flex-none items-center justify-center rounded-full text-xs font-bold">
                        {friend.displayName.trim().charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1 text-[14px] font-semibold">
                        {friend.displayName}
                      </div>
                      {busy === friend.id ? <Spinner className="size-4" /> : <PlusIcon size={17} />}
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
