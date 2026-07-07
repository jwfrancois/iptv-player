'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Settings2 } from 'lucide-react'
import type { PortalConfig } from '@/lib/iptv/useIptvApi'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  config: PortalConfig
  onSave: (cfg: PortalConfig) => void
  onTest: (cfg: PortalConfig) => Promise<boolean>
}

export function SettingsDialog({
  open,
  onOpenChange,
  config,
  onSave,
  onTest,
}: SettingsDialogProps) {
  const [draft, setDraft] = useState<PortalConfig>(config)
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  // Sync draft when dialog opens
  useState(() => {
    setDraft(config)
  })

  const handleTest = async () => {
    setTesting(true)
    setResult(null)
    try {
      const ok = await onTest(draft)
      setResult({
        ok,
        msg: ok ? 'Connection successful!' : 'Authentication failed or portal unreachable.',
      })
    } catch (e: any) {
      setResult({ ok: false, msg: e?.message || 'Test failed' })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = () => {
    onSave(draft)
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) setDraft(config)
        onOpenChange(v)
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            Portal Settings
          </DialogTitle>
          <DialogDescription>
            Configure your Xtream Codes portal credentials.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="portal">Portal URL</Label>
            <Input
              id="portal"
              value={draft.portal}
              onChange={(e) => setDraft({ ...draft, portal: e.target.value })}
              placeholder="http://host:port"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={draft.username}
              onChange={(e) => setDraft({ ...draft, username: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={draft.password}
              onChange={(e) => setDraft({ ...draft, password: e.target.value })}
            />
          </div>

          {result && (
            <div
              className={`text-xs px-3 py-2 rounded ${
                result.ok
                  ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                  : 'bg-red-500/10 text-red-600 dark:text-red-400'
              }`}
            >
              {result.msg}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleTest} disabled={testing}>
            {testing && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Test Connection
          </Button>
          <Button onClick={handleSave}>Save & Connect</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
