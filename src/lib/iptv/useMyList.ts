'use client'

import { useCallback, useEffect, useState } from 'react'

const MYLIST_KEY = 'iptv-my-list'
const HISTORY_KEY = 'iptv-watch-history'
const MAX_HISTORY = 30

export interface MyListItem {
  id: string | number
  title: string
  poster?: string
  kind: 'live' | 'vod' | 'series'
  addedAt: number
}

export interface HistoryItem extends MyListItem {
  watchedAt: number
}

function load<T>(key: string): T[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function save<T>(key: string, items: T[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(key, JSON.stringify(items))
}

export function useMyList() {
  const [myList, setMyList] = useState<MyListItem[]>([])
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [myListIds, setMyListIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    const list = load<MyListItem>(MYLIST_KEY)
    const hist = load<HistoryItem>(HISTORY_KEY)
    setMyList(list)
    setHistory(hist)
    setMyListIds(new Set(list.map((i) => String(i.id))))
  }, [])

  const toggleMyList = useCallback((item: Omit<MyListItem, 'addedAt'>) => {
    setMyList((prev) => {
      const id = String(item.id)
      const exists = prev.some((i) => String(i.id) === id)
      let next: MyListItem[]
      if (exists) {
        next = prev.filter((i) => String(i.id) !== id)
      } else {
        next = [{ ...item, addedAt: Date.now() }, ...prev]
      }
      save(MYLIST_KEY, next)
      setMyListIds(new Set(next.map((i) => String(i.id))))
      return next
    })
  }, [])

  const removeFromMyList = useCallback((id: string | number) => {
    setMyList((prev) => {
      const next = prev.filter((i) => String(i.id) !== String(id))
      save(MYLIST_KEY, next)
      setMyListIds(new Set(next.map((i) => String(i.id))))
      return next
    })
  }, [])

  const addToHistory = useCallback((item: Omit<MyListItem, 'addedAt'>) => {
    setHistory((prev) => {
      const filtered = prev.filter((i) => String(i.id) !== String(item.id))
      const next = [{ ...item, addedAt: Date.now(), watchedAt: Date.now() }, ...filtered].slice(0, MAX_HISTORY)
      save(HISTORY_KEY, next)
      return next
    })
  }, [])

  const clearHistory = useCallback(() => {
    setHistory([])
    save(HISTORY_KEY, [])
  }, [])

  return {
    myList,
    myListIds,
    toggleMyList,
    removeFromMyList,
    history,
    addToHistory,
    clearHistory,
  }
}
