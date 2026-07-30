import type { SVGProps } from 'react'

/**
 * Icon set traced from the design handoff (design/screens/*.html) — same 24×24
 * grid, same stroke weights. Everything inherits `currentColor`.
 */

export type IconProps = Omit<SVGProps<SVGSVGElement>, "strokeWidth"> & {
  size?: number
  strokeWidth?: number
}

function Icon({ size = 22, strokeWidth = 1.7, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

/** The summit glyph that sits beside the PISGA wordmark in every header. */
export const SummitIcon = (p: IconProps) => (
  <Icon strokeWidth={1.8} {...p}>
    <path d="M3 20h18L13.5 6 10 12.5 8 10z" />
  </Icon>
)

// ── Categories ───────────────────────────────────────────────────────────────
export const PhysicalIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 12h4l2-5 3 10 2-5h5" />
  </Icon>
)

export const AcademicIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="5" y="4" width="14" height="16" rx="1.5" />
    <path d="M9 4v16" />
  </Icon>
)

export const SocialIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="9" cy="9" r="3" />
    <circle cx="16" cy="10" r="2.6" />
    <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
    <path d="M15 19a4.5 4.5 0 0 1 5.5-4.4" />
  </Icon>
)

export const PersonalIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
)

// ── Navigation ───────────────────────────────────────────────────────────────
export const HomeIcon = (p: IconProps) => (
  <Icon strokeWidth={1.6} {...p}>
    <path d="M4 10.5 12 4l8 6.5" />
    <path d="M6 9.5V20h12V9.5" />
  </Icon>
)

export const TrophyIcon = (p: IconProps) => (
  <Icon strokeWidth={1.6} {...p}>
    <circle cx="12" cy="9" r="5" />
    <path d="M8.5 13 8 21l4-2 4 2-.5-8" />
  </Icon>
)

export const FriendsIcon = SocialIcon

export const ProfileIcon = (p: IconProps) => (
  <Icon strokeWidth={1.6} {...p}>
    <circle cx="12" cy="8" r="3.6" />
    <path d="M5 20a7 7 0 0 1 14 0" />
  </Icon>
)

export const PlusIcon = (p: IconProps) => (
  <Icon strokeWidth={1.7} {...p}>
    <path d="M12 6v12M6 12h12" />
  </Icon>
)

// ── Controls ─────────────────────────────────────────────────────────────────

/**
 * Points along the reading direction: right in RTL, left in LTR. The design
 * draws it pointing right (Hebrew), so the LTR flip lives in CSS.
 */
export const BackIcon = (p: IconProps) => (
  <Icon {...p} className={`ltr:-scale-x-100 ${p.className ?? ''}`}>
    <path d="M14 6l6 6-6 6" />
  </Icon>
)

export const CheckIcon = (p: IconProps) => (
  <Icon strokeWidth={3} {...p}>
    <path d="M5 12l4 4 10-10" />
  </Icon>
)

export const MinusIcon = (p: IconProps) => (
  <Icon strokeWidth={2.4} {...p}>
    <path d="M6 12h12" />
  </Icon>
)

export const CloseIcon = (p: IconProps) => (
  <Icon strokeWidth={1.8} {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
)

export const BellIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.5 21a1.8 1.8 0 0 1-3 0" />
  </Icon>
)

export const ClockIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v4l3 2" />
  </Icon>
)

export const MailIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M4 7l8 5 8-5" />
  </Icon>
)

export const RestartIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 4v4h4" />
  </Icon>
)

export const PauseIcon = (p: IconProps) => (
  <Icon strokeWidth={1.8} {...p}>
    <path d="M6 5v14M10 5v14" />
  </Icon>
)

export const PlayIcon = (p: IconProps) => (
  <Icon strokeWidth={1.8} {...p}>
    <path d="M7 4.5v15l13-7.5z" />
  </Icon>
)


export const LockIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Icon>
)

export const FlameIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3l7 9-7 9-7-9z" />
  </Icon>
)

export const TargetIcon = PersonalIcon
export const ActivityIcon = PhysicalIcon

export const AddFriendIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10" cy="8" r="3.4" />
    <path d="M4 19a6 6 0 0 1 12 0" />
    <path d="M18 8v6M15 11h6" />
  </Icon>
)

export const CalendarIcon = (p: IconProps) => (
  <Icon strokeWidth={1.6} {...p}>
    <rect x="4" y="5" width="16" height="15" rx="2" />
    <path d="M4 10h16M9 3v4M15 3v4" />
  </Icon>
)

/** Rising bars — the weekly growth summary, not a generic "stats" chart. */
export const GrowthIcon = (p: IconProps) => (
  <Icon strokeWidth={1.7} {...p}>
    <path d="M5 20V14M12 20V9M19 20V5" strokeLinecap="round" />
  </Icon>
)

/** Solid paper plane; points along the reading direction like BackIcon. */
export const SendIcon = ({ size = 22, className = '', ...rest }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    className={`ltr:-scale-x-100 ${className}`}
    {...rest}
  >
    <path d="M20.5 12 3.5 4.5l3 7.5-3 7.5z" />
  </svg>
)

export const ChatIcon = (p: IconProps) => (
  <Icon strokeWidth={1.6} {...p}>
    <path d="M4 12a8 8 0 1 1 3.5 6.6L4 20l1.4-3.4A8 8 0 0 1 4 12z" />
  </Icon>
)

export const SunIcon = (p: IconProps) => (
  <Icon strokeWidth={1.7} {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
  </Icon>
)

export const MoonIcon = (p: IconProps) => (
  <Icon strokeWidth={1.7} {...p}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
  </Icon>
)

export const CameraIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 8a2 2 0 0 1 2-2h1l1.5-2h7L17 6h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
    <circle cx="12" cy="13" r="3.6" />
  </Icon>
)

export const UploadIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="8.5" cy="10" r="1.8" />
    <path d="M21 16l-5.5-5.5L5 20" />
  </Icon>
)

export const TrashIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V7" />
  </Icon>
)

export const DownloadIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3v13m0 0l-4-4m4 4l4-4" />
    <path d="M5 19h14" />
  </Icon>
)

export const WarningIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 9v4M12 17h.01" />
    <path d="M10.3 3.9L2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
  </Icon>
)

export const ArchiveIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="5" y="7" width="14" height="13" rx="2" />
    <path d="M9 3.5h6M8 11h8M8 15h5" />
  </Icon>
)

export const UnarchiveIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="5" y="7" width="14" height="13" rx="2" />
    <path d="M9 3.5h6M12 17v-6m0 0l-2.5 2.5M12 11l2.5 2.5" />
  </Icon>
)

export const ShareMoreIcon = (p: IconProps) => (
  <Icon strokeWidth={1.7} {...p}>
    <circle cx="18" cy="5" r="2.6" />
    <circle cx="6" cy="12" r="2.6" />
    <circle cx="18" cy="19" r="2.6" />
    <path d="M8.3 10.7l7.4-4.2M8.3 13.3l7.4 4.2" />
  </Icon>
)

export const WhatsAppIcon = ({ size = 22, className = '', ...rest }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    className={className}
    {...rest}
  >
    <path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3.1.8.8-3-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1s-.7.8-.9 1c-.2.2-.3.2-.6.1s-1.1-.4-2.1-1.3c-.8-.7-1.3-1.6-1.5-1.8-.2-.2 0-.4.1-.5l.4-.5c.1-.1.2-.3.3-.4.1-.2 0-.4 0-.5s-.6-1.4-.8-2c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.2-.9.9-.9 2.2s1 2.5 1.1 2.7c.1.2 2 3 4.7 4.2.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.5-.6 1.8-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z" />
  </svg>
)

export const CopyIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
  </Icon>
)

export const GearIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.6 1z" />
  </Icon>
)
