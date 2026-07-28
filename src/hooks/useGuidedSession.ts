import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SessionConfig } from '@/types/db'

export type Phase = 'work' | 'rest' | 'done'

export type SessionState = {
  phase: Phase
  /** Whole seconds left in the current phase. */
  remaining: number
  /** 1-based index of the set in progress. */
  set: number
  totalSets: number
  running: boolean
  /** 0-1 progress through the current phase, for the ring. */
  phaseProgress: number
}

const DEFAULTS = { sets: 1, work_seconds: 600, rest_seconds: 0 }

/**
 * Drives the work → rest → work loop of PRD 5's "ביצוע מודרך".
 *
 * Timing is anchored to a wall-clock deadline rather than accumulated ticks:
 * an interval in a backgrounded tab is throttled and drifts badly, and a
 * guided workout that silently loses a minute is worse than no timer at all.
 * The final set has no trailing rest.
 */
export function useGuidedSession(config: SessionConfig) {
  const plan = useMemo(
    () => ({
      sets: Math.max(1, config.sets ?? DEFAULTS.sets),
      work: Math.max(1, config.work_seconds ?? DEFAULTS.work_seconds),
      rest: Math.max(0, config.rest_seconds ?? DEFAULTS.rest_seconds),
    }),
    [config.sets, config.work_seconds, config.rest_seconds],
  )

  const [phase, setPhase] = useState<Phase>('work')
  const [set, setSet] = useState(1)
  const [running, setRunning] = useState(true)
  const [remaining, setRemaining] = useState(plan.work)

  // Deadline while running; remaining seconds while paused.
  const deadlineRef = useRef<number>(Date.now() + plan.work * 1000)

  const phaseLength = phase === 'rest' ? plan.rest : plan.work

  const startPhase = useCallback((next: Phase, seconds: number) => {
    setPhase(next)
    setRemaining(seconds)
    deadlineRef.current = Date.now() + seconds * 1000
  }, [])

  const advance = useCallback(() => {
    if (phase === 'work') {
      const isLastSet = set >= plan.sets
      if (isLastSet) return startPhase('done', 0)
      if (plan.rest === 0) {
        setSet((s) => s + 1)
        return startPhase('work', plan.work)
      }
      return startPhase('rest', plan.rest)
    }

    if (phase === 'rest') {
      setSet((s) => s + 1)
      return startPhase('work', plan.work)
    }
  }, [phase, set, plan, startPhase])

  useEffect(() => {
    if (!running || phase === 'done') return

    const tick = () => {
      const left = Math.max(0, Math.round((deadlineRef.current - Date.now()) / 1000))
      setRemaining(left)
      if (left === 0) advance()
    }

    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [running, phase, advance])

  const pause = useCallback(() => {
    setRemaining(Math.max(0, Math.round((deadlineRef.current - Date.now()) / 1000)))
    setRunning(false)
  }, [])

  const resume = useCallback(() => {
    deadlineRef.current = Date.now() + remaining * 1000
    setRunning(true)
  }, [remaining])

  const restart = useCallback(() => {
    setSet(1)
    setRunning(true)
    startPhase('work', plan.work)
  }, [plan.work, startPhase])

  /** Ends the current rest early and moves straight to the next set. */
  const skipRest = useCallback(() => {
    if (phase !== 'rest') return
    setSet((s) => s + 1)
    startPhase('work', plan.work)
  }, [phase, plan.work, startPhase])

  /**
   * Ends the current set before its timer runs out — a set of reps is finished
   * when the reps are done, not when the clock says so. Only meaningful for a
   * multi-set plan; a single continuous session (meditation, reading) has
   * nothing to end early, so the screen hides this control there.
   */
  const endSet = useCallback(() => {
    if (phase !== 'work') return
    advance()
  }, [phase, advance])

  const state: SessionState = {
    phase,
    remaining,
    set,
    totalSets: plan.sets,
    running,
    phaseProgress: phaseLength === 0 ? 1 : 1 - remaining / phaseLength,
  }

  return { ...state, reps: config.reps ?? null, pause, resume, restart, skipRest, endSet }
}

export function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
