/**
 * Help content — Superadmin console only.
 * Block types: p | steps | list | table | fields | callout
 */

const superadmin = {
  id: 'superadmin-console',
  title: 'Superadmin console',
  icon: 'ShieldCheck',
  summary:
    'Control-plane guide for Blurasaga superadmins: create tenant admins, review audit across tenants, and use this help.',
  sections: [
    {
      id: 'sa-overview',
      group: 'Overview',
      groupBlurb: 'What this console is for',
      icon: 'LayoutDashboard',
      blurb: 'Superadmin is the control plane — not day-to-day monitoring.',
      title: 'What superadmin is for',
      blocks: [
        {
          type: 'p',
          text: 'The **superadmin** account manages the platform itself: who gets a tenant, which pages they can open, and a cross-tenant view of activity. It does **not** open Alerts, Events, Profiles, or other monitoring modules — those live inside each tenant admin’s site.',
        },
        {
          type: 'table',
          head: ['Sidebar', 'Use it for'],
          rows: [
            ['**Home**', 'Console overview — tenants and high-level status.'],
            ['**Users**', 'Create and edit **tenant admins** (and their access).'],
            ['**Audit**', 'Activity across every tenant database.'],
            ['**Help**', 'This guide.'],
          ],
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'Demo tip',
          text: 'To show BluGate, alerts, posts, or System Health with live platform status, sign in as a **tenant admin** (Odisha, Delhi, Jharkhand, Uganda, …) on that tenant’s URL.',
        },
      ],
    },

    {
      id: 'sa-sign-in',
      group: 'Overview',
      icon: 'LogIn',
      blurb: 'Signing in and single-device sessions.',
      title: 'Signing in',
      blocks: [
        {
          type: 'steps',
          items: [
            { text: 'Open the site URL you use for the console (tenant host or IP:port).' },
            { text: 'Enter username **superadmin** and your password.' },
            { text: 'Click **Sign in** (or **Continue**).' },
          ],
        },
        {
          type: 'callout',
          tone: 'warn',
          title: 'Account already logged in',
          text: 'Only one active session is allowed. If you see the yellow box, click **Login here** to end the other session. On HTTP IP:port access, a hard refresh may be needed after login so the cookie sticks.',
        },
      ],
    },

    {
      id: 'sa-users',
      group: 'Users',
      groupBlurb: 'Tenant admins and access',
      icon: 'Users',
      blurb: 'Create admins and choose their pages and platforms.',
      title: 'Managing users',
      blocks: [
        {
          type: 'p',
          text: 'Open **Users** in the sidebar. As superadmin you create **admin** accounts. Each admin is tied to a tenant database (`db_name`) where posts, alerts, and BluGate keys live.',
        },
        {
          type: 'steps',
          items: [
            { text: 'Click **Add** (or the create-user action).' },
            { text: 'Fill **name**, **username**, **email**, and a strong **password** (or auto-generate and copy it).' },
            { text: 'Role should be **admin** for a new tenant owner.' },
            { text: 'Under **Page access**, tick the monitoring modules that admin may use (Alerts, Events, Health, etc.).' },
            { text: 'Choose **platforms** this admin may activate (Facebook, X, YouTube, …).' },
            { text: 'Save. The admin can then sign in on their tenant URL and finish platform keys under **Settings → Platforms**.' },
          ],
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'Users vs tenant data',
          text: 'Login accounts live in the main **blurasaga** database. Monitoring data (posts, embeddings, BluGate keys) lives in each admin’s **tenant** database.',
        },
        {
          type: 'live',
          route: '/users-management',
          alt: 'Users management',
          caption: 'Users page — create tenant admins and set page access.',
          height: 520,
          markers: [
            { n: 1, target: { text: 'Users' }, label: 'Users', text: 'Accounts you manage.' },
            { n: 2, target: { placeholder: 'Search' }, label: 'Search', text: 'Filter the list.' },
            { n: 3, target: { text: 'Add' }, label: 'Add', text: 'Create a new admin.' },
          ],
        },
      ],
    },

    {
      id: 'sa-audit',
      group: 'Audit',
      groupBlurb: 'Who did what, across tenants',
      icon: 'ScrollText',
      blurb: 'Cross-tenant activity log.',
      title: 'Audit logs',
      blocks: [
        {
          type: 'p',
          text: 'Open **Audit** in the sidebar. Superadmin sees a **merged** log from every tenant: logins, user changes, and other recorded actions.',
        },
        {
          type: 'list',
          items: [
            { text: 'Use **search** for user, action, tenant, or IP.' },
            { text: 'Filter by **action** and **resource**, and optionally a **date range**.' },
            { text: 'On phones, logs show as **cards**; on desktop, as a **table**.' },
            { text: 'Export **CSV** (Excel/PDF available on larger screens).' },
          ],
        },
        {
          type: 'live',
          route: '/audit-logs',
          alt: 'Audit logs',
          caption: 'Audit — filter and review activity across tenants.',
          height: 520,
          markers: [
            { n: 1, target: { text: 'Audit' }, label: 'Audit', text: 'Cross-tenant activity.' },
            { n: 2, target: { placeholder: 'Search' }, label: 'Search', text: 'Find a user or action.' },
          ],
        },
      ],
    },

    {
      id: 'sa-tenants',
      group: 'Tenants',
      groupBlurb: 'Where monitoring actually runs',
      icon: 'Building2',
      blurb: 'How tenants relate to the console.',
      title: 'Tenants and URLs',
      blocks: [
        {
          type: 'p',
          text: 'Each organisation (Odisha, Delhi Police, Jharkhand, Uganda, …) has its own frontend URL and API, plus its own Postgres database for posts and BluGate credentials.',
        },
        {
          type: 'table',
          head: ['You want to…', 'Do this'],
          rows: [
            ['Create / edit admins', 'Stay on **superadmin** → **Users**'],
            ['See System Health with BluGate online', 'Log in as that **tenant admin**'],
            ['Show alerts / posts / AI assistant', 'Use the **tenant** site and admin account'],
            ['Check who changed what everywhere', 'Stay on **superadmin** → **Audit**'],
          ],
        },
        {
          type: 'callout',
          tone: 'warn',
          title: 'System Health on superadmin',
          text: 'Health is a **tenant** page (needs BluGate keys from that tenant DB). It is not in the superadmin sidebar on purpose. Open a tenant admin account to demo platform health.',
        },
      ],
    },

    {
      id: 'sa-checklist',
      group: 'Checklist',
      groupBlurb: 'Quick checks before a demo',
      icon: 'CheckCircle2',
      blurb: 'Fast path before showing the product.',
      title: 'Pre-demo checklist',
      blocks: [
        {
          type: 'steps',
          items: [
            { text: 'Confirm **superadmin** can open Home, Users, Audit, Help.' },
            { text: 'Confirm at least one **tenant admin** can sign in on their URL.' },
            { text: 'On the tenant site, open **System Health** — Postgres / LLM / Sentiment should be online; BluGate should show credentials for that tenant.' },
            { text: 'Open **Alerts** or **Events** on the tenant to show live data.' },
            { text: 'If login shows “already logged in”, click **Login here** once.' },
          ],
        },
      ],
    },
  ],
};

export default superadmin;
