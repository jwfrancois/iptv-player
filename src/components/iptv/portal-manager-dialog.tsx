'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Trash2, Pencil, Check, X, Loader2, Server, Wifi, WifiOff, Lock, Unlock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Portal, PortalConfig } from '@/lib/iptv/usePortals'
import { isParentalEnabled, setParentalPin, removeParentalPin, unlockAdult, lockAdult, isAdultUnlocked } from '@/lib/iptv/parental-control'

interface PortalManagerDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  portals: Portal[]
  activeId: string
  onSwitch: (id: string) => void
  onAdd: (data: Omit<Portal, 'id' | 'createdAt'>) => Portal
  onUpdate: (id: string, data: Partial<Omit<Portal, 'id' | 'createdAt'>>) => void
  onRemove: (id: string) => void
  onTest: (cfg: PortalConfig) => Promise<boolean>
}

interface EditingState {
  id: string | null // null = adding new
  name: string
  portal: string
  username: string
  password: string
}

export function PortalManagerDialog({
  open,
  onOpenChange,
  portals,
  activeId,
  onSwitch,
  onAdd,
  onUpdate,
  onRemove,
  onTest,
}: PortalManagerDialogProps) {
  const [editing, setEditing] = useState<EditingState | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [parentalPin, setParentalPinInput] = useState('')
  const [parentalError, setParentalError] = useState('')
  const [parentalEnabled, setParentalEnabledState] = useState(false)
  const [adultUnlocked, setAdultUnlockedState] = useState(false)

  useEffect(() => {
    setParentalEnabledState(isParentalEnabled())
    setAdultUnlockedState(isAdultUnlocked())
  }, [open])

  const startAdd = () => {
    setEditing({
      id: null,
      name: '',
      portal: 'http://',
      username: '',
      password: '',
    })
    setTestResult(null)
  }

  const startEdit = (p: Portal) => {
    setEditing({
      id: p.id,
      name: p.name,
      portal: p.portal,
      username: p.username,
      password: p.password,
    })
    setTestResult(null)
  }

  const cancelEdit = () => {
    setEditing(null)
    setTestResult(null)
  }

  const handleTest = async () => {
    if (!editing) return
    setTesting(true)
    setTestResult(null)
    try {
      const ok = await onTest({
        portal: editing.portal,
        username: editing.username,
        password: editing.password,
      })
      setTestResult({
        ok,
        msg: ok ? 'Connection successful!' : 'Authentication failed or portal unreachable.',
      })
    } catch (e: any) {
      setTestResult({ ok: false, msg: e?.message || 'Test failed' })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = () => {
    if (!editing) return
    if (!editing.name.trim() || !editing.portal.trim() || !editing.username.trim()) return
    if (editing.id) {
      onUpdate(editing.id, {
        name: editing.name,
        portal: editing.portal,
        username: editing.username,
        password: editing.password,
      })
    } else {
      const newPortal = onAdd({
        name: editing.name,
        portal: editing.portal,
        username: editing.username,
        password: editing.password,
      })
      // Auto-switch to the newly added portal
      onSwitch(newPortal.id)
    }
    setEditing(null)
    setTestResult(null)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) cancelEdit(); onOpenChange(v) }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="h-4 w-4" />
            Portal Manager
          </DialogTitle>
          <DialogDescription>
            Manage your IPTV portal connections. Switch between portals anytime from the top bar.
          </DialogDescription>
        </DialogHeader>

        {/* Portal list */}
        {!editing && (
          <div className="space-y-2">
            {portals.map((p) => {
              const isActive = p.id === activeId
              return (
                <div
                  key={p.id}
                  className={cn(
                    'rounded-lg border p-3 transition-colors',
                    isActive ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/50'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{p.name}</p>
                        {isActive && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary text-primary-foreground font-semibold">
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {p.portal}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        User: {p.username}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!isActive && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => onSwitch(p.id)}
                          title="Switch to this portal"
                        >
                          Switch
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => startEdit(p)}
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {portals.length > 1 && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-red-500 hover:text-red-600"
                          onClick={() => {
                            if (confirm(`Remove portal "${p.name}"?`)) onRemove(p.id)
                          }}
                          title="Remove"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}

            <Button
              variant="outline"
              className="w-full"
              onClick={startAdd}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Add Portal
            </Button>

            {/* Parental Controls */}
            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Parental Controls</span>
              </div>
              {!parentalEnabled ? (
                <div className="flex gap-2">
                  <Input
                    type="password"
                    maxLength={4}
                    placeholder="Set 4-digit PIN"
                    value={parentalPin}
                    onChange={(e) => setParentalPinInput(e.target.value.replace(/\D/g, ''))}
                    className="h-8"
                  />
                  <Button
                    size="sm"
                    className="h-8 shrink-0"
                    disabled={parentalPin.length !== 4}
                    onClick={() => {
                      setParentalPin(parentalPin)
                      setParentalEnabledState(true)
                      setParentalPinInput('')
                    }}
                  >
                    Enable
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs">
                  {adultUnlocked ? (
                    <>
                      <Unlock className="h-3.5 w-3.5 text-green-500" />
                      <span className="text-green-600 dark:text-green-400">Adult content unlocked (4h)</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs ml-auto"
                        onClick={() => {
                          lockAdult()
                          setAdultUnlockedState(false)
                        }}
                      >
                        Lock
                      </Button>
                    </>
                  ) : (
                    <>
                      <Lock className="h-3.5 w-3.5 text-amber-500" />
                      <span className="text-muted-foreground">Adult content locked</span>
                      <div className="flex gap-1 ml-auto">
                        <Input
                          type="password"
                          maxLength={4}
                          placeholder="PIN"
                          value={parentalPin}
                          onChange={(e) => setParentalPinInput(e.target.value.replace(/\D/g, ''))}
                          className="h-6 w-16 text-xs"
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs"
                          disabled={parentalPin.length !== 4}
                          onClick={() => {
                            if (unlockAdult(parentalPin)) {
                              setAdultUnlockedState(true)
                              setParentalPinInput('')
                              setParentalError('')
                            } else {
                              setParentalError('Wrong PIN')
                            }
                          }}
                        >
                          Unlock
                        </Button>
                      </div>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs text-red-500"
                    onClick={() => {
                      removeParentalPin()
                      setParentalEnabledState(false)
                      setAdultUnlockedState(false)
                    }}
                  >
                    Remove
                  </Button>
                </div>
              )}
              {parentalError && (
                <p className="text-[10px] text-red-500">{parentalError}</p>
              )}
            </div>
          </div>
        )}

        {/* Add/Edit form */}
        {editing && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="portal-name">Portal Name</Label>
              <Input
                id="portal-name"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="e.g. Eternal TV, My IPTV, etc."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="portal-url">Portal URL</Label>
              <Input
                id="portal-url"
                value={editing.portal}
                onChange={(e) => setEditing({ ...editing, portal: e.target.value })}
                placeholder="http://host:port"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="portal-username">Username</Label>
                <Input
                  id="portal-username"
                  value={editing.username}
                  onChange={(e) => setEditing({ ...editing, username: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="portal-password">Password</Label>
                <Input
                  id="portal-password"
                  type="password"
                  value={editing.password}
                  onChange={(e) => setEditing({ ...editing, password: e.target.value })}
                />
              </div>
            </div>

            {testResult && (
              <div
                className={cn(
                  'text-xs px-3 py-2 rounded flex items-center gap-2',
                  testResult.ok
                    ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                    : 'bg-red-500/10 text-red-600 dark:text-red-400'
                )}
              >
                {testResult.ok ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                {testResult.msg}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {editing ? (
            <>
              <Button variant="outline" onClick={handleTest} disabled={testing}>
                {testing && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Test
              </Button>
              <Button variant="ghost" onClick={cancelEdit}>
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={!editing.name.trim() || !editing.portal.trim() || !editing.username.trim()}>
                <Check className="h-4 w-4 mr-1" />
                Save
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
