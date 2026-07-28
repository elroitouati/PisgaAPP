import type { ComponentType } from 'react'
import {
  AcademicIcon,
  PersonalIcon,
  PhysicalIcon,
  SocialIcon,
  type IconProps,
} from '@/components/icons'
import type { TranslationKey } from '@/i18n/translations'

/** PRD 3 — the four fixed categories, in the order the design lists them. */
export const CATEGORIES = ['physical', 'academic', 'social', 'personal'] as const
export type Category = (typeof CATEGORIES)[number]

type CategoryMeta = {
  /** CSS variable holding this category's accent, per the design handoff. */
  color: string
  icon: ComponentType<IconProps>
  labelKey: TranslationKey
  blurbKey: TranslationKey
}

export const CATEGORY_META: Record<Category, CategoryMeta> = {
  physical: {
    color: 'var(--pisga-phys)',
    icon: PhysicalIcon,
    labelKey: 'category.physical',
    blurbKey: 'category.physical.blurb',
  },
  academic: {
    color: 'var(--pisga-study)',
    icon: AcademicIcon,
    labelKey: 'category.academic',
    blurbKey: 'category.academic.blurb',
  },
  social: {
    color: 'var(--pisga-social)',
    icon: SocialIcon,
    labelKey: 'category.social',
    blurbKey: 'category.social.blurb',
  },
  personal: {
    color: 'var(--pisga-pers)',
    icon: PersonalIcon,
    labelKey: 'category.personal',
    blurbKey: 'category.personal.blurb',
  },
}

/**
 * Category colour is passed down as a `--cat` custom property so a subtree can
 * use `text-[var(--cat)]` and the `.cat-tint` wash without prop-drilling.
 */
export function categoryStyle(category: Category) {
  return { '--cat': CATEGORY_META[category].color } as React.CSSProperties
}
