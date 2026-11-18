import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, MessageSquare, Search, Users } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useDocumentTitle } from '@/lib/hooks';
import type { ConversationDto } from '@/lib/types';
import { cn, timeAgo } from '@/lib/utils';
import { Avatar, ButtonLink, EmptyState, ErrorState, Input, Skeleton } from '@/components/ui';
import { ChatPanel } from '@/components/chat';

export default function Messages() {
  useDocumentTitle('Messages');
  const { conversationId } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [search, setSearch] = useState('');
  const q = useQuery({ queryKey: ['conversations'], queryFn: () => api.get<{ items: ConversationDto[] }>('/conversations'), refetchInterval: 30_000 });

  // /messages?with=<userId> opens (or creates) the direct conversation
  useEffect(() => {
    const withId = params.get('with');
    if (withId) {
      api.post<ConversationDto>('/conversations/direct', { userId: withId }).then((c) => nav(`/messages/${c.id}`, { replace: true })).catch(() => nav('/messages', { replace: true }));
    }
  }, [params]);

  const list = (q.data?.items ?? []).filter((c) => !search || c.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="-mx-4 -mt-6 sm:mx-0 sm:mt-0">
      <div className="card grid h-[calc(100dvh-10.5rem)] overflow-hidden rounded-none sm:rounded-2xl lg:h-[calc(100dvh-8.5rem)] md:grid-cols-[320px_1fr]">
        <aside className={cn('flex min-h-0 flex-col border-r border-line', conversationId && 'hidden md:flex')}>
          <div className="border-b border-line p-4">
            <h1 className="mb-3 font-display text-xl font-semibold">Messages</h1>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search conversations" leftIcon={<Search className="size-4" />} className="h-10" aria-label="Search conversations" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin p-2">
            {q.isLoading ? (
              <div className="space-y-2 p-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>
            ) : q.isError ? (
              <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
            ) : list.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-muted">
                No conversations yet. Connect with students on <Link to="/discover" className="text-primary">Discover</Link> to start chatting — team chats appear when you join a team.
              </div>
            ) : (
              list.map((c) => (
                <Link key={c.id} to={`/messages/${c.id}`} className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5 transition', conversationId === c.id ? 'bg-surface-2' : 'hover:bg-surface-2/60')}>
                  {c.type === 'team' ? (
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/40 to-accent/30"><Users className="size-5" /></span>
                  ) : (
                    <Avatar name={c.title} src={c.participants[0]?.avatarUrl} size={44} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn('truncate text-[14px]', c.unread ? 'font-semibold text-fg' : 'font-medium text-fg-2')}>{c.title}</span>
                      <span className="shrink-0 text-[11px] text-muted">{timeAgo(c.lastMessageAt)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn('truncate text-[12.5px]', c.unread ? 'text-fg-2' : 'text-muted')}>{c.lastMessagePreview || (c.type === 'team' ? 'Team chat created' : 'Say hello 👋')}</span>
                      {c.unread > 0 && <span className="shrink-0 rounded-full bg-primary px-1.5 text-[11px] font-semibold text-white">{c.unread}</span>}
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </aside>
        <section className={cn('min-h-0 flex-col', conversationId ? 'flex' : 'hidden md:flex')}>
          {conversationId ? (
            <>
              <Link to="/messages" className="flex items-center gap-1.5 border-b border-line px-4 py-2 text-sm text-muted md:hidden"><ArrowLeft className="size-4" /> All conversations</Link>
              <ChatPanel key={conversationId} conversationId={conversationId} className="min-h-0 flex-1" />
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8">
              <EmptyState icon={<MessageSquare />} title="Pick a conversation" body="Messages arrive in real time. Only connections and teammates can message you." action={<ButtonLink to="/connections" variant="secondary">View connections</ButtonLink>} className="border-none" />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
