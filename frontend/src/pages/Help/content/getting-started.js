/**
 * Help content — Getting started.
 * Block types: p | steps | list | table | fields | callout
 */

const gettingStarted = {
  id: 'getting-started',
  title: 'Getting started',
  icon: 'Rocket',
  summary:
    'Sign in, understand what your role can see, and (for admins) finish the first-time setup so SOCEYE starts collecting.',
  sections: [
    {
      id: 'sign-in',
      group: 'First steps',
      groupBlurb: 'Signing in and finding your way around',
      icon: 'LogIn',
      blurb: 'How to sign in, and what to do if the account is already in use.',
      title: 'Signing in',
      blocks: [
        {
          type: 'p',
          text: 'Open the address your administrator gave you. The login page shows your organisation’s own title, description and logo.',
        },
        {
          type: 'steps',
          items: [
            { text: 'Type your **Username**. It is converted to lower case as you type.' },
            { text: 'Type your **Password**. Use the eye icon to check what you typed.' },
            { text: 'Click **Sign in**.' },
          ],
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'Account already logged in',
          text:
            'An account can be signed in on one device at a time. If it is already active elsewhere, you are shown the device, IP address and last-seen time of that session. Click **Login here** to end the other session and continue, or **Cancel** to stay signed out.',
        },
      ],
    },

    {
      id: 'roles',
      group: 'First steps',
      icon: 'Users',
      blurb: 'What each kind of account can open.',
      title: 'Roles and what you see',
      blocks: [
        {
          type: 'p',
          text: 'The left sidebar lists only the pages your account has been given. If a page you expect is missing, ask your administrator to add it.',
        },
        {
          type: 'table',
          head: ['Role', 'What it gets'],
          rows: [
            ['**Admin**', 'The monitoring pages, plus **Users** and **Audit**. An admin creates users and chooses which pages each one can open.'],
            ['**User**', 'The monitoring pages the admin has switched on for them.'],
          ],
        },
        {
          type: 'table',
          head: ['Sidebar page', 'Use it for'],
          rows: [
            ['**Home**', 'The dashboard overview.'],
            ['**Alerts**', 'Posts flagged by keywords, risk score or viral spread.'],
            ['**Grievance**', 'Grievance posts and reports.'],
            ['**Events**', 'Event feeds from the platforms you monitor.'],
            ['**Profiles**', 'The accounts being monitored.'],
            ['**Search**', 'Search across collected content.'],
            ['**Analytics**', 'Charts and trends.'],
            ['**Tools**', 'Scrape and OSINT (see Analysis Tools).'],
            ['**Reports**', 'Generated reports.'],
            ['**Periscope**', 'Periscope view.'],
            ['**Users** / **Audit**', 'Account management and the activity log (admins).'],
            ['**Settings**', 'Alerts, platforms, templates, policies, grievances and theme.'],
            ['**Health** / **BluGate**', 'Service status, and BluGate usage and billing.'],
            ['**Help**', 'This guide.'],
          ],
        },
      ],
    },

    {
      id: 'setup-wizard',
      group: 'First-time setup',
      groupBlurb: 'Done once per organisation, by an admin',
      icon: 'Wand2',
      blurb: 'Connect BluGate, choose platforms, add keywords, finish.',
      title: 'The setup wizard',
      blocks: [
        {
          type: 'p',
          text: 'The first time an admin signs in to a new organisation, a setup wizard opens. It needs two things: at least one platform to monitor and at least one keyword.',
        },
        {
          type: 'live',
          route: '/setup',
          alt: 'The first-time setup wizard',
          caption: 'The setup wizard: connect BluGate, then add keywords.',
          height: 900,
          markers: [
            { n: 1, target: { text: 'Client key' }, label: 'Client key', text: 'Type the client key BluGate gave you.' },
            { n: 2, target: { text: 'API key' }, label: 'API key', text: 'Type your BluGate API key. It is stored encrypted and never shown again.' },
            { n: 3, target: { text: ['Fetch platforms', 'Refresh platforms'] }, label: 'Fetch platforms', text: 'Loads the platforms your BluGate plan includes.' },
            { n: 4, target: { placeholder: 'Type a keyword' }, label: 'Keyword box', text: 'Type one keyword, or several separated by commas.' },
            { n: 5, target: { text: 'Add' }, label: 'Add', text: 'Saves the keyword to your list.' },
          ],
        },
        {
          type: 'steps',
          title: 'Step 1: Connect BluGate',
          items: [
            { text: 'Enter your **Client key** and **API key**.', note: 'Keys are stored encrypted and never shown again.' },
            { text: 'Click **Fetch platforms**. (Once keys are saved the button reads **Refresh platforms**.)' },
            { text: 'Turn on the switch for each platform you want to monitor.', note: 'Platforms that are not part of your BluGate plan are greyed out and cannot be switched on.' },
          ],
        },
        {
          type: 'steps',
          title: 'Step 2: Add keywords',
          items: [
            { text: 'Type a keyword, or several separated by commas.' },
            { text: 'Press Enter or click **Add**. Each keyword appears in the list below.' },
          ],
        },
        {
          type: 'steps',
          title: 'Finish',
          items: [
            { text: 'Click **Finish setup**. SOCEYE checks that a platform and a keyword are saved, then unlocks the app.' },
          ],
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'Configuration Pending',
          text:
            'Users who are not admins see a **Configuration Pending** lock screen until an admin finishes setup. It shows how many platforms and keywords are configured. Nothing is wrong with the account; ask your admin to complete the wizard.',
        },
        {
          type: 'p',
          text: 'You can change all of this later under **Settings**. See the Settings and Platforms & BluGate articles.',
        },
      ],
    },

    {
      id: 'troubleshooting',
      group: 'Reference',
      icon: 'LifeBuoy',
      blurb: 'Common sign-in and access problems.',
      title: 'Troubleshooting',
      blocks: [
        {
          type: 'table',
          head: ['Problem', 'What to check'],
          rows: [
            ['I see "Account already logged in"', 'The account is active on another device. Click **Login here** to take over, which ends the other session.'],
            ['A page I need is not in the sidebar', 'Your account has not been given that page. Ask your admin to add it in **Users**.'],
            ['I see "Configuration Pending"', 'An admin has not finished the setup wizard yet.'],
            ['A platform I expected is greyed out in the wizard', 'It is not part of your BluGate plan. Contact BluGate to have access granted, then click **Refresh platforms**.'],
            ['I cannot finish setup', 'You need at least one platform switched on and at least one keyword added.'],
          ],
        },
      ],
    },
  ],
};

export default gettingStarted;
