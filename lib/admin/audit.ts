import { supabaseAdmin } from '@/lib/supabase/server';

export type AdminAuditPayload = {
  adminUserId: string;
  adminEmail: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  targetLabel?: string | null;
  reason?: string | null;
  status?: 'success' | 'error';
  metadata?: Record<string, unknown>;
};

export async function logAdminAuditEvent(payload: AdminAuditPayload): Promise<void> {
  const {
    adminUserId,
    adminEmail,
    action,
    targetType,
    targetId = null,
    targetLabel = null,
    reason = null,
    status = 'success',
    metadata = {},
  } = payload;

  const { error } = await supabaseAdmin
    .from('admin_audit_logs')
    .insert({
      admin_user_id: adminUserId,
      admin_email: adminEmail,
      action,
      target_type: targetType,
      target_id: targetId,
      target_label: targetLabel,
      reason,
      status,
      metadata,
    } as never);

  if (error) {
    console.error('[ADMIN AUDIT] Failed to write audit event:', error);
  }
}
