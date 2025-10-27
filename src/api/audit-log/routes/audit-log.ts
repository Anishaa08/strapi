export default {
  routes: [
    {
      method: 'GET',
      path: '/audit-logs',
      handler: 'audit-log.find',
      config: {
        policies: ['global::can-read-audit-logs'],
      },
    },
  ],
};
