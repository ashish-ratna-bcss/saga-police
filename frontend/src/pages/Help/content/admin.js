/**
 * Help content — Administration (Users, Audit, System Health).
 * Block types: p | steps | list | table | fields | callout
 */

const admin = {
  id: 'admin',
  title: 'Administration',
  icon: 'ShieldCheck',
  summary:
    'Create accounts and choose what each can open, review the activity log, and check that every service is healthy.',
  sections: [
    {
      id: 'users-overview',
      group: 'Users',
      groupBlurb: 'Accounts and page access',
      icon: 'Users',
      blurb: 'What the Users page shows and how to add an account.',
      title: 'The Users page',
      blocks: [
        {
          type: 'p',
          text: 'Open **Users** in the sidebar. As an admin you create user accounts for your organisation and choose which pages each one can open.',
        },
        {
          type: 'p',
          text: 'The table lists **User**, **Username**, **Role** and **Created**, with actions at the end of each row. Use **Search** to filter, and **Add** to create an account.',
        },
        {
          type: 'live',
          route: '/users-management',
          alt: 'The Users page',
          caption: 'The Users page lists accounts in your organisation.',
          height: 560,
          markers: [
            { n: 1, target: { text: 'Users' }, label: 'Users', text: 'Accounts in your organisation.' },
            { n: 2, target: { placeholder: 'Search' }, label: 'Search', text: 'Filter the list.' },
            { n: 3, target: { text: 'Add' }, label: 'Add', text: 'Opens the form to create an account.' },
            { n: 4, target: { text: 'Role' }, label: 'Role', text: 'Each account\'s role.' },
            { n: 5, target: { text: 'Actions' }, label: 'Actions', text: 'Edit or delete an account.' },
          ],
        },
        {
          type: 'p',
          text: 'The Users page is only available to accounts that have been allowed to manage users. If you are not, you are sent back to the dashboard.',
        },
      ],
    },

    {
      id: 'users-create',
      group: 'Users',
      icon: 'UserPlus',
      blurb: 'Create an account and choose its pages.',
      title: 'Creating and editing an account',
      blocks: [
        {
          type: 'steps',
          items: [
            { text: 'Click **Add**. The dialog is titled **Create user**.' },
            { text: 'Enter **Full name**, **Username** and **Email**.' },
            { text: 'Enter a **Password** of at least 8 characters, or click **Auto-generate**. Copy it before you save.', note: 'The eye icon shows or hides what you typed.' },
            { text: 'On the right, under **Page access**, click the pages this account may open. **All** ticks every page and **None** clears them.' },
            { text: 'Click **Create**.' },
          ],
        },
        {
          type: 'p',
          text: 'To change an account, use its edit action in the table. The password field is not shown when editing. Click **Save** when done.',
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'Platforms come from the admin',
          text: 'A user does not pick platforms. They see the platforms the admin has left **Active** in **Settings > Platforms**.',
        },
        {
          type: 'callout',
          tone: 'warn',
          title: 'Deleting an account cannot be undone',
          text: 'The delete action asks you to confirm and then removes the account.',
        },
      ],
    },

    {
      id: 'audit',
      group: 'Audit log',
      groupBlurb: 'A record of who did what',
      icon: 'ScrollText',
      blurb: 'Filter the activity log and read what changed.',
      title: 'Audit Logs',
      blocks: [
        {
          type: 'p',
          text: 'Open **Audit** in the sidebar. Four tiles summarise the log: **Total Activities**, **Manual Checks**, **Security Events** and **Active Users**.',
        },
        {
          type: 'live',
          route: '/audit-logs',
          alt: 'The Audit Logs page',
          caption: 'The Audit Logs page records who did what.',
          height: 560,
          markers: [
            { n: 1, target: { text: 'Total Activities' }, label: 'Total Activities', text: 'How many events are recorded.' },
            { n: 2, target: { text: 'Security Events' }, label: 'Security Events', text: 'Security-related events.' },
            { n: 3, target: { placeholder: 'Search logs' }, label: 'Search logs', text: 'Find events by text.' },
            { n: 4, target: { text: 'CSV' }, label: 'CSV', text: 'Export the log as CSV.' },
            { n: 5, target: { text: 'PDF' }, label: 'PDF', text: 'Export the log as PDF.' },
          ],
        },
        {
          type: 'p',
          text: 'The **Activity Log** table shows **Timestamp**, **User**, **Action**, **Resource**, **Device / IP** and **Change** for each event.',
        },
        {
          type: 'steps',
          title: 'Filter the log',
          items: [
            { text: 'Type in **Search logs...** to match text.' },
            { text: 'Choose an **Action**: Create, Update, Delete, Login or Manual Check.' },
            { text: 'Choose a **Resource**: Source, User, Alert or Settings.' },
            { text: 'Pick a start and end date, then click the search icon (**Apply Date Filter**). The x icon (**Clear Dates**) resets them.' },
          ],
        },
        {
          type: 'p',
          text: 'To keep a copy, use the **CSV**, **Excel** or **PDF** buttons to export.',
        },
      ],
    },

    {
      id: 'audit-changes',
      group: 'Audit log',
      icon: 'Layers',
      blurb: 'See exactly what changed in an event.',
      title: 'The change viewer',
      blocks: [
        {
          type: 'p',
          text: 'Open the **Change** entry on a row to see the details of that event. It has two tabs.',
        },
        {
          type: 'table',
          head: ['Tab', 'Shows'],
          rows: [
            ['**Visual Overview**', 'A readable summary of what was created, changed or removed, with the device involved.'],
            ['**Raw JSON**', 'The full stored data, for support or checking.'],
          ],
        },
      ],
    },

    {
      id: 'health',
      group: 'System health',
      groupBlurb: 'Is everything running?',
      icon: 'Activity',
      blurb: 'The three health groups and how to read them.',
      title: 'System Health',
      blocks: [
        {
          type: 'p',
          text: 'Open **Health** in the sidebar. The page updates itself every 15 seconds; click **Refresh** to update now. Three tiles group the services, and each shows an overall state of **Healthy**, **Degraded** or **Down**.',
        },
        {
          type: 'live',
          route: '/system-health',
          alt: 'The System Health page',
          caption: 'The System Health page shows the state of each service.',
          height: 560,
          markers: [
            { n: 1, target: { text: 'System Health' }, label: 'System Health', text: 'Overall state of the services.' },
            { n: 2, target: { text: 'Refresh' }, label: 'Refresh', text: 'Update the checks now.' },
            { n: 3, target: { text: 'Infrastructure' }, label: 'Infrastructure', text: 'Database and core services.' },
            { n: 4, target: { text: 'AI services' }, label: 'AI services', text: 'The AI services Blurasaga relies on.' },
          ],
        },
        {
          type: 'table',
          head: ['Group', 'Covers'],
          rows: [
            ['**Infrastructure**', 'The main database (PostgreSQL) that stores profiles, events, alerts and settings.'],
            ['**AI services**', 'The language model (risk scoring), the sentiment service (alert analysis), the media analyzer (image and video text), the RAG API (investigation search), Web Intelligence (crawl and document search) and Telegram.'],
            ['**BluGate**', 'The BluGate gateway and your account or billing status.'],
          ],
        },
        {
          type: 'callout',
          tone: 'warn',
          title: 'Alerts depend on the AI services',
          text: 'If the language model or sentiment service is offline, the page shows a warning banner. New alerts may not be analysed until it recovers.',
        },
      ],
    },

    {
      id: 'troubleshooting',
      group: 'Reference',
      icon: 'LifeBuoy',
      blurb: 'Common problems and what to check.',
      title: 'Troubleshooting',
      blocks: [
        {
          type: 'table',
          head: ['Problem', 'What to check'],
          rows: [
            ['Clicking Users sends me to the dashboard', 'Your account is not allowed to manage users. Ask your admin.'],
            ['A new user cannot open a page', 'Open their account and tick the page under **Page access**, then **Save**.'],
            ['A user sees no platforms', 'The admin has no platform **Active**. Check **Settings > Platforms**.'],
            ['"Save failed" creating an account', 'Check the username and email are not already used, and the password is at least 8 characters.'],
            ['"File size must be less than 5MB"', 'Choose a smaller logo image.'],
            ['I cannot find an event in Audit', 'Widen the dates, and set **Action** and **Resource** to all.'],
            ['Health shows Offline for a service', 'Wait for the next refresh. If it stays down, contact your platform administrator.'],
          ],
        },
      ],
    },
  ],
};

export default admin;
