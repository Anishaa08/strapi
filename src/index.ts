// src/index.ts
import type { Core } from '@strapi/strapi';

type AuditAction = 'create' | 'update' | 'delete';

interface AuditConfig {
  enabled: boolean;
  excludeContentTypes: string[];
  storeFullOnCreateDelete: boolean;
}

export default {
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    // Read config from config/plugins.ts (kebab-case key)
    const cfg: AuditConfig = strapi.config.get('plugin.audit-log', {
      enabled: true,
      excludeContentTypes: ['plugin::upload.file'],
      storeFullOnCreateDelete: true,
    });

    if (!cfg.enabled) return;

    // Global lifecycle subscription (all content types)
    strapi.db.lifecycles.subscribe({
      models: ['*'],

      async afterCreate(event) {
        await logChange(strapi, event, 'create', cfg);
      },

      async afterUpdate(event) {
        await logChange(strapi, event, 'update', cfg);
      },

      async afterDelete(event) {
        await logChange(strapi, event, 'delete', cfg);
      },
    });

    // Optional: create DB indexes if you add ./bootstrap/indexes.ts
    try {
      // Ignore TS error if the optional module isn't present at compile time
      // @ts-ignore
      const mod = await import('./bootstrap/indexes');
      if (mod?.default) await mod.default({ strapi });
    } catch {
      // ignore if file not present
    }
  },
};

/* ---------------- helpers ---------------- */

async function logChange(
  strapi: Core.Strapi,
  event: any,
  action: AuditAction,
  cfg: AuditConfig
) {
  const { model, result, params, state } = event;

  // Guard & excludes
  if (!model?.uid) return;
  if (cfg.excludeContentTypes.includes(model.uid)) return;

  // Try to capture user (Admin or Content API)
  const userId =
    state?.auth?.credentials?.id ??
    state?.user?.id ??
    null;

  let changes: any = {};
  if (action === 'update') {
    const id = result?.id ?? params?.where?.id;
    const before = await tryFetchBefore(strapi, model.uid, id);
    changes = computeDiff(before, result);
  } else if (cfg.storeFullOnCreateDelete) {
    changes = result;
  }

  await strapi.db.query('api::audit-log.audit-log').create({
    data: {
      content_type: model.uid,
      record_id: String(result?.id ?? params?.where?.id ?? ''),
      action,
      user_id: userId ? String(userId) : null,
      timestamp: new Date(),
      changes,
    },
  });
}

async function tryFetchBefore(
  strapi: Core.Strapi,
  uid: string,
  id: number | string | undefined | null
) {
  if (id === undefined || id === null) return null;
  try {
    // TS-safe in Strapi v5: accepts UID string
    return await strapi.db.query(uid).findOne({ where: { id } });
  } catch {
    return null;
  }
}

function computeDiff(before: any, after: any) {
  if (!before) return after || {};
  const changed: Record<string, any> = {};
  const keys = new Set([
    ...Object.keys(before || {}),
    ...Object.keys(after || {}),
  ]);
  for (const k of keys) {
    const lhs = safeJson(before?.[k]);
    const rhs = safeJson(after?.[k]);
    if (lhs !== rhs) {
      changed[k] = { from: before?.[k], to: after?.[k] };
    }
  }
  return changed;
}

function safeJson(v: any) {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}