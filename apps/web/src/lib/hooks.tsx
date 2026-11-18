import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { api } from './api';
import type { Catalog, MeResponse, NotificationDto, MessageDto } from './types';

// ------------------------------------------------------------------ session
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<MeResponse>('/auth/me'),
    staleTime: 60_000,
  });
}

export function useUser() {
  const { data } = useMe();
  return data?.user ?? null;
}

// ------------------------------------------------------------------ catalogue
export function useCatalog() {
  const q = useQuery({
    queryKey: ['catalog'],
    queryFn: () => api.get<Catalog>('/catalog'),
    staleTime: 5 * 60_000,
  });
  const helpers = useMemo(() => {
    const c = q.data;
    const skill = new Map(c?.skills.map((s) => [s.slug, s]) ?? []);
    const role = new Map(c?.roles.map((s) => [s.slug, s.name]) ?? []);
    const interest = new Map(c?.interests.map((s) => [s.slug, s.name]) ?? []);
    const category = new Map(c?.categories.map((s) => [s.slug, s.name]) ?? []);
    return {
      skillName: (slug: string) => skill.get(slug)?.name ?? prettify(slug),
      skillCategory: (slug: string) => skill.get(slug)?.category ?? 'other',
      roleName: (slug: string) => role.get(slug) ?? prettify(slug),
      interestName: (slug: string) => interest.get(slug) ?? prettify(slug),
      categoryName: (slug: string) => category.get(slug) ?? prettify(slug),
      anyName: (slug: string) => skill.get(slug)?.name ?? role.get(slug) ?? interest.get(slug) ?? prettify(slug),
    };
  }, [q.data]);
  return { ...q, catalog: q.data, ...helpers };
}

function prettify(slug: string) {
  if (slug === 'leader') return 'Team Leader';
  return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ------------------------------------------------------------------ realtime
const SocketContext = createContext<Socket | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const user = useUser();
  const qc = useQueryClient();
  const [socket, setSocket] = useState<Socket | null>(null);
  const qcRef = useRef(qc);
  qcRef.current = qc;

  useEffect(() => {
    if (!user) return;
    const s = io({ path: '/socket.io', withCredentials: true, transports: ['websocket', 'polling'] });
    s.on('notification:new', (n: NotificationDto) => {
      qcRef.current.invalidateQueries({ queryKey: ['notifications'] });
      if (n.type !== 'new_message' || !location.pathname.startsWith('/messages')) {
        toast(n.title, { description: n.body || undefined, action: n.link ? { label: 'Open', onClick: () => (location.href = n.link) } : undefined });
      }
      if (['application_accepted', 'post_approved', 'post_rejected', 'member_removed', 'team_invite'].includes(n.type)) {
        qcRef.current.invalidateQueries({ queryKey: ['opportunities'] });
        qcRef.current.invalidateQueries({ queryKey: ['applications'] });
        qcRef.current.invalidateQueries({ queryKey: ['invitations'] });
      }
      if (['collab_request', 'collab_accepted'].includes(n.type)) qcRef.current.invalidateQueries({ queryKey: ['connections'] });
    });
    s.on('message:new', (m: MessageDto) => {
      qcRef.current.setQueryData<{ items: MessageDto[]; hasMore: boolean }>(['messages', m.conversationId], (old) =>
        old && !old.items.some((x) => x.id === m.id) ? { ...old, items: [...old.items, m] } : old,
      );
    });
    s.on('conversation:updated', () => {
      qcRef.current.invalidateQueries({ queryKey: ['conversations'] });
      qcRef.current.invalidateQueries({ queryKey: ['unread-messages'] });
    });
    s.on('conversation:read', () => qcRef.current.invalidateQueries({ queryKey: ['conversations'] }));
    s.on('team:updated', () => {
      qcRef.current.invalidateQueries({ queryKey: ['opportunity'] });
      qcRef.current.invalidateQueries({ queryKey: ['team'] });
    });
    setSocket(s);
    return () => {
      s.disconnect();
      setSocket(null);
    };
  }, [user?.id]);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  return useContext(SocketContext);
}

// ------------------------------------------------------------------ theme
export function useTheme() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    (document.documentElement.getAttribute('data-theme') as 'dark' | 'light') ?? 'dark',
  );
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('pip-theme', theme);
    } catch {
      /* storage unavailable */
    }
  }, [theme]);
  return { theme, toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), setTheme };
}

// ------------------------------------------------------------------ misc
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · Partner in Project` : 'Partner in Project';
  }, [title]);
}
