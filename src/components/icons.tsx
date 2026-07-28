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
