
export default {
  async find(ctx: any) {
    const q = ctx.query || {};
    const where: Record<string, any> = {};

    if (q.content_type) where.content_type = q.content_type;
    if (q.user_id)      where.user_id      = q.user_id;
    if (q.action)       where.action       = q.action;
    if (q.startDate && q.endDate) {
      where.timestamp = {
        $between: [new Date(String(q.startDate)), new Date(String(q.endDate))]
      };
    }

    // pagination
    const page     = Math.max(1, Number(q.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(q.pageSize || 10)));
    const offset   = (page - 1) * pageSize;

    // sorting: "field:order" (default timestamp desc)
    const [field, order] = String(q.sort || 'timestamp:desc').split(':');
    const orderBy: Record<string, 'asc' | 'desc'> = {
      [field || 'timestamp']: (order?.toLowerCase() === 'asc' ? 'asc' : 'desc')
    };

    const [rows, total] = await Promise.all([
      strapi.db.query('api::audit-log.audit-log').findMany({
        where, limit: pageSize, offset, orderBy
      }),
      strapi.db.query('api::audit-log.audit-log').count({ where })
    ]);

    ctx.body = {
      data: rows,
      meta: {
        pagination: {
          page, pageSize,
          pageCount: Math.ceil(total / pageSize),
          total
        }
      }
    };
  },
};
