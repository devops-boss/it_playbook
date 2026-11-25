'use client';

import * as React from 'react';
import { createClient } from '@/lib/supabase/client';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IconCircleCheck, IconUsers } from '@tabler/icons-react';
import { cn } from '@/lib/utils';

export interface PresenceUser {
  id: string;
  displayName: string;
  email: string | null;
  role: string;
  onlineAt: string;
  photoUrl?: string | null;
}

interface OnlinePresenceProps {
  currentUser: {
    id?: string;
    displayName: string;
    email: string | null;
    photoUrl: string | null;
    isSuperAdmin: boolean;
    roleNames: string[];
  };
}

export function OnlinePresence({ currentUser }: OnlinePresenceProps) {
  const currentRole =
    currentUser.roleNames[0] || (currentUser.isSuperAdmin ? 'Super Admin' : 'IT Support');

  const myKey = (currentUser.email || currentUser.displayName || 'self').toLowerCase();

  const [onlineUsers, setOnlineUsers] = React.useState<PresenceUser[]>(() => [
    {
      id: currentUser.id || currentUser.email || 'self',
      displayName: currentUser.displayName,
      email: currentUser.email,
      role: currentRole,
      onlineAt: new Date().toISOString(),
      photoUrl: currentUser.photoUrl,
    },
  ]);

  // Periodic Heartbeat + Server Presence
  React.useEffect(() => {
    let isCancelled = false;

    const mergeUsers = (incomingUsers: PresenceUser[]) => {
      if (isCancelled || !Array.isArray(incomingUsers)) return;

      const userMap = new Map<string, PresenceUser>();

      // 1. Current user always pinned
      userMap.set(myKey, {
        id: currentUser.id || currentUser.email || 'self',
        displayName: currentUser.displayName,
        email: currentUser.email,
        role: currentRole,
        onlineAt: new Date().toISOString(),
        photoUrl: currentUser.photoUrl,
      });

      // 2. Add all incoming users
      incomingUsers.forEach((u) => {
        const key = (u.email || u.displayName || u.id || '').toLowerCase();
        if (key) {
          const isMe = key === myKey || (currentUser.email && u.email && key === currentUser.email.toLowerCase());
          userMap.set(key, {
            id: u.id || key,
            displayName: isMe ? currentUser.displayName : (u.displayName || key),
            email: u.email || null,
            role: u.role || 'IT Support',
            onlineAt: u.onlineAt || new Date().toISOString(),
            photoUrl: u.photoUrl,
          });
        }
      });

      setOnlineUsers(Array.from(userMap.values()));
    };

    const sendHeartbeat = async () => {
      try {
        const res = await fetch('/api/presence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: currentUser.id,
            displayName: currentUser.displayName,
            email: currentUser.email,
            role: currentRole,
            photoUrl: currentUser.photoUrl,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.users)) {
            mergeUsers(data.users);
          }
        }
      } catch (err) {
        // Fallback to GET endpoint
        try {
          const getRes = await fetch('/api/presence');
          if (getRes.ok) {
            const data = await getRes.json();
            if (data && Array.isArray(data.users)) {
              mergeUsers(data.users);
            }
          }
        } catch {}
      }
    };

    // Initial heartbeats immediately on mount
    sendHeartbeat();

    // Heartbeat every 15 seconds
    const interval = setInterval(sendHeartbeat, 15000);

    // Refresh on tab visibility return or focus
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        sendHeartbeat();
      }
    };
    const handleFocus = () => {
      sendHeartbeat();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);

    // Clean exit on unload
    const handleUnload = () => {
      fetch('/api/presence', {
        method: 'DELETE',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id }),
      }).catch(() => {});
    };
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      isCancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [currentUser, currentRole, myKey]);

  // Realtime WebSocket channel sync in parallel
  React.useEffect(() => {
    let channel: ReturnType<ReturnType<typeof createClient>['channel']> | null = null;

    try {
      const supabase = createClient();
      channel = supabase.channel('online_presence', {
        config: {
          presence: {
            key: myKey,
          },
        },
      });

      const updateRealtimePeers = () => {
        if (!channel) return;
        const state = channel.presenceState();
        setOnlineUsers((prev) => {
          const userMap = new Map<string, PresenceUser>();
          prev.forEach((u) => {
            const key = (u.email || u.displayName || u.id || '').toLowerCase();
            if (key) userMap.set(key, u);
          });

          // Pinned self
          userMap.set(myKey, {
            id: currentUser.id || currentUser.email || 'self',
            displayName: currentUser.displayName,
            email: currentUser.email,
            role: currentRole,
            onlineAt: new Date().toISOString(),
            photoUrl: currentUser.photoUrl,
          });

          Object.values(state).forEach((presences) => {
            (presences as any[]).forEach((p) => {
              if (p && (p.email || p.displayName)) {
                const key = (p.email || p.displayName).toLowerCase();
                const isMe = key === myKey;
                userMap.set(key, {
                  id: p.id || key,
                  displayName: isMe ? currentUser.displayName : (p.displayName || key),
                  email: p.email || null,
                  role: p.role || 'IT Support',
                  onlineAt: p.onlineAt || new Date().toISOString(),
                  photoUrl: p.photoUrl,
                });
              }
            });
          });

          return Array.from(userMap.values());
        });
      };

      channel
        .on('presence', { event: 'sync' }, updateRealtimePeers)
        .on('presence', { event: 'join' }, updateRealtimePeers)
        .on('presence', { event: 'leave' }, updateRealtimePeers)
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED' && channel) {
            await channel.track({
              id: currentUser.id,
              displayName: currentUser.displayName,
              email: currentUser.email,
              role: currentRole,
              photoUrl: currentUser.photoUrl,
              onlineAt: new Date().toISOString(),
            });
          }
        });
    } catch {
      // Realtime optional fallback handled by HTTP heartbeat
    }

    return () => {
      if (channel) {
        channel.unsubscribe();
      }
    };
  }, [currentUser, currentRole, myKey]);

  const count = onlineUsers.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-2 px-2 text-xs font-normal text-muted-foreground hover:text-foreground"
          aria-label={`${count} user${count === 1 ? '' : 's'} online`}
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span className="font-medium text-foreground">
            {count} <span className="hidden sm:inline">online</span>
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 shadow-lg">
        <div className="flex items-center justify-between border-b px-3.5 py-2.5 bg-muted/30">
          <div className="flex items-center gap-1.5">
            <IconUsers className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold text-foreground">Online Users</span>
          </div>
          <Badge
            variant="secondary"
            className="h-5 px-1.5 text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-medium"
          >
            {count} Active Now
          </Badge>
        </div>

        <div className="p-2 space-y-1.5 max-h-72 overflow-y-auto">
          {onlineUsers.map((u) => {
            const isMe =
              u.email?.toLowerCase() === currentUser.email?.toLowerCase() ||
              u.id === currentUser.id ||
              u.displayName === currentUser.displayName;

            return (
              <div
                key={u.id}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs transition-colors',
                  isMe ? 'bg-primary/5 border border-primary/15' : 'hover:bg-muted/50 border border-transparent'
                )}
              >
                <div
                  className="relative flex h-8 w-8 shrink-0 items-center justify-center"
                  style={{ width: '32px', height: '32px' }}
                >
                  <div className="h-full w-full rounded-full overflow-hidden flex items-center justify-center bg-[#233B74]/15 text-[#233B74] dark:bg-primary/20 dark:text-primary font-bold text-xs ring-1 ring-border/50">
                    {u.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={u.photoUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        style={{ width: '32px', height: '32px' }}
                      />
                    ) : (
                      (u.displayName || 'U').slice(0, 2).toUpperCase()
                    )}
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-card z-20" />
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-semibold text-foreground text-xs">
                      {u.displayName}
                    </span>
                    {isMe && (
                      <span className="text-[10px] text-muted-foreground font-normal">
                        (You)
                      </span>
                    )}
                  </div>
                  {u.email && (
                    <span className="truncate text-2xs text-muted-foreground">
                      {u.email}
                    </span>
                  )}
                </div>
                <Badge
                  variant={u.role === 'Super Admin' || u.role === 'Admin' ? 'default' : 'outline'}
                  className={cn(
                    'h-4 shrink-0 px-1.5 text-[9px] font-medium',
                    u.role === 'Super Admin' || u.role === 'Admin'
                      ? 'bg-[#233B74] text-white hover:bg-[#233B74]'
                      : 'text-muted-foreground'
                  )}
                >
                  {u.role}
                </Badge>
              </div>
            );
          })}
        </div>

        <div className="border-t px-3 py-1.5 bg-muted/20 text-center">
          <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
            <IconCircleCheck className="h-3 w-3 text-emerald-500" />
            Live real-time sync across system
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
