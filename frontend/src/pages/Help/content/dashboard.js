/**
 * Help content — Home (Dashboard) module.
 *
 * Block types: p | steps | live | callout | table | list | fields
 */

const dashboard = {
  id: 'dashboard',
  title: 'Home',
  icon: 'LayoutDashboard',
  summary:
    'The first page you see: how many alerts need attention, how many profiles and events are being watched, where posts are coming from, and shortcuts into the rest of Blurasaga.',
  sections: [
    // ══════════════════════════════════════════ START HERE
    {
      id: 'overview',
      group: 'Start here',
      groupBlurb: 'What the page shows and how to change it',
      icon: 'Compass',
      blurb: 'A tour of the page from top to bottom.',
      title: 'The Dashboard at a glance',
      blocks: [
        {
          type: 'p',
          text:
            'The page is titled **Dashboard** and carries a green **Live Operational** badge. If any critical alerts are open, a red badge beside it shows how many. Everything on the page follows the time range and platform you pick in the top right.',
        },
        {
          type: 'live',
          route: "/dashboard",
          alt: "The Dashboard",
          caption: "The Dashboard as it opens.",
          height: 700,
          markers: [
            { n: 1, target: {"text": "Live Operational"}, label: "Live Operational", text: "Shows the page is reading current data." },
            { n: 2, target: {"text": "Global Search"}, label: "Global Search and Analytics Hub", text: "Shortcuts into two of the main tools." },
            { n: 3, target: {"text": "24h"}, label: "Time range", text: "24h, 7d, 30d or All. Every figure on the page follows it." },
            { n: 4, target: {"label": "Refresh All Telemetry"}, label: "Refresh", text: "Reloads every figure." },
            { n: 5, target: {"text": "Threat Vector Radar"}, label: "KPI cards", text: "Five cards across the top. Each one opens the matching page." },
            { n: 6, target: {"text": "Telemetry Discovery Velocity"}, label: "Trend chart", text: "Posts collected over the chosen range." },
            { n: 7, target: {"text": "Platform Ingestion Share"}, label: "Platform Ingestion Share", text: "How the collected posts split across platforms." },
          ],
        },
        {
          type: 'table',
          head: ['Area', 'What it holds'],
          rows: [
            ['**Header controls**', 'Shortcuts to **Global Search** and **Analytics Hub**, the time-range chips, the platform selector and a refresh button.'],
            ['**KPI cards**', 'Five cards across the top. Each one opens the matching page.'],
            ['**Trend chart**', 'Discovery Velocity & Ingestion Trend — posts collected over the chosen range.'],
            ['**Platform Ingestion Share**', 'How the collected posts split across platforms.'],
            ['**Three strip cards**', 'Public Sentiment Index, Narrative Stance Assessment and Threat Risk Classification.'],
            ['**Lists**', 'Top Target Profiles Watchlist, Breaking Viral Social Vectors and Grievance Redressal Status.'],
            ['**Launchpad**', 'Tactical OSINT Launchpad — buttons into the main tools.'],
          ],
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'range-platform',
      group: 'Start here',
      icon: 'SlidersHorizontal',
      blurb: 'Choosing the time range and platform.',
      title: 'Time range and platform',
      blocks: [
        {
          type: 'steps',
          items: [
            { text: 'Click a time-range chip in the top right: **24h**, **7d**, **30d** or **All**.' },
            { text: 'Optionally click a platform in the selector next to it. **All** shows every platform; the others are shown as platform icons, and only platforms your administrator has enabled appear.' },
            { text: 'Click the refresh button (**Refresh All Telemetry**) to reload every figure.' },
          ],
        },
        {
          type: 'callout',
          tone: 'tip',
          title: 'Start with 24h',
          text:
            'Use **24h** for the daily check and **7d** or **30d** to see whether something is building. Sections such as the watchlist say which range they are showing.',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'kpis',
      group: 'Reading the page',
      groupBlurb: 'What each figure means',
      icon: 'Gauge',
      blurb: 'The five cards across the top.',
      title: 'KPI cards',
      blocks: [
        {
          type: 'p',
          text: 'Click any card to open the page it summarises.',
        },
        {
          type: 'table',
          head: ['Card', 'Number shown', 'Opens'],
          rows: [
            ['**Threat Vector Radar**', 'High / Critical open alerts. The line under it counts alerts still unacknowledged in the queue.', 'Alerts'],
            ['**Surveillance Fleet**', 'Profiles being actively monitored, out of the total target profiles.', 'Social Profiles'],
            ['**Monitored Events**', 'Events that are currently live, out of all events.', 'Events'],
            ['**Citizen Grievances**', 'Open grievances. The line under it counts those escalated to an intermediary.', 'Grievances'],
            ['**Captured Telemetry**', 'Posts collected in the chosen time range.', 'Content'],
          ],
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'charts',
      group: 'Reading the page',
      icon: 'BarChart3',
      blurb: 'The trend chart and the platform split.',
      title: 'Trend and platform share',
      blocks: [
        {
          type: 'fields',
          items: [
            { name: 'Ingestion trend', text: 'Posts collected per day across the range, with the **Peak** day and the **Avg/Day** shown. Hover the chart for a day’s figure. **Deep Analytics** opens the Analytics Hub.' },
            { name: 'Platform Ingestion Share', text: 'A bar per platform showing its share of collected posts and its count. The heading shows how many platforms are contributing; the top five are listed.' },
          ],
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'An empty chart',
          text:
            'If the trend shows “No Telemetry Recorded in Range”, nothing was collected in that range. Try a wider range or **All**.',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'diagnostics',
      group: 'Reading the page',
      icon: 'PieChart',
      blurb: 'Sentiment, stance and risk at a glance.',
      title: 'Sentiment, stance and threat risk',
      blocks: [
        {
          type: 'p',
          text: 'Three cards sit side by side, each drawn as a single coloured bar with counts underneath.',
        },
        {
          type: 'table',
          head: ['Card', 'Splits posts into'],
          rows: [
            ['**Public Sentiment Index**', 'Positive, Neutral / News and Negative.'],
            ['**Narrative Stance Assessment**', 'Favourable, Neutral and Unfavourable.'],
            ['**Threat Risk Classification**', 'Critical / High, Medium and Low. Shows an **Elevated** count for Critical plus High.'],
          ],
        },
        {
          type: 'p',
          text: 'Hover a segment of a bar to see its percentage.',
        },
        {
          type: 'callout',
          tone: 'tip',
          title: 'Go from the risk bar to the alerts',
          text:
            'A large Critical / High share is your cue to open **Alerts** through the Threat Vector Radar card and work the queue.',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'lists',
      group: 'Reading the page',
      icon: 'ListChecks',
      blurb: 'Who and what is standing out.',
      title: 'Watchlist, viral posts and grievance status',
      blocks: [
        {
          type: 'fields',
          items: [
            { name: 'Top Target Profiles Watchlist', text: 'The profiles with the highest engagement and threat activity in the chosen range. Each row has a **Dossier** link to that profile. **Full Catalog** opens Social Profiles.' },
            { name: 'Breaking Viral Social Vectors', text: 'High-virality public posts in the range. Use the open-original link on a post to see it on its platform.' },
            { name: 'Grievance Redressal Status', text: 'A summary of grievances by stage — Pending Initial Review, Under Active Investigation, Escalated to Intermediary and Successfully Resolved. A link opens the Grievances page.' },
          ],
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'launchpad',
      group: 'Reading the page',
      icon: 'Rocket',
      blurb: 'One-click shortcuts.',
      title: 'Tactical OSINT Launchpad',
      blocks: [
        {
          type: 'p',
          text:
            'The **Tactical OSINT Launchpad** card holds shortcut buttons, including **Global Search**, **POI Watchlist**, **Profile Catalog**, **Analytics Hub** and **Web Intel**. The **Event Probes** button opens Events.',
        },
      ],
    },

    // ══════════════════════════════════════════ REFERENCE
    {
      id: 'troubleshooting',
      group: 'Reference',
      groupBlurb: 'When the numbers look wrong',
      icon: 'LifeBuoy',
      blurb: 'Common problems and what to check.',
      title: 'Troubleshooting',
      blocks: [
        {
          type: 'table',
          head: ['Problem', 'What to check'],
          rows: [
            ['Numbers are lower than expected', 'A time range or platform is selected. Click **All** for both to see the complete figures.'],
            ['Figures look out of date', 'Click the refresh button at the top right to reload every figure.'],
            ['A platform is missing from the selector', 'Only platforms your administrator has enabled are shown.'],
            ['Trend chart is empty', 'Nothing was collected in that range. Try a wider range, and check that profiles are being monitored.'],
            ['A card does not open when clicked', 'Your account may not have access to that page. Ask an administrator to check your access.'],
          ],
        },
      ],
    },
  ],
};

export default dashboard;
