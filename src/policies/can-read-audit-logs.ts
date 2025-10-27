// src/policies/can-read-audit-logs.ts
import { Context } from 'koa';

const canReadAuditLogs = async (ctx: Context, next: () => Promise<any>) => {
  const user = ctx.state?.user || null;

  if (!user) {
    return ctx.unauthorized('Not authenticated');
  }

  const userRole = user.role?.name?.toLowerCase?.();

  // Allow Super Admins or a custom role like "Auditor"
  if (userRole === 'super admin' || userRole === 'auditor') {
    return next();
  }

  // Otherwise deny
  return ctx.forbidden('Missing permission: read_audit_logs');
};

export default canReadAuditLogs;
