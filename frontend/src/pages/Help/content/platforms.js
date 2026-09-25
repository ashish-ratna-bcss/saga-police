/**
 * Help content — Platforms & BluGate.
 * Block types: p | steps | list | table | fields | callout
 */

const platforms = {
  id: 'platforms',
  title: 'Platforms & BluGate',
  icon: 'Plug',
  summary:
    'Connect your BluGate account, choose which platforms Blurasaga monitors, add other APIs, and read your BluGate usage and billing.',
  sections: [
    {
      id: 'concepts',
      group: 'Start here',
      groupBlurb: 'What BluGate is and how it relates to this app',
      icon: 'Compass',
      blurb: 'Access granted versus Active, explained.',
      title: 'How platforms work',
      blocks: [
        {
          type: 'p',
          text: 'BluGate is the gateway that gives Blurasaga access to each social platform. Your BluGate plan decides which platforms you may use. Inside Blurasaga you then decide which of those are switched on.',
        },
        {
          type: 'table',
          head: ['Label', 'Where it is decided', 'Meaning'],
          rows: [
            ['**Access granted** / **No access**', 'BluGate', 'Whether your BluGate plan includes the platform. You cannot change this in Blurasaga.'],
            ['**Active in this app** / **Stopped**', 'Blurasaga (you)', 'Whether Blurasaga uses the platform. Switch it with **Stop** or **Activate**.'],
          ],
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'You can only activate what BluGate grants',
          text: '**Activate** is disabled for a platform without access. Ask BluGate to grant it, then fetch again.',
        },
        {
          type: 'p',
          text: 'Platform management is in **Settings > Platforms**, and is available to admin accounts only.',
        },
      ],
    },

    {
      id: 'connect',
      group: 'Connect BluGate',
      groupBlurb: 'Keys, fetching and what comes back',
      icon: 'KeyRound',
      blurb: 'Enter your keys and fetch your account.',
      title: 'Connecting to BluGate',
      blocks: [
        {
          type: 'steps',
          items: [
            { text: 'Go to **Settings > Platforms**.' },
            { text: 'In the **BluGate** card, enter your **BluGate client key** and **API key**.' },
            { text: 'Click **Fetch**.', note: 'The keys are saved once, encrypted, and never shown again.' },
          ],
        },
        {
          type: 'live',
          route: '/settings?tab=platforms',
          alt: 'Settings, Platforms tab',
          caption: 'The BluGate card and Custom endpoints card on the Platforms tab.',
          height: 900,
          markers: [
            { n: 1, target: { text: 'BluGate client key' }, label: 'BluGate client key', text: 'Your client code from BluGate.' },
            { n: 2, target: { text: 'API key' }, label: 'API key', text: 'Your BluGate API key.' },
            { n: 3, target: { text: ['Fetch again', 'Fetch'] }, label: 'Fetch', text: 'Loads your account, usage and platform access from BluGate.' },
            { n: 4, target: { text: 'Custom endpoints' }, label: 'Custom endpoints', text: 'Any other API you want to register by its URL.' },
            { n: 5, target: { text: 'Add endpoint' }, label: 'Add endpoint', text: 'Opens the form to save a new endpoint.' },
          ],
        },
        {
          type: 'p',
          text: 'After the first time, the fields say "Saved". Leave them empty and click **Fetch again** at the top of the card to refresh with the saved keys. To replace the keys, type new ones and click **Replace keys and fetch**.',
        },
        {
          type: 'p',
          text: 'After a fetch the card shows your BluGate account.',
        },
        {
          type: 'list',
          items: [
            'An account strip: name, environment and status, with the client code beneath.',
            'Pills for **System**, **Gateway** and **Database** health, and the BluGate version.',
            'Usage tiles: **This month**, **Today**, **All time**, **Success rate**, **Avg latency** and **Platforms you can use**.',
            '**What changed**, comparing this fetch with the last one.',
          ],
        },
        {
          type: 'table',
          head: ['What changed', 'Meaning'],
          rows: [
            ['**New**', 'A platform that BluGate now lists and Blurasaga had not seen.'],
            ['**Access granted**', 'BluGate has newly given you access.'],
            ['**Access lost**', 'BluGate no longer grants access.'],
            ['**Removed**', 'BluGate no longer lists the platform.'],
          ],
        },
      ],
    },

    {
      id: 'platform-cards',
      group: 'Connect BluGate',
      icon: 'Globe2',
      blurb: 'Read a platform card, and stop or activate a platform.',
      title: 'Platform cards',
      blocks: [
        {
          type: 'p',
          text: 'Below the BluGate card, the **Platforms** card has one tile per platform. Each tile shows:',
        },
        {
          type: 'list',
          items: [
            'The platform name, with **Access granted**, **No access** or **Removed**, and a health indicator.',
            'Usage: **This month**, **Today** and **All time**, plus a bar for its share of this month’s requests.',
            'Its **Quota** (used against the monthly limit, or "No monthly limit") and its rate limits.',
            'The platform URL, with a copy button.',
            'A badge, **Active in this app** or **Stopped**, and a **Stop** or **Activate** button.',
          ],
        },
        {
          type: 'steps',
          title: 'Stop or activate a platform',
          items: [
            { text: 'Find the platform tile.' },
            { text: 'Click **Stop** to turn it off, or **Activate** to turn it back on.' },
          ],
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'Stopping keeps your data',
          text: 'A stopped platform is hidden from **Events**, **Alerts** and the dashboard, but nothing already collected is deleted. Activate it again and it returns.',
        },
      ],
    },

    {
      id: 'custom-endpoints',
      group: 'Other APIs',
      groupBlurb: 'Saving APIs that are not from BluGate',
      icon: 'Link2',
      blurb: 'Register any other API by its URL.',
      title: 'Custom endpoints',
      blocks: [
        {
          type: 'p',
          text: 'The **Custom endpoints** card lets an admin save any other API by its URL. It is a registry: Blurasaga keeps the details, and does not call the API for you.',
        },
        {
          type: 'steps',
          items: [
            { text: 'Click **Add endpoint**.' },
            { text: 'Fill in the form (below), then save.' },
          ],
        },
        {
          type: 'fields',
          items: [
            { name: 'Name', text: 'Required. A label, for example News API.' },
            { name: 'API URL', text: 'Required. The address of the API.' },
            { name: 'API key', text: 'Optional. Leave empty if none is needed.' },
            { name: 'Key header', text: 'The header that carries the key. Defaults to Authorization.' },
            { name: 'Key prefix', text: 'Text placed before the key, for example Bearer. Leave blank for none.' },
            { name: 'Notes', text: 'Optional. What the API is used for.' },
          ],
        },
        {
          type: 'p',
          text: 'Each endpoint has an on/off switch, an edit button and a delete button. When editing, leave **API key** blank to keep the current one.',
        },
        {
          type: 'callout',
          tone: 'warn',
          title: 'Keys are never shown again',
          text: 'Once saved, a key cannot be viewed. Keep your own copy. To change it, edit the endpoint and type a new one.',
        },
      ],
    },

    {
      id: 'billing',
      group: 'Usage and billing',
      groupBlurb: 'The BluGate page in the sidebar',
      icon: 'CreditCard',
      blurb: 'Your account, usage, quota and limits in one place.',
      title: 'BluGate Usage & Billing',
      blocks: [
        {
          type: 'p',
          text: 'Open **BluGate** in the sidebar to see the **BluGate Usage & Billing** page. Click **Refresh** to reload it; the time of the last update is shown beside the button.',
        },
        {
          type: 'live',
          route: '/blugate-billing',
          alt: 'BluGate Usage & Billing page',
          caption: 'Your BluGate account, usage and platform access on one page.',
          height: 700,
          markers: [
            { n: 1, target: { text: 'BluGate Usage & Billing' }, label: 'Page title', text: 'Your account, this month\'s usage and each platform\'s access.' },
            { n: 2, target: { text: 'Refresh' }, label: 'Refresh', text: 'Reloads the page from BluGate.' },
            { n: 3, target: { text: 'Billing period' }, label: 'Billing period', text: 'The month the usage figures cover.' },
            { n: 4, target: { text: 'Requests by platform' }, label: 'Requests by platform', text: 'How many requests each platform used this month.' },
          ],
        },
        {
          type: 'table',
          head: ['Section', 'What it shows'],
          rows: [
            ['Account', 'Name, status and the **System**, **Gateway** and **Database** pills.'],
            ['Tiles', '**Requests this month**, **Requests today**, **All time**, **Success rate**, **Avg latency**, **Platforms you can use**.'],
            ['**Billing period**', 'A progress bar for the day of the month, days left, and an estimate of total requests by month end. It is only an estimate, based on your pace so far.'],
            ['**Requests by platform**', 'This month’s requests, split by platform.'],
            ['**Platform access**', 'Which platforms BluGate has granted.'],
            ['**Usage, quota and limits by platform**', 'A table with **Today**, **This month**, **All time**, **Share**, **Monthly quota** and **Rate limits** for each platform.'],
          ],
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
            ['I cannot see Settings > Platforms', 'The Platforms tab is for admin accounts only.'],
            ['"Enter both keys"', 'For a first fetch you need both the client key and the API key.'],
            ['"Could not fetch from BluGate"', 'Check the keys are correct and that BluGate is up (see **Health > BluGate**), then try **Fetch again**.'],
            ['**Activate** is disabled', 'BluGate has not granted access to that platform. Ask BluGate, then fetch again.'],
            ['A platform vanished from Events and Alerts', 'It may be **Stopped**. Click **Activate** on its tile.'],
            ['The billing page says "BluGate not configured"', 'Connect BluGate first in **Settings > Platforms**.'],
            ['The billing page shows a connection error', 'Click **Retry**. If it persists, check **Health**.'],
          ],
        },
      ],
    },
  ],
};

export default platforms;
