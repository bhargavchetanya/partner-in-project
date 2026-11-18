import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { useCatalog } from '@/lib/hooks';
import type { Opportunity } from '@/lib/types';
import { Button, Field, Modal, Select, Textarea } from './ui';

const reasons = [
  ['spam', 'Spam or advertising'],
  ['harassment', 'Harassment or bullying'],
  ['inappropriate', 'Inappropriate content'],
  ['fake_profile', 'Fake profile / impersonation'],
  ['misleading', 'Misleading information'],
  ['other', 'Something else'],
] as const;

export function ReportDialog({ open, onClose, targetType, targetId, label }: { open: boolean; onClose: () => void; targetType: 'user' | 'opportunity' | 'message'; targetId: string; label: string }) {
  const [reason, setReason] = useState<string>('spam');
  const [details, setDetails] = useState('');
  const m = useMutation({
    mutationFn: () => api.post('/reports', { targetType, targetId, reason, details }),
    onSuccess: () => {
      toast.success('Thanks — our moderators will review this.');
      onClose();
      setDetails('');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Report ${label}`}
      description="Reports are confidential. Admins review every report."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="danger" loading={m.isPending} onClick={() => m.mutate()}>Submit report</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Reason">
          <Select value={reason} onChange={(e) => setReason(e.target.value)}>
            {reasons.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Details (optional)">
          <Textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} placeholder="Anything that helps the moderators understand the problem" />
        </Field>
      </div>
    </Modal>
  );
}

export function InviteDialog({ open, onClose, userId, userName, defaultOpportunityId }: { open: boolean; onClose: () => void; userId: string; userName: string; defaultOpportunityId?: string }) {
  const { roleName } = useCatalog();
  const mine = useQuery({ queryKey: ['opportunities', 'mine'], queryFn: () => api.get<{ led: Opportunity[] }>('/opportunities/mine'), enabled: open });
  const openTeams = (mine.data?.led ?? []).filter((o) => o.status === 'open');
  const [oppId, setOppId] = useState(defaultOpportunityId ?? '');
  const opp = openTeams.find((o) => o.id === (oppId || openTeams[0]?.id));
  const [role, setRole] = useState('');
  const [message, setMessage] = useState('');
  const roles = opp?.openRoles.filter((r) => r.remaining > 0) ?? [];
  const m = useMutation({
    mutationFn: () => api.post(`/opportunities/${opp!.id}/invite`, { userId, role: role || roles[0]?.role, message }),
    onSuccess: () => {
      toast.success(`Invitation sent to ${userName}`);
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Invite ${userName} to your team`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!opp || roles.length === 0} loading={m.isPending} onClick={() => m.mutate()}>Send invitation</Button>
        </>
      }
    >
      {mine.isLoading ? (
        <p className="text-sm text-muted">Loading your teams…</p>
      ) : openTeams.length === 0 ? (
        <p className="text-sm text-muted">You don't lead any open team right now. Create a team post first — it becomes open once an admin approves it.</p>
      ) : (
        <div className="space-y-4">
          <Field label="Team">
            <Select value={opp?.id} onChange={(e) => { setOppId(e.target.value); setRole(''); }}>
              {openTeams.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
            </Select>
          </Field>
          <Field label="Role">
            <Select value={role || roles[0]?.role} onChange={(e) => setRole(e.target.value)}>
              {roles.map((r) => <option key={r.role} value={r.role}>{roleName(r.role)} ({r.remaining} open)</option>)}
            </Select>
          </Field>
          <Field label="Message (optional)">
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} placeholder="Why you'd love them on the team" />
          </Field>
        </div>
      )}
    </Modal>
  );
}
