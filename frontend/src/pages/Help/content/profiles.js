/**
 * Help content — Profiles & Monitors.
 * Block types: p | steps | list | table | fields | callout
 */

const profiles = {
  id: 'profiles',
  title: 'Profiles & Monitors',
  icon: 'Users',
  summary:
    'Add the accounts you want SOCEYE to watch, start or stop monitoring them, and read what they post.',
  sections: [
    {
      id: 'overview',
      group: 'Start here',
      groupBlurb: 'What a profile is and where to find the catalog',
      icon: 'Compass',
      title: 'What a profile is',
      blurb: 'One watched person, page or channel, possibly on several platforms.',
      blocks: [
        {
          type: 'p',
          text:
            'A profile is an account you want SOCEYE to follow. Once monitoring is started, SOCEYE fetches its new posts on a schedule and checks them against your keywords and policies to raise alerts.',
        },
        {
          type: 'p',
          text:
            'Open **Profile Catalog** at `/social-profiles`. It lists every watched account in one table. One profile can hold several platforms (for example a Facebook page and an X handle for the same organisation).',
        },
        {
          type: 'live',
          route: '/social-profiles',
          alt: "The Profile Catalog",
          caption: "The catalog lists every watched account.",
          height: 460,
          markers: [
            { n: 1, target: { text: "Start all services" }, label: "Start all services", text: "Start monitoring for every profile." },
            { n: 2, target: { text: "Stop all services" }, label: "Stop all services", text: "Stop monitoring for every profile." },
            { n: 3, target: { text: "Add profile" }, label: "Add profile", text: "Add a new account to watch." },
            { n: 4, target: { placeholder: "Search profiles" }, label: "Search", text: "Find a profile by name or handle." },
            { n: 5, target: { text: "Relevance" }, label: "Relevance", text: "Score from the alerts a profile produced." },
            { n: 6, target: { text: "Monitoring" }, label: "Monitoring", text: "Start or stop one profile." },
          ],
        },
        {
          type: 'table',
          head: ['Column', 'What it shows'],
          rows: [
            ['Profile', 'Name and handle. Click it to open the detail page.'],
            ['Relevance', 'Score out of 100. Click for the alert breakdown.'],
            ['Platform', 'The platform of this row.'],
            ['Details', 'Short detail text fetched from the platform.'],
            ['Poll', 'How often it is checked, for example Every 30m or Every 1h.'],
            ['Monitoring', 'Start / Stop button and a History popover.'],
            ['Actions', 'Edit and the delete (bin) button.'],
          ],
        },
      ],
    },
    {
      id: 'add-profile',
      group: 'Start here',
      icon: 'PlusCircle',
      title: 'Adding a profile',
      blurb: 'Fetch each platform, then save.',
      blocks: [
        {
          type: 'steps',
          items: [
            { text: 'Click **Add profile** at the top right of Profile Catalog.' },
            { text: 'Type a **Name**. Any label you will recognise.' },
            { text: 'Choose **Poll**: Every 5 minutes, 15 minutes, 30 minutes, 1 hour, 6 hours, or **Custom**.', note: 'A custom interval must be a whole number of at least 1 minute.' },
            { text: 'In the platform card, pick the **Platform**, then enter the account in the main field (a handle or URL, depending on the platform).' },
            { text: 'Click **Fetch**. SOCEYE looks the account up and shows its name and followers. The badge changes from **Needs fetch** to **Verified**.' },
            { text: 'To watch the same person on more platforms, add another platform card and repeat Fetch for each one.' },
            { text: 'Optionally add **Notes**, then click **Save**.' },
          ],
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'Save stays disabled until every platform is verified',
          text: 'The footer shows “Fetch all platforms to enable Save” while any card still says Needs fetch.',
        },
      ],
    },
    {
      id: 'edit-delete',
      group: 'Working with profiles',
      groupBlurb: 'Find, filter, edit and control monitoring',
      icon: 'Pencil',
      title: 'Editing and deleting',
      blocks: [
        {
          type: 'steps',
          items: [
            { text: 'Click **Edit** on the row.' },
            { text: 'Change the Name, Poll, platform account or Notes. Re-fetch if you changed the account.' },
            { text: 'Click **Save**.' },
          ],
        },
        {
          type: 'p',
          text:
            'A saved platform cannot be switched to another platform. Remove that account and add a new platform instead.',
        },
        {
          type: 'p',
          text:
            'To delete, click the red bin button on the row and confirm **Delete**. This removes the account and stops monitoring. Posts already stored may remain until cleaned up separately.',
        },
      ],
    },
    {
      id: 'find',
      group: 'Working with profiles',
      icon: 'Search',
      title: 'Searching and filtering',
      blocks: [
        {
          type: 'list',
          items: [
            'Platform tabs: **All** plus one tab per platform, each with a count.',
            '**Search profiles…** filters the table as you type.',
            'The status drop-down offers **All statuses**, **Active** and **Paused**.',
            'The counters at the top show total, active and paused profiles.',
          ],
        },
      ],
    },
    {
      id: 'monitoring',
      group: 'Working with profiles',
      icon: 'PlayCircle',
      title: 'Starting and stopping monitoring',
      blocks: [
        {
          type: 'steps',
          items: [
            { text: 'On a row, click **Start** to begin monitoring. The button turns into **Stop**.' },
            { text: 'Under the name you will see **Waiting** with a countdown to the next fetch, or **Fetching…** while a fetch runs.' },
            { text: 'Click **History** to see past sessions and a **Fetch stats** summary: API hits, posts stored, new posts, total run time and last fetched.' },
            { text: 'Click **Stop** to pause monitoring.' },
          ],
        },
        {
          type: 'p',
          text:
            'Use **Start all services** or **Stop all services** at the top to do this for every profile. If a platform tab is selected, it applies to that platform only.',
        },
        {
          type: 'table',
          head: ['Label', 'Meaning'],
          rows: [
            ['OK', 'A fetch run finished successfully.'],
            ['Failed', 'A fetch run failed. The error message is shown under it in History.'],
            ['Waiting', 'Monitoring is on and the next fetch is counting down.'],
            ['Fetching…', 'A fetch is running now.'],
          ],
        },
      ],
    },
    {
      id: 'relevance',
      group: 'Working with profiles',
      icon: 'Gauge',
      title: 'Relevance score',
      blocks: [
        {
          type: 'p',
          text:
            'Relevance is a score out of 100 based on recent alerts generated from the account. Click the score to see Recent Alerts split into High Risk, Medium Risk and Low Risk.',
        },
        {
          type: 'table',
          head: ['Score', 'Label'],
          rows: [
            ['80 and above', 'Highly relevant. Frequent or severe alerts.'],
            ['60 to 79', 'Moderately relevant. Some recent alerts.'],
            ['Below 60', 'Low relevance. Few or no recent alerts.'],
          ],
        },
        { type: 'p', text: 'A dash means no score is available yet.' },
      ],
    },
    {
      id: 'detail',
      group: 'Working with profiles',
      icon: 'UserSquare',
      title: 'The profile detail page',
      blurb: 'Click a profile name to open it.',
      blocks: [
        {
          type: 'p',
          text:
            'The detail page shows the account header with **Start monitoring** (or **Stop**) and **Refresh**, four figures, and the posts fetched so far.',
        },
        {
          type: 'fields',
          items: [
            { name: 'Posts', text: 'How many posts are stored, for this platform or for all linked accounts.' },
            { name: 'Alerts 30d', text: 'Keyword alerts in the last 30 days, with the number that were high risk.' },
            { name: 'Relevance', text: 'The same score as in the catalog.' },
            { name: 'Last fetch', text: 'When it was last fetched, and whether monitoring is active or paused.' },
            { name: 'Identity / Monitoring', text: 'Expandable details: Mode (Started or Stopped), Interval, Account (Active or Paused) and when the preview was fetched.' },
            { name: 'Fetched posts', text: 'The list of collected posts. If empty, start monitoring or wait for the next fetch.' },
          ],
        },
      ],
    },
    {
      id: 'monitors',
      group: 'Monitors',
      groupBlurb: 'Platform pages that show collected content',
      icon: 'Radio',
      title: 'Platform monitors',
      blurb: 'X, Facebook, Instagram, YouTube and the Content Feed.',
      blocks: [
        {
          type: 'p',
          text:
            'Monitors are pages that show the collected content for one platform. They are not a separate menu of their own. You reach them by clicking through from other places, such as an X handle or Instagram profile on an alert card, or a source on the Intelligence Dashboard.',
        },
        {
          type: 'table',
          head: ['Page', 'What you can do'],
          rows: [
            ['X monitor', 'Add Source (a handle with priority and category). Tabs: Tweets and Risk Analytics.'],
            ['Facebook monitor', 'Add Page (Single or Bulk Import), Scan Now, Export. Tabs: Posts and Risk Analytics.'],
            ['Instagram monitor', 'Add Source, Scan All Profiles. Open a profile for Posts, Stories and Risk Analytics.'],
            ['YouTube monitor', 'Channel content and analysis for monitored channels.'],
            ['Content Feed', 'Live content from all sources, with a platform filter and Refresh.'],
          ],
        },
        {
          type: 'callout',
          tone: 'tip',
          text: 'The X and Instagram Add Source form asks for a handle, a priority (High, Medium, Low), an optional display name and a category such as News, Government Body or Influencer.',
        },
      ],
    },
    {
      id: 'troubleshooting',
      group: 'Reference',
      groupBlurb: 'When something does not work',
      icon: 'LifeBuoy',
      title: 'Troubleshooting',
      blocks: [
        {
          type: 'table',
          head: ['Problem', 'What to do'],
          rows: [
            ['Save is greyed out', 'Click Fetch on every platform card until each shows Verified.'],
            ['“Fetch failed”', 'Check the handle or URL is correct and public, then try again.'],
            ['“Poll interval must be at least 1 minute”', 'Use a whole number of 1 or more in the Custom interval.'],
            ['No posts yet', 'Click Start. Posts appear after the next successful fetch. Open History to check for Failed runs.'],
            ['A run shows Failed', 'Open History and read the message under the run. Stop and Start again to retry.'],
            ['Relevance shows a dash', 'No alert data yet. It fills in once posts have been fetched and checked.'],
          ],
        },
      ],
    },
  ],
};

export default profiles;
