import { useCallback, useEffect, useState } from 'react'

type State<T> = { data: T | null; loading: boolean; error: Error | null }

/**
 * Runs an async loader and re-runs it on demand. Deliberately small: the app
 * has a handful of queries, so a cache library would be more moving parts than
 * the problem needs.
 */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<State<T>>({ data: null, loading: true, error: null })
  const [nonce, setNonce] = useState(0)

  // The loader is rebuilt on every render by callers, so the caller-supplied
  // deps are the real trigger.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(loader, deps)

  useEffect(() => {
    let active = true
    setState((prev) => ({ ...prev, loading: true, error: null }))

    run().then(
      (data) => active && setState({ data, loading: false, error: null }),
      (error: Error) => active && setState({ data: null, loading: false, error }),
    )

    return () => {
      active = false
    }
  }, [run, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  /** Apply a local change without a round trip (used after a completion). */
  const patch = useCallback(
    (update: (current: T) => T) =>
      setState((prev) => (prev.data === null ? prev : { ...prev, data: update(prev.data) })),
    [],
  )

  return { ...state, reload, patch }
}
