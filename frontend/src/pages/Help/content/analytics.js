/**
 * Help content — Analytics.
 * Block types: p | steps | list | table | fields | callout
 */

const analytics = {
  id: 'analytics',
  title: 'Analytics',
  icon: 'BarChart3',
  summary:
    'See public stance, sentiment and risk across everything Blurasaga monitors, then export it as PDF or Excel.',
  sections: [
    {
      id: 'overview',
      group: 'Start here',
      groupBlurb: 'The Analytics Hub and its controls',
      icon: 'Compass',
      title: 'The Analytics Hub',
      blurb: 'Charts and tables for public opinion and risk.',
      blocks: [
        {
          type: 'p',
          text:
            'Open **Analytics Hub** (`/analytics-hub`). It shows public opinion, stance, sentiment and risk across the channels you monitor. A **Live Telemetry** badge shows next to the title.',
        },
        {
          type: 'live',
          route: '/analytics-hub',
          alt: "The Analytics Hub",
          caption: "Filter at the top, switch views with the tabs.",
          markers: [
            { n: 1, target: { text: "PDF" }, label: "PDF", text: "Export the view as a PDF dossier." },
            { n: 2, target: { text: "Excel" }, label: "Excel", text: "Export the view to Excel." },
            { n: 3, target: { label: "Refresh telemetry" }, label: "Refresh", text: "Reload the data now." },
            { n: 4, target: { text: "Executive Overview" }, label: "Executive Overview", text: "The all-channel summary." },
            { n: 5, target: { text: "Events Intelligence" }, label: "Events Intelligence", text: "Stance and sentiment for events." },
            { n: 6, target: { text: "Threat Alerts & Risk" }, label: "Threat Alerts & Risk", text: "Alert severity and risk." },
            { n: 7, target: { text: "Target Profiles" }, label: "Target Profiles", text: "Analysis of watched profiles." },
          ],
        },
        {
          type: 'p',
          text: 'A colour guide banner explains the colours used in every chart.',
        },
        {
          type: 'table',
          head: ['Colour', 'Meaning'],
          rows: [
            ['Green', 'Positive or favourable. Support, praise, safe low risk.'],
            ['Sky blue', 'Neutral news. Factual reports and updates.'],
            ['Red', 'Negative or threat risk. Criticism, grievances, high-risk alerts.'],
            ['Amber', 'Medium severity. Elevated watch-list items.'],
          ],
        },
      ],
    },
    {
      id: 'toolbar',
      group: 'Start here',
      icon: 'SlidersHorizontal',
      title: 'Toolbar: filters, refresh and export',
      blocks: [
        {
          type: 'fields',
          items: [
            { name: 'Platform', text: '**All Platforms**, or one platform. Applies to every tab.' },
            { name: 'Time range', text: '**All Time**, **Last 24 Hours**, **Last 7 Days**, **Last 30 Days** or **Last 90 Days**.' },
            { name: 'Auto refresh', text: '**Auto Refresh: Off**, **Auto: 30s**, **Auto: 1m** or **Auto: 5m**. A green dot shows when it is on.' },
            { name: 'PDF / Excel', text: 'Download the current view as a PDF dossier or an Excel file.' },
            { name: 'Refresh button', text: 'The circular arrow reloads the data now.' },
          ],
        },
      ],
    },
    {
      id: 'tabs',
      group: 'Working with the tabs',
      groupBlurb: 'What each tab answers',
      icon: 'LayoutDashboard',
      title: 'The five tabs',
      blocks: [
        {
          type: 'table',
          head: ['Tab', 'Use it to see'],
          rows: [
            ['Executive Overview', 'Global Stance Index, Global Sentiment Valence and Global Threat Profile, plus discovery velocity and ingestion by platform.'],
            ['Events Intelligence', 'Stance, sentiment and risk for monitored events, a content discovery timeline, and an Individual Events Analytics Matrix.'],
            ['Threat Alerts & Risk', 'Threat Risk Breakdown, Alert Sentiment Valence, alert status counts, Threat Velocity Timeline and a High-Priority Threat Incident Feed.'],
            ['Citizen Grievances', 'Grievance inflow timeline, Grievance Classification and Official Grievance Reports Generated.'],
            ['Target Profiles', 'Profiles Stance Index, Target Persona Sentiment, content velocity and a ranking table of ingestion and threat per profile.'],
          ],
        },
      ],
    },
    {
      id: 'drill',
      group: 'Working with the tabs',
      icon: 'MousePointerClick',
      title: 'Drilling into a chart',
      blocks: [
        {
          type: 'steps',
          items: [
            { text: 'Hover over a stance, sentiment or risk card and use its **View … Breakdown** button (for example View Risk Breakdown).' },
            { text: 'On Threat Alerts & Risk, use the status buttons to see Active/New, Escalated, Acknowledged or Resolved/Reported alerts.' },
            { text: 'In the detail window, use the search box to filter profiles or search post text.' },
          ],
        },
      ],
    },
    {
      id: 'events-tab',
      group: 'Working with the tabs',
      icon: 'CalendarDays',
      title: 'Events Intelligence',
      blocks: [
        {
          type: 'steps',
          items: [
            { text: 'Open the **Events Intelligence** tab.' },
            { text: 'Use the event drop-down (default **All Monitored Events**) to focus on one event.' },
            { text: 'In the matrix, type in **Search event name…** to find an event.' },
            { text: 'Click **Keywords** on a row to open keyword analytics and graphs for that event.' },
          ],
        },
      ],
    },
    {
      id: 'profiles-tab',
      group: 'Working with the tabs',
      icon: 'Contact2',
      title: 'Target Profiles',
      blocks: [
        {
          type: 'p',
          text:
            'The ranking table lists each monitored profile with post volume, share of all tracked posts, alert counts and a three-level stance and sentiment. Use **Search profile or handle…** to find one.',
        },
      ],
    },
    {
      id: 'intelligence',
      group: 'Intelligence Dashboard',
      groupBlurb: 'Date-range dashboard for reports',
      icon: 'Gauge',
      title: 'Intelligence Dashboard',
      blurb: 'Titled Reports on screen. Route /intelligence-dashboard.',
      blocks: [
        {
          type: 'p',
          text:
            'This page counts and charts the reports Blurasaga has produced, for a date range you choose. It has four tabs.',
        },
        {
          type: 'live',
          route: '/intelligence-dashboard',
          alt: "The Intelligence Dashboard (titled Reports)",
          caption: "Pick a date range, then a tab.",
          height: 460,
          markers: [
            { n: 1, target: { text: "Apply" }, label: "Apply", text: "Apply the chosen dates." },
            { n: 2, target: { text: "Today" }, label: "Today", text: "Show only today." },
            { n: 3, target: { text: "Refresh" }, label: "Refresh", text: "Reload the numbers." },
            { n: 4, target: { text: "Alerts Reports" }, label: "Alerts Reports", text: "Report counts for alerts." },
            { n: 5, target: { text: "Grievances Reports" }, label: "Grievances Reports", text: "Report counts for grievances." },
            { n: 6, target: { text: "Events Report" }, label: "Events Report", text: "Report counts for events." },
          ],
        },
        {
          type: 'table',
          head: ['Tab', 'What it shows'],
          rows: [
            ['Alerts Reports', 'Generated formal notices. Filter by search, status (All Status, Sent to Intermediary, Closed), category and risk. Also an Escalations Overview.'],
            ['Grievances Reports', 'Grievance, Criticism and Suggestion reports. Filter by date and type (All Types, Grievance, Criticism, Suggestion). Includes Grievance Categories and Daily Tags Trend.'],
            ['Profiles Reports', 'Totals for profiles: Total Profiles, Added in Range, Active and Deleted Profiles, with Platform Coverage. Search by name, handle or category.'],
            ['Events Report', 'Report figures for events.'],
          ],
        },
        {
          type: 'steps',
          items: [
            { text: 'Pick a **from** and **to** date at the top, then click **Apply**.' },
            { text: 'Click **Today** for today only, or **Clear** to remove the range.' },
            { text: 'Click **Refresh** to reload. The time beside it shows when the data was generated.' },
            { text: 'Use **Export** on a chart to save it as an image, or the download icon on a KPI card to download its rows.' },
          ],
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
            ['Charts are empty', 'Widen the time range and set Platform to All Platforms.'],
            ['Numbers look out of date', 'Click the Refresh button, or turn on auto refresh.'],
            ['A yellow error bar appears on the Intelligence Dashboard', 'Click **Retry**.'],
            ['Excel button is missing', 'The Excel button is hidden on narrow screens. Widen the window.'],
          ],
        },
      ],
    },
  ],
};

export default analytics;
