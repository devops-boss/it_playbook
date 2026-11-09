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
  const [onlineUsers, setOnlineUsers] = React.useState<PresenceUser[]>(() => [
    {
      id: currentUser.email || 'self',
      displayName: currentUser.displayName,
      email: currentUser.email,
      role: currentUser.roleNames[0] || (currentUser.isSuperAdmin ? 'Admin' : 'IT Support'),
      onlineAt: new Date().toISOString(),
    },
  ]);

  React.useEffect(() => {
    let channel: ReturnType<ReturnType<typeof createClient>['channel']> | null = null;

    try {
      const supabase = createClient();
      const currentRole =
        currentUser.roleNames[0] || (currentUser.isSuperAdmin ? 'Admin' : 'IT Support');

      // Unique presence channel on the local Supabase Realtime instance
      channel = supabase.channel('online_presence', {
        config: {
          presence: {
            key: currentUser.email || currentUser.displayName,
          },
        },
      });

      const updatePresenceList = () => {
        if (!channel) return;
        const state = channel.presenceState();
        const userMap = new Map<string, PresenceUser>();

        // Always include the current user
        userMap.set(currentUser.email || 'self', {
          id: currentUser.email || 'self',
          displayName: currentUser.displayName,
          email: currentUser.email,
          role: currentRole,
          onlineAt: new Date().toISOString(),
        });

        // Collect peers from Realtime presence state
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

        setOnlineUsers(Array.from(userMap.values()));
      };

      channel
        .on('presence', { event: 'sync' }, updatePresenceList)
        .on('presence', { event: 'join' }, updatePresenceList)
        .on('presence', { event: 'leave' }, updatePresenceList)
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
      // Fallback remains with currentUser
    }

    return () => {
      if (channel) {
        channel.unsubscribe();
      }
    };
  }, [currentUser]);

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
      <PopoverContent align="end" className="w-72 p-0 shadow-lg">
        <div className="flex items-center justify-between border-b px-3 py-2.5 bg-muted/30">
          <div className="flex items-center gap-1.5">
            <IconUsers className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold text-foreground">Active Personnel</span>
          </div>
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-medium">
            {count} Active Now
          </Badge>
        </div>

        <div className="p-2 space-y-1 max-h-64 overflow-y-auto">
          {onlineUsers.map((u) => {
            const isMe = u.email === currentUser.email;
            return (
              <div
                key={u.id}
                className={cn(
                  'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-xs transition-colors',
                  isMe ? 'bg-primary/5' : 'hover:bg-muted/50'
                )}
              >
                <div className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-[11px]">
                  {u.displayName.slice(0, 2).toUpperCase()}
                  <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-background" />
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-medium text-foreground text-xs">
                      {u.displayName}
                    </span>
                    {isMe && (
                      <span className="text-[10px] text-muted-foreground font-normal">
                        (You)
                      </span>
                    )}
                  </div>
                  {u.email && (
                    <span className="truncate text-[11px] text-muted-foreground">
                      {u.email}
                    </span>
                  )}
                </div>
                <Badge
                  variant={u.role === 'Admin' ? 'default' : 'outline'}
                  className={cn(
                    'h-4 shrink-0 px-1 text-[9px]',
                    u.role === 'Admin' ? 'bg-[#233B74] text-white' : 'text-muted-foreground'
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
            Live on-premise connection
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

