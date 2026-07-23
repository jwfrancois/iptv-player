'use client'

import { useState, useEffect } from 'react'
import { Download, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'iptv-install-dismissed'

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [show, setShow] = useState(false)

  useEffect(() => {
    // Check if already dismissed or already installed
    if (localStorage.getItem(DISMISS_KEY)) return
    if (window.matchMedia('(display-mode: standalone)').matches) return // already installed

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setShow(false)
    setDeferredPrompt(null)
  }

  const handleDismiss = () => {
    setShow(false)
    localStorage.setItem(DISMISS_KEY, '1')
  }

  if (!show) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-4 md:right-auto md:w-80 z-50 bg-card border rounded-lg shadow-xl p-4 animate-slide-up">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-md bg-gradient-to-br from-rose-500 to-orange-500 flex items-center justify-center shrink-0">
          <Download className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Install IPTV Player</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Add to your home screen for a native app experience
          </p>
          <div className="flex gap-2 mt-2">
            <Button size="sm" onClick={handleInstall} className="h-7 text-xs">
              Install
            </Button>
            <Button size="sm" variant="ghost" onClick={handleDismiss} className="h-7 text-xs">
              Not now
            </Button>
          </div>
        </div>
        <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground shrink-0">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
