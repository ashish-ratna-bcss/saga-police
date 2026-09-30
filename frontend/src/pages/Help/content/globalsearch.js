/**
 * Help content — Global Search module.
 *
 * Block types: p | steps | live | callout | table | list | fields
 */

const globalsearch = {
  id: 'global-search',
  title: 'Global Search',
  icon: 'Globe',
  summary:
    'One query run across your connected platforms at once — to find an account anywhere, pull it into monitoring, and keep a record of what you searched.',
  sections: [
    // ══════════════════════════════════════════ START HERE
    {
      id: 'overview',
      group: 'Start here',
      groupBlurb: 'What the tool is for and how to reach it',
      icon: 'Compass',
      blurb: 'Where to find it, and a tour of the screen.',
      title: 'The Global Search screen',
      blocks: [
        {
          type: 'p',
          text:
            'Global Search asks the live platforms a question, rather than searching what Blurasaga has already collected. Use it to check whether a handle exists, find the real account behind a name, or discover accounts nobody is monitoring yet. A green **Live Probe** badge in the title reminds you of this.',
        },
        {
          type: 'p',
          text:
            'Open it from **Search** in the sidebar.',
        },
        {
          type: 'live',
          route: "/global-search",
          alt: "The Global Search screen",
          caption: "Global Search as it opens, before any search.",
          markers: [
            { n: 1, target: {"text": "Saved History"}, label: "Saved History", text: "Opens your earlier searches. PDF Dossier and Excel Sheet appear here once a search returns something." },
            { n: 2, target: {"text": "Monitored Catalog"}, label: "Monitored Catalog", text: "How many targets you already monitor." },
            { n: 3, target: {"text": "Recent Inquiries"}, label: "Recent Inquiries", text: "Your latest live queries — click one to run it again." },
            { n: 4, target: {"text": "All Platforms"}, label: "Platform tabs", text: "All Platforms, or one connected platform. Only platforms your administrator has connected appear." },
            { n: 5, target: {"placeholder": "Enter suspect name"}, label: "Search box", text: "Type a name, handle, channel ID or organisation." },
            { n: 6, target: {"text": "Search Platforms"}, label: "Search Platforms", text: "Runs the live search." },
          ],
        },
        {
          type: 'p',
          text:
            'Above the search box are three summary cards: **Accounts & Channels** (the platforms searched), **Monitored Catalog** (how many targets you already monitor) and **Recent Inquiries** (your latest live queries — click one to run it again). The header also shows how many **platforms live** and **monitored**.',
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'This is a live lookup, not your collected data',
          text:
            'Results come from the platforms themselves at the moment you search. An account appearing in results does not mean Blurasaga is watching it — use **Monitor** on the card if you want that.',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'search-types',
      group: 'Start here',
      icon: 'ToggleLeft',
      blurb: 'Accounts and posts, and which platforms are searched.',
      title: 'Accounts and posts',
      blocks: [
        {
          type: 'p',
          text:
            'The search box finds **Accounts & Channels** — type a name, handle, channel ID or organisation. An accounts search returns up to 20 results per platform.',
        },
        {
          type: 'p',
          text:
            'The **Suggested Vectors** chips under the search box are ready-made searches; some of them search **posts** instead of accounts. Saved searches are tagged **Accounts** or **Posts** in your history, and posts results are shown as post cards with the text, author and engagement.',
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'Follower figures',
          text:
            'Follower counts are labelled to suit the platform — **subscribers** on YouTube, **followers** elsewhere.',
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'Which platforms appear',
          text:
            'Only platforms your administrator has connected show as tabs. If **Search Platforms** is greyed out, no platform is connected yet.',
        },
      ],
    },

    // ══════════════════════════════════════════ RUNNING A SEARCH
    {
      id: 'running',
      group: 'Running a search',
      groupBlurb: 'Querying the platforms and reading what comes back',
      icon: 'Search',
      blurb: 'How a search runs, and what happens when a platform fails.',
      title: 'Running a search',
      blocks: [
        {
          type: 'steps',
          items: [
            { text: 'Choose a platform tab — **All Platforms**, or a single one.' },
            { text: 'Type the query in the search box.' },
            { text: 'Click **Search Platforms**, or press Enter.' },
          ],
        },
        {
          type: 'p',
          text:
            'With **All Platforms** selected, Blurasaga asks every connected platform at the same time. While it works the button reads **Probing…**, a progress bar fills under the search box, and a chip per platform turns green as each one answers.',
        },
        {
          type: 'callout',
          tone: 'tip',
          title: 'One platform failing does not lose the rest',
          text:
            'Each platform is allowed 45 seconds and is handled independently. If one times out or errors, the others still return — and the failure is shown as an amber chip above the results naming the platform and the reason, such as **Timed out**. You get a partial answer rather than nothing.',
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'Searching again cancels the one in progress',
          text:
            'You will see **Search cancelled** — that is normal. If an all-platform search is consistently slow, one platform at a time is usually quicker.',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'results',
      group: 'Running a search',
      icon: 'LayoutGrid',
      blurb: 'Reading the cards and narrowing by platform.',
      title: 'Reading the results',
      blocks: [
        {
          type: 'p',
          text:
            'The heading above the grid, **Live Results for “your query”**, tells you how many matches are showing. When you searched All Platforms and more than one returned something, filter pills appear beside it — **All (n)** plus one per platform with its own count. These narrow what is displayed without searching again.',
        },
        {
          type: 'table',
          head: ['On a profile card', 'What it is'],
          rows: [
            ['Picture and name', 'The account as it appears on the platform. A blue tick means the platform verifies it.'],
            ['Handle', 'The account identifier. Your search terms are highlighted wherever they match.'],
            ['Description', 'The account bio, where the platform provides one.'],
            ['Follower count', 'Labelled to suit the platform — subscribers on YouTube, followers elsewhere.'],
            ['**Monitor**', 'Adds the account to monitoring — see the next section. Reads **Monitored** if it is already in your catalog.'],
          ],
        },
        {
          type: 'p',
          text:
            'Content cards show the post text with your search terms highlighted, the author, when it was posted, and its engagement figures. Long posts are clipped with **Read more** / **Show less**, and each card has a **View** link to the original post.',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'monitor',
      group: 'Running a search',
      icon: 'MonitorCheck',
      blurb: 'Turning a search result into a monitored profile.',
      title: 'Adding a result to monitoring',
      blocks: [
        {
          type: 'p',
          text:
            'The **Monitor** button on a result opens the same **Add profile** form used in Settings, already filled in with the platform, handle, display name and follower count from the result. This is the quickest route from finding an account to watching it.',
        },
        {
          type: 'steps',
          items: [
            { text: 'Click **Monitor** on the result card.' },
            { text: 'Check the handle and display name that have been carried across.' },
            { text: 'Set the **Category** and fill in any person details you have.' },
            { text: 'Save. The card then reads **Monitored**.' },
          ],
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'Already monitored',
          text:
            'If the account is already in your catalog the button reads **Monitored** and is disabled.',
        },
      ],
    },

    // ══════════════════════════════════════════ AFTER THE SEARCH
    {
      id: 'export',
      group: 'After the search',
      groupBlurb: 'Taking results away and finding them again',
      icon: 'Download',
      blurb: 'PDF and Excel, and what each one contains.',
      title: 'Exporting results',
      blocks: [
        {
          type: 'p',
          text:
            'Once a search has returned something, **PDF Dossier** and **Excel Sheet** buttons appear at the top right. Both record the query, platform, search type and the time of export.',
        },
        {
          type: 'table',
          head: ['Format', 'Contains'],
          rows: [
            ['**PDF Dossier**', 'A landscape table. For profiles: number, platform, name, handle, followers and link. For content: number, platform, author, date, likes, comments and link. Every link is clickable in the finished PDF.'],
            ['**Excel Sheet**', 'Two sheets. **Results** holds a row per result — including the post text, trimmed to 300 characters, and view counts for content searches. **Info** records the query, platform, type, result count and date.'],
          ],
        },
        {
          type: 'callout',
          tone: 'warn',
          title: 'The export follows your filter pill',
          text:
            'Exports contain what is currently displayed, not everything the search returned. With a platform pill selected, only that platform is exported. Click **All** first if you want the complete set.',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'history',
      group: 'After the search',
      icon: 'History',
      blurb: 'Every search is saved — how to find and reopen one.',
      title: 'Search history',
      blocks: [
        {
          type: 'p',
          text:
            'Every search you run is saved automatically, with its results. Click **Saved History** in the top right to open **Saved Searches**, grouped by date. The back arrow beside the title, or **Back to Search**, returns you to the search screen.',
        },
        {
          type: 'p',
          text:
            'Click a saved search to reopen its results as they were. **PDF Dossier** and **Excel** are available there too, so an old search can be exported without running it again.',
        },
        {
          type: 'callout',
          tone: 'tip',
          title: 'Saved results are a snapshot',
          text:
            'A reopened search shows what the platforms returned at the time. Follower counts, engagement figures and even the accounts themselves may have changed since. Run the search again if you need the current position.',
        },
      ],
    },

    // ══════════════════════════════════════════ REFERENCE
    {
      id: 'troubleshooting',
      group: 'Reference',
      groupBlurb: 'When a search does not behave',
      icon: 'LifeBuoy',
      blurb: 'Common problems and what to check.',
      title: 'Troubleshooting',
      blocks: [
        {
          type: 'table',
          head: ['Problem', 'What to check'],
          rows: [
            ['An amber chip says a platform timed out', 'That platform did not answer within 45 seconds. The other platforms still returned. Search that one on its own, or try again — it is usually the platform being slow, not a fault here.'],
            ['**Search Platforms** is greyed out', 'The search box is empty, a search is running, or no platform is connected. Ask an administrator to connect one.'],
            ['A platform tab is missing', 'Only platforms your administrator has connected are shown.'],
            ['My export is missing results', 'A platform filter pill is active — exports follow what is on screen. Click **All** and export again.'],
            ['**Search cancelled** appeared', 'A second search was started before the first finished. Only the newest search runs.'],
            ['I found an account but it is not being monitored', 'Searching does not start monitoring. Click **Monitor** on the card and complete the Add profile form.'],
            ['Monitor says it cannot identify the platform or handle', 'The result did not carry enough detail. Add the profile manually in Settings.'],
          ],
        },
      ],
    },
  ],
};

export default globalsearch;
