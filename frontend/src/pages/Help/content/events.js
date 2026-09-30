/**
 * Help content — Events module.
 *
 * Structured data rather than JSX so it stays searchable, easy to edit, and can
 * be moved into MongoDB later without rewriting the renderer.
 *
 * Block types: p | steps | live | callout | table | list | fields
 */

const events = {
  id: 'events',
  title: 'Events',
  icon: 'CalendarDays',
  summary:
    'Track everything being said online about a single happening — a rally, festival, bandh, protest or VIP visit — in one place.',
  sections: [
    // ────────────────────────────────────────────────────────────────────
    {
      id: 'overview',
      icon: 'Compass',
      blurb: 'What an event is, when to use one, and a tour of the page.',
      group: 'Start here',
      groupBlurb: 'What an event is and how to set one up',
      title: 'What an Event is',
      blocks: [
        {
          type: 'p',
          text:
            'An Event is a container for “everything being said about this one thing”. You give it a name, dates, platforms and a set of keywords. Blurasaga then searches those platforms for the keywords and collects every matching post into that event’s own feed.',
        },
        {
          type: 'p',
          text:
            'Use an event when you need a temporary, focused watch on a specific happening. For monitoring a person or page continuously, add them under Settings → Profiles instead.',
        },
        {
          type: 'live',
          route: "/events",
          alt: "The Events page",
          caption: "The Events page as it opens.",
          markers: [
            { n: 1, target: {"text": "live"}, label: "Live / stopped / total", text: "Click any of these three to filter the list by that status. “Live” is the number currently being monitored." },
            { n: 2, target: {"text": "Recurring"}, label: "Recurring and One-time calendars", text: "Open the Recurring and One-time Occasion Calendars." },
            { n: 3, target: {"text": "New Event"}, label: "New Event", text: "Creates an event directly." },
            { n: 4, target: {"placeholder": "Search events"}, label: "Search events", text: "Search the events for the selected period." },
            { n: 5, target: {"text": "Festivals"}, label: "List filters", text: "Filter the list by All, Festivals and One-time. Click an event to open it." },
          ],
        },
        {
          type: 'table',
          head: ['Control', 'What it does'],
          rows: [
            ['**Recurring**', 'Opens **Occasion Calendar · Recurring** — yearly occasions such as festivals and national days.'],
            ['**One-time**', 'Opens **Occasion Calendar · One-time** — occasions for a specific incident or situation.'],
            ['**New Event**', 'Creates an event directly.'],
            ['**Festivals / One-time** (list filter)', 'Shows only events that came from the Recurring calendar, or from one-time occasions and New Event.'],
          ],
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'create',
      icon: 'PlusCircle',
      blurb: 'Every field on the form, and what good input looks like.',
      group: 'Start here',
      title: 'Creating an event',
      blocks: [
        {
          type: 'steps',
          items: [
            { text: 'Click **New Event** in the top-right of the Events page.' },
            { text: 'Enter the **Event Name**. Required.' },
            { text: 'Optionally enter the **Location** — for example `Station Road`. It is shown against the event in the list.' },
            { text: 'Set the **Start Date** and **End Date**. The end date must be on or after the start date, or the form is rejected.' },
            { text: 'Choose the **Monitoring interval** — every 5 minutes, 15 minutes, 30 minutes, 1 hour or 6 hours, or **Custom** (1 to 10080 minutes). The form shows roughly how many fetches per day that means.' },
            { text: 'Tick the **Platforms** to search. At least one is required.' },
            { text: 'Enter your **Keywords** in the one keyword box, separated by commas. See the next section.' },
            { text: 'Click the create button at the bottom of the form. The event is saved as **Stopped**.' },
            { text: 'Open the event and click **Start** when you want monitoring to begin.', note: 'The first fetch runs in the background as soon as you start it.' },
          ],
        },
        {
          type: 'table',
          head: ['Platform', 'Notes'],
          rows: [
            ['**X, YouTube, Facebook, Instagram, Telegram, Reddit**', 'These can be chosen for an event. Only the platforms your administrator has enabled are shown in the form.'],
          ],
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'A new event does not collect until you Start it',
          text:
            'New events are created **Stopped**. Nothing is collected until you open the event and click **Start**.',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'keywords',
      icon: 'Hash',
      blurb: 'How to enter them and what to avoid.',
      group: 'Start here',
      title: 'Keywords',
      blocks: [
        {
          type: 'p',
          text:
            'Keywords are what Blurasaga searches for. If an event returns nothing, the keywords are almost always why.',
        },
        {
          type: 'steps',
          items: [
            { text: 'Type your keywords into the single **Keywords** box, **separated by commas**. Any language or script works.' },
            { text: 'Include every language the conversation happens in, in the same box.' },
            { text: 'Use hashtags where people use them.' },
          ],
        },
        {
          type: 'callout',
          tone: 'tip',
          title: 'Example',
          text: '`Independence Day rally, Independence Day parade, #IndependenceDayRally, Station Road`',
        },
        {
          type: 'list',
          items: [
            'Each keyword is a **separate search** — 30 keywords costs roughly 30 times the API calls of one.',
            'Do **not** put quotes around keywords.',
            'Spaces and trailing commas are trimmed automatically.',
            'Editing keywords later applies from the next fetch; posts already collected stay.',
          ],
        },
        {
          type: 'table',
          head: ['Too broad', 'Use instead'],
          rows: [
            ['`protest`', '`#StationRoadProtest`, `Station Road protest`'],
            ['`meeting`', '`Traders association general meeting`, `#TradersMeeting`'],
            ['`rally`', '`Independence Day rally`, `#IndependenceDayRally`'],
          ],
        },
        {
          type: 'callout',
          tone: 'warn',
          title: 'A generic word will flood the event',
          text:
            'One-word keywords like “meeting” or “rally” pull in thousands of unrelated posts and burn your API quota. Always pair them with a place, organisation, person or dedicated hashtag.',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'occasion-calendar',
      icon: 'CalendarDays',
      blurb: 'Recurring and one-time occasion templates that appear in the Events list.',
      group: 'Start here',
      title: 'Occasion Calendar',
      blocks: [
        {
          type: 'p',
          text:
            'The **Recurring** and **One-time** buttons in the header open the Occasion Calendar. **Recurring** holds yearly occasions (festivals, national days) whose date repeats every year. **One-time** holds an occasion for a specific incident or situation.',
        },
        {
          type: 'steps',
          items: [
            { text: 'Click **Recurring** or **One-time** in the header. Use **Search occasions…** to find one already saved.' },
            { text: 'Click the add button and enter the **Occasion name** (for example `Republic Day`).' },
            { text: 'Set **When it happens** — a day and month for recurring, a full date for one-time.' },
            { text: 'Optionally set the **Watch window** (**From** and **Until**), the **Platforms**, **Suggested keywords** and **Notes**.' },
            { text: 'Save. The occasion also appears in the Events list as a **Stopped** event.' },
            { text: 'Open that event and click **Start** when you want to monitor it.' },
          ],
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'Editing an occasion updates its event',
          text:
            'Saving changes to an occasion also updates the linked event in the Events list. Use the pencil and bin icons on a row to edit or delete an occasion.',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'status',
      icon: 'PlayCircle',
      blurb: 'Starting and stopping, and the controls on the event header.',
      group: 'Running an event',
      groupBlurb: 'Day-to-day operation',
      title: 'Starting and stopping',
      blocks: [
        {
          type: 'steps',
          title: 'Recommended routine',
          items: [
            { text: 'Open the event and click **Start**. The badge shows **Live**.' },
            { text: 'Click **Fetch Now** to check straight away and confirm content is arriving.' },
            { text: 'When the event finishes on the ground, click **Stop**. The badge shows **Stopped**.' },
            { text: 'Review the collected content, then export anything you need.' },
          ],
        },
        {
          type: 'fields',
          items: [
            { name: 'Start / Stop', text: 'Turns monitoring on or off for this event. Start is green, Stop is red.' },
            { name: 'Fetch Now', text: 'Fetches once immediately.' },
            { name: 'History', text: 'Lists past fetch runs (Running, Stopped, Failed or OK) and lifetime fetch stats: API hits, items returned, new items and run time.' },
            { name: 'Analyses', text: 'Opens keyword analysis. See “Keyword analysis”.' },
            { name: 'Event Summary / View Report', text: 'Opens the AI summary. Reads **View Report** once one has been generated. See “Event summary”.' },
          ],
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'editing',
      icon: 'Pencil',
      blurb: 'Changing an event after it is running, and what deleting removes.',
      group: 'Running an event',
      title: 'Editing and deleting',
      blocks: [
        {
          type: 'steps',
          items: [
            { text: 'Open the event and click the **pencil** icon.' },
            { text: 'Change the name, location, dates, monitoring interval, platforms or keywords.' },
            { text: 'Save. New keywords apply from the next fetch onward.' },
          ],
        },
        {
          type: 'callout',
          tone: 'warn',
          title: 'Editing keywords does not remove old content',
          text:
            'Posts already collected under the previous keywords stay in the feed. Narrowing the keywords stops new mismatches but does not clean up what is already there.',
        },
        {
          type: 'callout',
          tone: 'danger',
          title: 'Deleting is permanent',
          text:
            'The bin icon opens **Delete Event**. Export anything you need first — there is no undo.',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'reading-content',
      icon: 'Eye',
      blurb: 'Priority alerts, detected content and the platform filter.',
      group: 'Running an event',
      title: 'Reading what was collected',
      blocks: [
        {
          type: 'p',
          text:
            'Below the header, the counters show **Content**, **Priority**, **Recent** (last 24 hours) and **Platforms** for the open event. A platform dropdown narrows the view to one platform.',
        },
        {
          type: 'list',
          items: [
            '**Priority Alerts** are listed first, with the reason each was flagged and a **View** link to the original post.',
            '**Detected Content** lists every collected post. It loads more as you scroll.',
            'If nothing has arrived, the page reads “No content detected yet”.',
          ],
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'keyword-analysis',
      icon: 'TrendingUp',
      blurb: 'Which keywords are driving the conversation.',
      group: 'Analysing an event',
      groupBlurb: 'Keyword analysis, the AI summary and reports',
      title: 'Keyword analysis',
      blocks: [
        {
          type: 'p',
          text:
            'Click **Analyses** on the event header to open **Keyword Intelligence & Analytics**. The top shows totals: monitored keywords, unique matched posts, total keyword mentions, sentiment breakdown and total engagement.',
        },
        {
          type: 'table',
          head: ['Tab', 'Shows'],
          rows: [
            ['**All Keywords Overview**', 'Mentions Volume by Keyword, Share of Voice, Sentiment Breakdown by Keyword, Mentions Timeline Trend, and the Keyword Performance Matrix table.'],
            ['**Individual Keyword Deep Dive**', 'One keyword in detail: mentions volume, net sentiment score, engagement, risk status, timeline, platforms distribution, top accounts discussing it, and its posts (searchable).'],
          ],
        },
        {
          type: 'steps',
          items: [
            { text: 'Read the **Keyword Performance Matrix** to see posts, share, sentiment, dominant platform, engagement and risk alerts for each keyword.' },
            { text: 'Click **Deep Dive** on a row to open that keyword.' },
            { text: 'Use the **Export Executive PDF Report** button at the top to save the analysis as a PDF.' },
          ],
        },
        {
          type: 'callout',
          tone: 'tip',
          title: 'Use it to prune keywords',
          text:
            'A keyword with a huge share but no relevant posts is too broad. Edit the event and replace it with something more specific.',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'event-summary',
      icon: 'Sparkles',
      blurb: 'An AI-written briefing for the event.',
      group: 'Analysing an event',
      title: 'Event summary',
      blocks: [
        {
          type: 'p',
          text:
            'Click **Event Summary** on the event header to generate an AI briefing from the collected posts. Once a summary exists the button reads **View Report** and opens the saved one.',
        },
        {
          type: 'table',
          head: ['Tab', 'Shows'],
          rows: [
            ['**Event Summary**', 'The written briefing.'],
            ['**Risk & Advisory**', 'Risks identified and recommended actions.'],
            ['**Data Telemetry**', 'Counts and figures behind the summary, including keyword mentions.'],
            ['**All Posts**', 'Every post that was analysed, with a link to the original.'],
          ],
        },
        {
          type: 'fields',
          items: [
            { name: 'Regenerate', text: 'Re-analyses using the latest collected posts.' },
            { name: 'Copy', text: 'Copies the summary text to the clipboard.' },
            { name: 'Download PDF', text: 'Saves an executive PDF that includes every analysed post as an appendix.' },
          ],
        },
        {
          type: 'callout',
          tone: 'warn',
          title: 'Regenerate after new content arrives',
          text:
            'A saved summary is a snapshot. If the event has collected more posts since, click **Regenerate**. If a report says it is incomplete, regenerate it.',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'export',
      icon: 'Download',
      blurb: 'PDF and Excel, for one event or all of them.',
      group: 'Analysing an event',
      title: 'Exporting',
      blocks: [
        {
          type: 'p',
          text: 'The **Export** menu on the event header has two groups, each with **PDF** and **Excel**: **This event** and **All events**.',
        },
        {
          type: 'table',
          head: ['Export', 'Produces'],
          rows: [
            ['**This event · PDF**', 'An **Event Intelligence Report** opening in a new tab. Use its Print / Save as PDF button. Allow pop-ups if it does not open.'],
            ['**This event · Excel**', 'A spreadsheet of the event’s posts, one per row.'],
            ['**All events · PDF**', 'An **Events Report** listing every event with its dates, keywords and a **QR code** per row that opens the report.'],
            ['**All events · Excel**', 'The same list as a spreadsheet.'],
          ],
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'Events Report page',
          text:
            'A separate **Events Report** page shows the same calendar-and-manual event list by month, with search, **Refresh**, and **Export** to Excel or PDF. The QR opens the live Events page for that event.',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'checklist',
      icon: 'ListChecks',
      blurb: 'Confirm these before you start an event.',
      group: 'Reference',
      groupBlurb: 'Look these up when you need them',
      title: 'Checklist before you start an event',
      blocks: [
        {
          type: 'list',
          items: [
            'Keywords are **specific** — a hashtag, place, organisation or person, not a generic word.',
            'You have **searched the hashtag yourself** and confirmed people are actually posting it.',
            'Every platform the conversation happens on is ticked.',
            'Dates are correct and the monitoring interval suits the event.',
            'You clicked **Start**, then **Fetch Now**, and confirmed content is arriving.',
            'You have a plan to click **Stop** when the event finishes.',
          ],
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'troubleshooting',
      icon: 'LifeBuoy',
      blurb: 'Common problems and what to do about them.',
      group: 'Reference',
      title: 'Troubleshooting',
      blocks: [
        {
          type: 'table',
          head: ['Problem', 'Likely cause', 'Fix'],
          rows: [
            ['No content at all', 'The event is Stopped, or the keywords match nothing', 'Click Start; test the keyword on the platform itself; click Fetch Now'],
            ['A new event is not collecting', 'New events are created Stopped', 'Open it and click Start'],
            ['A platform is missing from the form', 'Your administrator has not enabled it', 'Ask an administrator to enable it'],
            ['Content from the wrong place', 'Keywords too generic', 'Add a place name, district or local hashtag'],
            ['No content from one platform', 'That platform returned nothing for those keywords, or its connection is failing', 'Try Fetch Now; check the keywords exist on that platform; report a persistent gap to your administrator'],
            ['Export PDF does not open', 'The browser blocked the pop-up', 'Allow pop-ups for Blurasaga and try again'],
            ['Event Summary looks out of date', 'It is a saved snapshot', 'Click Regenerate'],
          ],
        },
      ],
    },
  ],
};

export default events;
