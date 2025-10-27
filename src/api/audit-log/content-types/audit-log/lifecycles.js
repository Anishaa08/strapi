'use strict';

/**
 * Generic audit-logging lifecycles for a content-type.
 * Works for create / update / delete via Content API (and Admin).
 *
 * Assumptions:
 * - AuditLog CT exists at: api::audit-log.audit-log (table: audit_logs)
 * - Fields: contentType (string), recordId (string/int), action (string),
 *           userId (string/int, optional), userEmail (string, optional),
 *           payload (JSON, optional), diff (JSON, optional)
 * - Optional config in config/audit-log.(js|ts):
 *     { auditLog: { enabled: true, excludeContentTypes: [] } }
 */

const getConfig = () => {
  const fallback = { enabled: true, excludeContentTypes: [] };
  try {
    const cfg = strapi.config.get('auditLog', fallback);
    return {
      enabled: cfg?.enabled ?? true,
      excludeContentTypes: Array.isArray(cfg?.excludeContentTypes)
        ? cfg.excludeContentTypes
        : [],
    };
  } catch {
    return fallback;
  }
};

// Try to read the current request user (Users & Permissions / Admin)
const getCurrentUser = () => {
  try {
    // Strapi v5 (Koa) request context
    const ctx = strapi.requestContext.get();
    // Users & Permissions plugin (front-site users)
    const upUser = ctx?.state?.user;
    // Admin user
    const adminUser = ctx?.state?.admin?.user;
    const user = upUser || adminUser;

    return user
      ? {
          id: user.id ?? user._id ?? null,
          email: user.email ?? user.username ?? null,
        }
      : { id: null, email: null };
  } catch {
    return { id: null, email: null };
  }
};

// shallow diff: what changed between before & after
const diffObjects = (before = {}, after = {}) => {
  const changed = {};
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  for (const k of keys) {
    const bv = before?.[k];
    const av = after?.[k];
    const same =
      (bv === av) ||
      (bv === undefined && av === undefined);
    if (!same) {
      changed[k] = { before: bv, after: av };
    }
  }
  return changed;
};

// Save an audit log row
const saveAuditLog = async (data) => {
  try {
    await strapi.entityService.create('api::audit-log.audit-log', { data });
  } catch (e) {
    strapi.log.error('[audit-log] Failed to write audit log:', e);
  }
};

module.exports = {
  /**
   * NOTE: We capture "before" for updates in beforeUpdate, then compute the diff in afterUpdate.
   * If you prefer, you can compute diff only from `event.params.data` vs `event.result`,
   * but this approach yields a more accurate “before” snapshot.
   */

  async beforeUpdate(event) {
    const { enabled, excludeContentTypes } = getConfig();
    if (!enabled) return;

    const uid = event?.model?.uid || event?.model?.modelName || '';
    if (excludeContentTypes.includes(uid)) return;

    try {
      const id =
        event?.params?.where?.id ??
        event?.params?.where?.documentId ??
        event?.params?.data?.id ??
        event?.result?.id;

      if (!id) return; // nothing to capture

      // Capture "before" entity
      const before = await strapi.entityService.findOne(uid, id, { populate: '*' });
      // Attach to event.state for afterUpdate
      event.state = event.state || {};
      event.state._auditBefore = before;
    } catch (e) {
      strapi.log.warn('[audit-log] beforeUpdate could not fetch previous entity:', e?.message);
    }
  },

  async afterCreate(event) {
    const { enabled, excludeContentTypes } = getConfig();
    if (!enabled) return;

    const uid = event?.model?.uid || event?.model?.modelName || '';
    if (excludeContentTypes.includes(uid)) return;

    const user = getCurrentUser();

    const recordId =
      event?.result?.id ??
      event?.params?.data?.id ??
      event?.result?.documentId ??
      null;

    const payload = event?.result ?? event?.params?.data ?? null;

    await saveAuditLog({
      contentType: uid,
      recordId,
      action: 'create',
      userId: user.id,
      userEmail: user.email,
      payload, // full snapshot on create
      // diff not necessary for creates
    });
  },

  async afterUpdate(event) {
    const { enabled, excludeContentTypes } = getConfig();
    if (!enabled) return;

    const uid = event?.model?.uid || event?.model?.modelName || '';
    if (excludeContentTypes.includes(uid)) return;

    const user = getCurrentUser();

    const recordId =
      event?.result?.id ??
      event?.params?.where?.id ??
      event?.result?.documentId ??
      null;

    const before = event?.state?._auditBefore || {};
    const after = event?.result || {};
    const changed = diffObjects(before, after);

    await saveAuditLog({
      contentType: uid,
      recordId,
      action: 'update',
      userId: user.id,
      userEmail: user.email,
      diff: changed, // what actually changed
      // optional: payload: after  (if you want the full after snapshot too)
    });
  },

  async afterDelete(event) {
    const { enabled, excludeContentTypes } = getConfig();
    if (!enabled) return;

    const uid = event?.model?.uid || event?.model?.modelName || '';
    if (excludeContentTypes.includes(uid)) return;

    const user = getCurrentUser();

    // afterDelete often gives the deleted entity in result; fallback to where.id
    const recordId =
      event?.result?.id ??
      event?.params?.where?.id ??
      event?.result?.documentId ??
      null;

    const payload = event?.result ?? null; // final snapshot before removal

    await saveAuditLog({
      contentType: uid,
      recordId,
      action: 'delete',
      userId: user.id,
      userEmail: user.email,
      payload, // full snapshot on delete
    });
  },
};
