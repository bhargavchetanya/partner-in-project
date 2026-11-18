import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCheck, Flag, Loader2, Send } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useSocket, useUser } from '@/lib/hooks';
import type { ConversationDto, MessageDto } from '@/lib/types';
import { cn, formatDate } from '@/lib/utils';
import { Avatar, Button, Spinner } from './ui';
import { ReportDialog } from './dialogs';

export function ChatPanel({ conversationId, className, header = true }: { conversationId: string; className?: string; header?: boolean }) {
  const me = useUser()!;
  const qc = useQueryClient();
  const socket = useSocket();
  const [text, setText] = useState('');
  const [typing, setTyping] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const lastTyping = useRef(0);

  const conv = useQuery({ queryKey: ['conversation', conversationId], queryFn: () => api.get<ConversationDto>(`/conversations/${conversationId}`) });
  const msgs = useQuery({ queryKey: ['messages', conversationId], queryFn: () => api.get<{ items: MessageDto[]; hasMore: boolean }>(`/conversations/${conversationId}/messages`) });
  const [olderItems, setOlderItems] = useState<MessageDto[]>([]);
  const [olderHasMore, setOlderHasMore] = useState<boolean | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  useEffect(() => {
    setOlderItems([]);
    setOlderHasMore(null);
  }, [conversationId]);
  const loadOlder = async () => {
    const first = olderItems[0] ?? msgs.data?.items[0];
    if (!first) return;
    setLoadingOlder(true);
    try {
      const r = await api.get<{ items: MessageDto[]; hasMore: boolean }>(`/conversations/${conversationId}/messages?before=${encodeURIComponent(first.createdAt)}`);
      setOlderItems((o) => [...r.items, ...o]);
      setOlderHasMore(r.hasMore);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoadingOlder(false);
    }
  };

  // join the room for live delivery
  useEffect(() => {
    if (!socket) return;
    const join = () => socket.emit('conversation:join', conversationId);
    join();
    socket.on('connect', join);
    const onTyping = (p: { conversationId: string; userId: string }) => {
      if (p.conversationId !== conversationId || p.userId === me.id) return;
      setTyping(p.userId);
      setTimeout(() => setTyping(null), 2500);
    };
    socket.on('typing', onTyping);
    return () => {
      socket.emit('conversation:leave', conversationId);
      socket.off('connect', join);
      socket.off('typing', onTyping);
    };
  }, [socket, conversationId, me.id]);

  const items = [...olderItems, ...(msgs.data?.items ?? [])];
  const canLoadOlder = olderHasMore ?? !!msgs.data?.hasMore;
  const lastId = items[items.length - 1]?.id;

  // mark as read whenever new messages arrive
  useEffect(() => {
    if (!lastId) return;
    api.post(`/conversations/${conversationId}/read`).then(() => {
      qc.invalidateQueries({ queryKey: ['unread-messages'] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    }).catch(() => undefined);
  }, [lastId, conversationId]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId]);

  const send = useMutation({
    mutationFn: (body: string) => api.post<MessageDto>(`/conversations/${conversationId}/messages`, { body }),
    onMutate: (body) => setText((t) => (t === body ? '' : t)),
    onSuccess: (m) => {
      qc.setQueryData<{ items: MessageDto[]; hasMore: boolean }>(['messages', conversationId], (old) => (old && !old.items.some((x) => x.id === m.id) ? { ...old, items: [...old.items, m] } : old));
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (e, body) => {
      setText(body); // keep what the user typed (QR9)
      toast.error(errorMessage(e));
    },
  });

  const c = conv.data;
  const people = new Map(c?.participants.map((p) => [p.id, p]) ?? []);
  const typingName = typing ? people.get(typing)?.name.split(' ')[0] : null;

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      {header && c && (
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          {c.type === 'direct' ? (
            <Link to={`/u/${c.participants[0]?.id}`} className="flex items-center gap-3">
              <Avatar name={c.title} src={c.participants[0]?.avatarUrl} size={38} />
              <div>
                <div className="font-medium">{c.title}</div>
                <div className="text-[12px] text-muted">{c.participants[0]?.headline || 'Direct message'}</div>
              </div>
            </Link>
          ) : (
            <Link to={`/opportunities/${c.opportunityId}/team`} className="flex items-center gap-3">
              <div className="flex -space-x-2">{c.participants.slice(0, 3).map((p) => <Avatar key={p.id} name={p.name} src={p.avatarUrl} size={30} ring />)}</div>
              <div>
                <div className="font-medium">{c.title}</div>
                <div className="text-[12px] text-muted">Team chat · {c.participants.length + 1} member{c.participants.length ? 's' : ''}</div>
              </div>
            </Link>
          )}
        </div>
      )}
      <div ref={scroller} className="min-h-0 flex-1 space-y-1 overflow-y-auto scrollbar-thin px-4 py-4">
        {msgs.isLoading ? (
          <div className="flex h-full items-center justify-center"><Spinner /></div>
        ) : (
          <>
            {canLoadOlder && (
              <div className="pb-2 text-center">
                <button className="text-[12.5px] text-primary hover:underline" onClick={loadOlder} disabled={loadingOlder}>
                  {loadingOlder ? <Loader2 className="mx-auto size-4 animate-spin" /> : 'Load earlier messages'}
                </button>
              </div>
            )}
            {items.length === 0 && <p className="py-10 text-center text-sm text-muted">No messages yet. Say hello 👋</p>}
            {items.map((m, i) => {
              const mine = m.senderId === me.id;
              const prev = items[i - 1];
              const showHead = !prev || prev.senderId !== m.senderId || +new Date(m.createdAt) - +new Date(prev.createdAt) > 5 * 60_000;
              const sender = people.get(m.senderId);
              const readByOthers = m.readBy.some((u) => u !== me.id);
              return (
                <div key={m.id} className={cn('group flex gap-2', mine ? 'justify-end' : 'justify-start', showHead && 'pt-3')}>
                  {!mine && <div className="w-8 shrink-0">{showHead && <Avatar name={sender?.name ?? '?'} src={sender?.avatarUrl} size={30} />}</div>}
                  <div className={cn('max-w-[78%]', mine && 'items-end text-right')}>
                    {showHead && !mine && c?.type === 'team' && <div className="mb-0.5 text-[11.5px] text-muted">{sender?.name}</div>}
                    <div className={cn('inline-block whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-left text-[14px] leading-relaxed', mine ? 'rounded-br-md bg-primary text-white' : 'rounded-bl-md bg-surface-2 text-fg', m.removed && 'italic opacity-60')}>
                      {m.body}
                    </div>
                    <div className={cn('mt-0.5 flex items-center gap-1.5 text-[10.5px] text-muted', mine ? 'justify-end' : 'justify-start')}>
                      <span title={formatDate(m.createdAt, true)}>{new Date(m.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                      {mine && readByOthers && <CheckCheck className="size-3 text-accent" aria-label="Read" />}
                      {!mine && !m.removed && (
                        <button onClick={() => setReportId(m.id)} className="opacity-0 transition group-hover:opacity-100 hover:text-danger" aria-label="Report message"><Flag className="size-3" /></button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
      <div className="h-5 px-5 text-[12px] text-muted">{typingName && `${typingName} is typing…`}</div>
      <form
        className="flex items-end gap-2 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          const body = text.trim();
          if (body) send.mutate(body);
        }}
      >
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (socket && Date.now() - lastTyping.current > 1500) {
              lastTyping.current = Date.now();
              socket.emit('typing', conversationId);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              const body = text.trim();
              if (body) send.mutate(body);
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder="Write a message… (Enter to send, Shift+Enter for a new line)"
          className="max-h-36 min-h-11 flex-1 resize-none rounded-xl border border-line bg-elev px-3.5 py-2.5 text-sm text-fg placeholder:text-muted focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary-soft"
          aria-label="Message"
        />
        <Button type="submit" className="h-11 w-11 shrink-0 !px-0" disabled={!text.trim()} loading={send.isPending} aria-label="Send message"><Send className="size-4" /></Button>
      </form>
      {reportId && <ReportDialog open onClose={() => setReportId(null)} targetType="message" targetId={reportId} label="message" />}
    </div>
  );
}
