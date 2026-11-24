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

  const [onlineUsers, setOnlineUsers] = React.useState<PresenceUser[]>(() => [
    {
      id: currentUser.email || 'self',
      displayName: currentUser.displayName,
      email: currentUser.email,
      role: currentRole,
      onlineAt: new Date().toISOString(),
    },
  ]);

  // Periodic Heartbeat + Server Presence
  React.useEffect(() => {
    let isCancelled = false;

    const sendHeartbeat = async () => {
      try {
        const res = await fetch('/api/presence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            displayName: currentUser.displayName,
            email: currentUser.email,
            role: currentRole,
            photoUrl: currentUser.photoUrl,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (!isCancelled && Array.isArray(data.users)) {
            // Merge with local user ensuring current user is always pinned
            const userMap = new Map<string, PresenceUser>();

            userMap.set(currentUser.email || 'self', {
              id: currentUser.email || 'self',
              displayName: currentUser.displayName,
              email: currentUser.email,
              role: currentRole,
              onlineAt: new Date().toISOString(),
            });

            data.users.forEach((u: PresenceUser) => {
              const key = u.email || u.displayName || u.id;
              if (key) {
                userMap.set(key, {
                  id: u.id || key,
                  displayName: u.displayName || key,
                  email: u.email || null,
                  role: u.role || 'IT Support',
                  onlineAt: u.onlineAt || new Date().toISOString(),
                  photoUrl: u.photoUrl,
                });
              }
            });

            setOnlineUsers(Array.from(userMap.values()));
          }
        }
      } catch {
        // Fallback remains with local state
      }
    };

    // Initial heartbeat on mount
    sendHeartbeat();

    // Heartbeat every 20 seconds
    const interval = setInterval(sendHeartbeat, 20000);

    // Refresh on tab visibility return
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        sendHeartbeat();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Clean exit on unload
    const handleUnload = () => {
      fetch('/api/presence', { method: 'DELETE', keepalive: true }).catch(() => {});
    };
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      isCancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [currentUser, currentRole]);

  // Realtime WebSocket channel sync in parallel
  React.useEffect(() => {
    let channel: ReturnType<ReturnType<typeof createClient>['channel']> | null = null;

    try {
      const supabase = createClient();
      channel = supabase.channel('online_presence', {
        config: {
          presence: {
            key: currentUser.email || currentUser.displayName,
          },
        },
      });

      const updateRealtimePeers = () => {
        if (!channel) return;
        const state = channel.presenceState();
        setOnlineUsers((prev) => {
          const userMap = new Map<string, PresenceUser>();
          prev.forEach((u) => userMap.set(u.email || u.displayName, u));

          Object.values(state).forEach((presences) => {
            (presences as any[]).forEach((p) => {
              if (p && (p.email || p.displayName)) {
                const key = p.email || p.displayName;
                userMap.set(key, {
                  id: key,
                  displayName: p.displayName || key,
                  email: p.email || null,
                  role: p.role || 'IT Support',
                  onlineAt: p.onlineAt || new Date().toISOString(),
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
              displayName: currentUser.displayName,
              email: currentUser.email,
              role: currentRole,
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
  }, [currentUser, currentRole]);

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
            const isMe = u.email === currentUser.email;
            return (
              <div
                key={u.id}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs transition-colors',
                  isMe ? 'bg-primary/5 border border-primary/15' : 'hover:bg-muted/50 border border-transparent'
                )}
              >
                <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#233B74]/15 text-[#233B74] dark:bg-primary/20 dark:text-primary font-bold text-xs">
                  {u.displayName.slice(0, 2).toUpperCase()}
                  <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-background" />
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
