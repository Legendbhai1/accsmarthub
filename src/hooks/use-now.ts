import { useEffect, useState } from "react"

/**
 * The current epoch milliseconds, refreshed on an interval.
 *
 * Reading Date.now() during render makes a component impure: the same props can
 * render differently on each pass, and time-based UI (a warranty countdown, for
 * example) would not re-render when the deadline actually passes. This hook
 * moves the clock into state so those views update on their own.
 */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  return now
}
