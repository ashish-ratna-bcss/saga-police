/**
 * Help content — Global Search module.
 *
 * Block types: p | steps | shot | callout | table | list | fields
 */

const globalsearch = {
  id: 'global-search',
  title: 'Global Search',
  icon: 'Globe',
  summary:
    'One query run across X, YouTube, Facebook and Instagram at once — to find an account or a post anywhere, pull it into monitoring, and keep a record of what you searched.',
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
            'Global Search asks the live platforms a question, rather than searching what SOCEYE has already collected. Use it to check whether a handle exists, find the real account behind a name, or see who is posting about a keyword right now — including accounts nobody is monitoring yet.',
        },
        {
          type: 'p',
          text:
            'Open it from **Analysis Tools** in the sidebar and click the **Global Search** card.',
        },
        {
          type: 'shot',
          src: '/help/globalsearch/gs_overview.png',
          alt: 'The Global Search screen with results',
          caption: 'Global Search after a Profiles search on X. Names, handles and pictures are blurred throughout this guide.',
          markers: [
            { n: 1, x: 10.2, y: 15.4, side: 'left', at: 16, label: 'Platform', text: 'One platform, or All Platforms to query them together.' },
            { n: 2, x: 22.3, y: 15.4, side: 'top', at: 24, label: 'Profiles / Content', text: 'Profiles finds accounts; Content finds individual posts.' },
            { n: 3, x: 87.3, y: 8.1, side: 'top', at: 84, label: 'History, PDF, Excel', text: 'PDF and Excel appear once a search has returned something. History opens your saved searches.' },
            { n: 4, x: 15.6, y: 26.6, side: 'left', at: 30, label: 'A result', text: 'Picture, name and handle, with a blue tick where the platform verifies the account.' },
            { n: 5, x: 10.4, y: 37.4, side: 'left', at: 44, label: 'Follower count', text: 'Labelled to suit the platform — subscribers on YouTube, followers elsewhere.' },
            { n: 6, x: 22.5, y: 37.5, side: 'bottom', at: 24, label: 'Monitor', text: 'Adds the account to monitoring. The arrow beside it opens the real account in a new tab.' },
          ],
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'This is a live lookup, not your collected data',
          text:
            'Results come from the platforms themselves at the moment you search. Nothing here is stored as monitored content, and an account appearing in results does not mean SOCEYE is watching it — use **Monitor** on the card if you want that.',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'search-types',
      group: 'Start here',
      icon: 'ToggleLeft',
      blurb: 'Profiles or Content, and which platforms support each.',
      title: 'Profiles and Content',
      blocks: [
        {
          type: 'p',
          text:
            'The toggle beside the platform dropdown chooses between the two. **Profiles** finds accounts by name or handle; **Content** finds individual posts by keyword. The choice also changes which platforms are offered and how many results you can ask for.',
        },
        {
          type: 'table',
          head: ['Platform', 'Profiles', 'Content', 'Follower figure shown as'],
          rows: [
            ['**X (Twitter)**', 'Yes', 'Yes', 'followers'],
            ['**YouTube**', 'Yes', 'Yes', 'subscribers'],
            ['**Facebook**', 'Yes', 'Yes', 'followers'],
            ['**Instagram**', 'Yes', '—', 'followers'],
          ],
        },
        {
          type: 'callout',
          tone: 'warn',
          title: 'Switching to Content resets Instagram',
          text:
            'Because Instagram has no content search, selecting **Content** while Instagram is chosen silently moves the platform back to **All Platforms**. If you were expecting an Instagram-only search, check the dropdown before you press Search.',
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'Profiles searches always return up to 20',
          text:
            'The **Last 20 / 40 / 60 / 80 / 100** selector only appears for Content searches, and only applies to them. A Profiles search is fixed at 20 results per platform however you set it — so an all-platform Profiles search returns at most 100 in total, twenty from each.',
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
            { text: 'Choose the **platform** — a single one, or **All Platforms**.' },
            { text: 'Choose **Profiles** or **Content**.' },
            { text: 'For Content, optionally change the **Last N** result count.' },
            { text: 'Type the query and press **Search**, or hit Enter.' },
          ],
        },
        {
          type: 'p',
          text:
            'With **All Platforms** selected, SOCEYE asks every supported platform at the same time rather than one after another. A thin progress bar under the search box fills as each platform reports back, and results appear together when they are all done, newest first.',
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
            'The count above the grid tells you how many results are showing. When you searched All Platforms and more than one returned something, filter pills appear beside it — **All (n)** plus one per platform with its own count. These narrow what is displayed without searching again.',
        },
        {
          type: 'table',
          head: ['On a profile card', 'What it is'],
          rows: [
            ['Picture and name', 'The account as it appears on the platform. A blue tick means the platform verifies it.'],
            ['Handle', 'The account identifier. Your search terms are highlighted wherever they match.'],
            ['Description', 'The account bio, where the platform provides one.'],
            ['Follower count', 'Labelled to suit the platform — subscribers on YouTube, followers elsewhere.'],
            ['**Arrow icon**', 'Opens the real account in a new tab.'],
            ['**Monitor**', 'Adds the account to monitoring — see the next section.'],
          ],
        },
        {
          type: 'p',
          text:
            'Content cards show the post text with your search terms highlighted, the author, when it was posted, and its engagement figures. Long posts are clipped with a control to expand them, and each card links out to the original post.',
        },
        {
          type: 'shot',
          src: '/help/globalsearch/gs_content_results.png',
          alt: 'Content search results in Global Search',
          caption: 'A Content search, with the platform list open. Cards are laid out in columns rather than a fixed grid.',
          markers: [
            { n: 1, x: 25.4, y: 15.3, side: 'top', at: 22, label: 'Content selected', text: 'Searches the text of posts instead of account names.' },
            { n: 2, x: 32.8, y: 15.3, side: 'top', at: 40, label: 'Last 20', text: 'How many results per platform — 20 to 100. This selector only exists in Content mode.' },
            { n: 3, x: 9.5, y: 35, side: 'left', at: 38, label: 'No Instagram here', text: 'The platform list in Content mode offers All, X, YouTube and Facebook only — Instagram has no content search.' },
            { n: 4, x: 50.8, y: 39.1, side: 'top', at: 56, label: 'A post', text: 'The post text with your search terms highlighted, its author, and how long ago it was posted.' },
            { n: 5, x: 7.4, y: 86.1, side: 'bottom', at: 12, label: 'Read more', text: 'Longer posts are clipped — expand them in place, or use View to open the original.' },
          ],
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
            'The **Monitor** button on a result opens the same profile form used in Settings, already filled in with the platform, handle, display name and follower count from the result. This is the quickest route from finding an account to watching it.',
        },
        {
          type: 'shot',
          src: '/help/globalsearch/gs_monitor.png',
          alt: 'The profile form opened from a search result',
          caption: 'Clicking Monitor opens the profile form with the account already filled in.',
          markers: [
            { n: 1, x: 11, y: 3, side: 'top', at: 14, label: 'Says “Edit Profile”', text: 'Misleading — you are creating a new monitored profile, not editing one.' },
            { n: 2, x: 28.9, y: 49, side: 'left', at: 48, label: 'Handle', text: 'Carried across from the search result.' },
            { n: 3, x: 72.5, y: 49, side: 'right', at: 44, label: 'Display Name', text: 'Also carried across. Check both before saving.' },
            { n: 4, x: 72.5, y: 58.6, side: 'right', at: 64, label: 'Category', text: 'Always arrives as Others. Change it here — it decides how often the account is checked.' },
            { n: 5, x: 75.4, y: 96.9, side: 'bottom', at: 74, label: 'Update Source', text: 'Saves it. Despite the wording, this creates the monitored profile.' },
          ],
        },
        {
          type: 'callout',
          tone: 'warn',
          title: 'The form says “Edit Profile” even for a brand-new account',
          text:
            'Because the account details are handed to the form before it opens, it always shows the editing labels — the title reads **Edit Profile**, the description says “Update POI profile…”, and the button reads **Update Source**. You are still creating a new monitored profile. Ignore the wording; the confirmation afterwards correctly says **Started monitoring**.',
        },
        {
          type: 'steps',
          items: [
            { text: 'Click **Monitor** on the result card.' },
            { text: 'Check the handle and display name that have been carried across.' },
            { text: 'Set the **Category** — it arrives as **Others**, and the category decides how often the account is checked.' },
            { text: 'Fill in any person details you have, then click **Update Source**.' },
          ],
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
            'Once a search has returned something, **PDF** and **Excel** buttons appear at the top right. Both include a header recording the query, platform, search type and the time of export.',
        },
        {
          type: 'table',
          head: ['Format', 'Contains'],
          rows: [
            ['**PDF**', 'A landscape table. For profiles: number, platform, name, handle, followers and link. For content: number, platform, author, date, likes, comments and link. Every link is clickable in the finished PDF.'],
            ['**Excel**', 'Two sheets. **Results** holds a row per result — including the post text, trimmed to 300 characters, and view counts for content searches. **Info** records the query, platform, type, result count and date.'],
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
            'Every search you run is saved automatically, with its results. Click **History** in the top right to browse them, grouped by date, newest first. The back arrow beside the title returns you to the search screen.',
        },
        {
          type: 'shot',
          src: '/help/globalsearch/gs_history.png',
          alt: 'The Global Search history view',
          caption: 'Search history, with the filter bar above the saved searches.',
          markers: [
            { n: 1, x: 3.7, y: 7.5, side: 'left', at: 10, label: 'Back to search', text: 'Returns to the search screen.' },
            { n: 2, x: 20.5, y: 26.5, side: 'left', at: 30, label: 'Search text', text: 'Matches the query you originally typed.' },
            { n: 3, x: 62.4, y: 26.5, side: 'top', at: 62, label: 'Type, platform, dates', text: 'Narrow by Profiles or Content, by platform, and to a date range.' },
            { n: 4, x: 7, y: 37.7, side: 'left', at: 42, label: 'Grouped by date', text: 'Newest first, under a heading for each day.' },
            { n: 5, x: 16.9, y: 48.8, side: 'bottom', at: 20, label: 'What was searched', text: 'Type, platform and result count. Click the row to reopen the saved results.' },
            { n: 6, x: 91.6, y: 93.8, side: 'right', at: 92, label: 'Paging', text: 'Previous and Next when the history runs past one page.' },
          ],
        },
        {
          type: 'p',
          text:
            'Click a saved search to reopen its results exactly as they were. **PDF** and **Excel** are available there too, so an old search can be exported without running it again.',
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'History is yours alone',
          text:
            'You only ever see your own searches. Another officer looking at History on the same system sees theirs, not yours.',
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
            ['No Instagram option for my search', 'You are on **Content**. Instagram supports profile search only. Switch to **Profiles** to search Instagram.'],
            ['My platform choice reset to All Platforms', 'You had Instagram selected and switched to Content, which is not supported — so it fell back to All Platforms.'],
            ['Only 20 profile results came back', 'That is the fixed limit for Profiles searches. The **Last N** selector applies to Content searches only.'],
            ['My export is missing results', 'A platform filter pill is active — exports follow what is on screen. Click **All** and export again.'],
            ['**Search cancelled** appeared', 'A second search was started before the first finished. Only the newest search runs.'],
            ['A search is missing from History', 'The results saved separately from the search itself, and that save can fail quietly. Re-run the search if you need it recorded.'],
            ['I found an account but it is not being monitored', 'Searching does not start monitoring. Click **Monitor** on the card and complete the Add Profile form.'],
          ],
        },
      ],
    },
  ],
};

export default globalsearch;
