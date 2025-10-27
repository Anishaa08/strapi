// // config/plugins.ts
// export default ({ env }) => {
//   // Parse CSV env to array (robust even if empty)
//   const excludes = String(env('AUDIT_LOG_EXCLUDES', ''))
//     .split(',')
//     .map((s) => s.trim())
//     .filter(Boolean);

//   return {
//     // IMPORTANT: kebab-case plugin key
//     'audit-log': {
//       enabled: env.bool('AUDIT_LOG_ENABLED', true),
//       excludeContentTypes: excludes,
//     },
//   };
// };
