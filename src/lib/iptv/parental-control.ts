'use client'

import { useState, useEffect } from 'react'

const PIN_KEY = 'iptv-parental-pin'
const UNLOCK_KEY = 'iptv-parental-unlocked'
const UNLOCK_DURATION = 4 * 60 * 60 * 1000 // 4 hours

/** Check if a category name looks like an adult category. */
export function isAdultCategory(name: string): boolean {
  const lower = name.toLowerCase()
  return lower.includes('adult') || lower.includes('xxx') || lower.includes('18+')
}

/** Check if parental controls are enabled (PIN is set). */
export function isParentalEnabled(): boolean {
  if (typeof window === 'undefined') return false
  return !!localStorage.getItem(PIN_KEY)
}

/** Check if adult content is currently unlocked. */
export function isAdultUnlocked(): boolean {
  if (typeof window === 'undefined') return false
  const unlocked = localStorage.getItem(UNLOCK_KEY)
  if (!unlocked) return false
  const unlockedTime = Number(unlocked)
  return Date.now() - unlockedTime < UNLOCK_DURATION
}

/** Set the parental control PIN. */
export function setParentalPin(pin: string) {
  if (typeof window === 'undefined') return
  localStorage.setItem(PIN_KEY, pin)
}

/** Remove the parental control PIN. */
export function removeParentalPin() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(PIN_KEY)
  localStorage.removeItem(UNLOCK_KEY)
}

/** Unlock adult content for 4 hours. */
export function unlockAdult(pin: string): boolean {
  if (typeof window === 'undefined') return true
  const stored = localStorage.getItem(PIN_KEY)
  if (!stored) return true // no PIN set = no restriction
  if (pin === stored) {
    localStorage.setItem(UNLOCK_KEY, String(Date.now()))
    return true
  }
  return false
}

/** Lock adult content immediately. */
export function lockAdult() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(UNLOCK_KEY)
}

/** Hook that tracks parental control state. */
export function useParentalControl() {
  const [enabled, setEnabled] = useState(false)
  const [unlocked, setUnlocked] = useState(false)

  useEffect(() => {
    setEnabled(isParentalEnabled())
    setUnlocked(isAdultUnlocked())
  }, [])

  const refresh = () => {
    setEnabled(isParentalEnabled())
    setUnlocked(isAdultUnlocked())
  }

  return { enabled, unlocked, refresh }
}
