/**
 * Help content — Events module.
 *
 * Structured data rather than JSX so it stays searchable, easy to edit, and can
 * be moved into MongoDB later without rewriting the renderer.
 *
 * Block types: p | steps | shot | callout | table | list | fields
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
            'An Event is a container for “everything being said about this one thing”. You give it a name, dates and a set of keywords. SOCEYE then searches X, YouTube and Facebook for those keywords and collects every matching post into that event’s own feed.',
        },
        {
          type: 'p',
          text:
            'Use an event when you need a temporary, focused watch on a specific happening. For monitoring a person or page continuously, add them under Settings → Profiles instead.',
        },
        {
          type: 'shot',
          src: '/help/events/events_overview.png',
          alt: 'The Events page with an event selected',
          caption: 'The Events page. Click any numbered marker to see what that control does.',
          markers: [
            { n: 1, x: 17, y: 19, side: 'left', at: 12, label: 'Live / paused / total', text: 'Click any of these three to filter the list by that status. “Live” is the number currently collecting.' },
            { n: 2, x: 78, y: 18, side: 'top', at: 78, label: 'Header actions', text: 'HCP Recurring and Non-Recurring calendars, API Settings, and New Event.' },
            { n: 3, x: 10, y: 50, side: 'left', at: 45, label: 'Year and month navigator', text: 'Jump to a month. The number beside each month is how many events fall in it.' },
            { n: 4, x: 26, y: 62, side: 'left', at: 75, label: 'Event list', text: 'Events for the selected period, with their platforms, location and date range. Click one to open it.' },
            { n: 5, x: 62, y: 26, side: 'right', at: 14, label: 'Event header', text: 'Name, status badge, keywords and dates — plus edit, pause, delete, Fetch Now and Export.' },
            { n: 6, x: 83, y: 35, side: 'right', at: 38, label: 'Counters', text: 'CONTENT, PRIORITY, RECENT and PLATFORMS for the open event.' },
            { n: 7, x: 65, y: 68, side: 'right', at: 70, label: 'Detected content', text: 'Every post collected for this event.' },
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
            { text: 'Enter the **Event Name**. Required. It also doubles as a search term if you add no keywords at all.' },
            { text: 'Enter the **Location** — for example `Hyderabad`. Used as a last-resort search term, and shown against the event in the list.' },
            { text: 'Set the **Start Date** and **End Date**. The end date must be on or after the start date, or the form is rejected.' },
            { text: 'Leave **Scan Interval (per event)** on *Use global default* unless this event needs checking more often than the rest.' },
            { text: 'Enter your **Keywords** under each language tab — Telugu, Hindi and English. See the next section.' },
            { text: 'Click **Create Event**. It is saved as **Active** and starts collecting on the next scan.' },
          ],
        },
        {
          type: 'shot',
          src: '/help/events/events_new_form.png',
          alt: 'The Create New Event dialog',
          caption: 'The Create New Event form.',
          markers: [
            { n: 1, x: 26, y: 20, side: 'left', at: 12, label: 'Event Name', text: 'Required. Also used as a search term when no keywords are given.' },
            { n: 2, x: 73, y: 20, side: 'right', at: 12, label: 'Location', text: 'e.g. Hyderabad. Shown in the event list and used as a fallback search term.' },
            { n: 3, x: 26, y: 32, side: 'left', at: 32, label: 'Start Date', text: 'When the event begins.' },
            { n: 4, x: 73, y: 32, side: 'right', at: 32, label: 'End Date', text: 'Must be on or after the start date.' },
            { n: 5, x: 50, y: 44, side: 'left', at: 52, label: 'Scan Interval (per event)', text: 'Leave on “Use global default” unless this event needs checking more often than others.' },
            { n: 6, x: 20, y: 58, side: 'left', at: 74, label: 'Language tabs', text: 'Telugu, Hindi and English keywords are entered separately. Fill in every language the conversation happens in.' },
            { n: 7, x: 50, y: 74, side: 'right', at: 62, label: 'Keywords box', text: 'Separate each keyword with a comma, or put one per line.' },
            { n: 8, x: 85, y: 92, side: 'right', at: 90, label: 'Create Event', text: 'Saves the event as Active.' },
          ],
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'All three platforms are always searched',
          text:
            'There is no platform selector on this form. Every event searches X, YouTube and Facebook. You filter by platform afterwards, using the tabs on the event. Instagram is not supported for events — it has no keyword or hashtag search.',
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'A new event starts collecting immediately',
          text:
            'There is no “start” button. As soon as you click Create Event it is Active and will be picked up on the next scan.',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'keywords',
      icon: 'Hash',
      blurb: 'How to enter them, how matching works, and what to avoid.',
      group: 'Start here',
      title: 'Keywords',
      blocks: [
        {
          type: 'p',
          text:
            'Keywords are what SOCEYE searches for. If an event returns nothing, the keywords are almost always why.',
        },
        {
          type: 'steps',
          items: [
            { text: 'Pick a **language tab** — Telugu, Hindi or English. Keywords are saved per tab and do not carry across.' },
            { text: 'Type them **separated by commas**, or one per line. Both work, and you can mix them.' },
            { text: 'Repeat for every language the conversation happens in. For most Telangana events, all three.' },
          ],
        },
        {
          type: 'callout',
          tone: 'tip',
          title: 'Example — English tab',
          text: '`Ganesh Nimarjan, Ganesh immersion, #GaneshNimajjanam, Tank Bund, Khairatabad Ganesh`',
        },
        {
          type: 'list',
          title: 'Worth knowing',
          items: [
            'Matching ignores **case, spacing and punctuation** — “Telangana Fest” finds `#TelanganaFest` and `telanganafest`.',
            'Hashtags work as keywords. Do **not** use quotes — they are taken literally.',
            'Spaces and trailing commas are trimmed automatically.',
            'Each keyword is a **separate search** — 30 keywords costs roughly 30× the API calls of one.',
            'Leave keywords empty and it falls back to the event name, then the location. That rarely works.',
          ],
        },
        {
          type: 'table',
          head: ['Too broad', 'Use instead'],
          rows: [
            ['`protest`', '`#LalagudaProtest`, `Lalaguda railway workshop protest`'],
            ['`meeting`', '`TNGO state executive meeting`, `#TNGOMeeting`'],
            ['`bonalu`', '`Secunderabad Bonalu`, `#Bonalu2026`, `Ujjaini Mahankali`'],
          ],
        },
        {
          type: 'callout',
          tone: 'warn',
          title: 'A generic word will flood the event',
          text:
            'One-word keywords like “meeting” or “rally” pull in thousands of unrelated posts from across the country and burn your API quota. Always pair them with a place, organisation, person or dedicated hashtag.',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'status',
      icon: 'PauseCircle',
      blurb: 'When to pause, when to archive, and the controls on the event header.',
      group: 'Running an event',
      groupBlurb: 'Day-to-day operation',
      title: 'Pausing and archiving',
      blocks: [
        {
          type: 'steps',
          title: 'Recommended routine',
          items: [
            { text: 'When the event finishes on the ground, open it and click the **Pause** button.' },
            { text: 'Review the collected content and export anything needed for your report.' },
            { text: 'Set it to **Archived** once the matter is closed.' },
          ],
        },
        {
          type: 'shot',
          src: '/help/events/events_detail_header.png',
          alt: 'The header strip of an open event',
          caption: 'The header of an open event — everything you need to run it.',
          markers: [
            { n: 1, x: 37.5, y: 39, side: 'top', at: 14, label: 'Event name', text: 'The open event. Click a different one in the list to switch.' },
            { n: 2, x: 42.5, y: 39, side: 'top', at: 33, label: 'Status badge', text: 'Active, Paused or Archived.' },
            { n: 3, x: 53, y: 39, side: 'top', at: 52, label: 'Keyword chips', text: 'Every keyword this event searches for, across all three languages.' },
            { n: 4, x: 48, y: 48, side: 'bottom', at: 25, label: 'Location, dates and last scan', text: '“Last” is when this event was last checked — use it to confirm collection is running.' },
            { n: 5, x: 76, y: 42, side: 'bottom', at: 62, label: 'Edit · Pause · Delete', text: 'Pencil edits the event, the orange button pauses collection, the bin deletes it permanently.' },
            { n: 6, x: 85, y: 42, side: 'bottom', at: 82, label: 'Fetch Now', text: 'Scans straight away instead of waiting for the schedule.' },
            { n: 7, x: 94, y: 42, side: 'top', at: 92, label: 'Export', text: 'Download this event as PDF or Excel.' },
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
            { text: 'Change the name, location, dates, scan interval or keywords.' },
            { text: 'Save. New keywords apply from the next scan onward.' },
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
            'The bin icon removes the event. Export anything you need for a report first — there is no undo.',
        },
      ],
    },

    {
      id: 'export',
      icon: 'Download',
      blurb: 'Download an event as PDF or Excel.',
      group: 'Reference',
      groupBlurb: 'Look these up when you need them',
      title: 'Exporting',
      blocks: [
        {
          type: 'p',
          text: 'The **Export** button offers PDF and Excel, for the open event or for all events.',
        },
        {
          type: 'table',
          head: ['Format', 'Best for'],
          rows: [
            ['**PDF**', 'Attaching to a report or briefing — formatted and readable.'],
            ['**Excel**', 'Further analysis — sortable rows, one post per line.'],
          ],
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'hcp',
      icon: 'CalendarDays',
      blurb: 'The recurring and non-recurring planning calendars.',
      group: 'Reference',
      title: 'HCP Recurring and Non-Recurring',
      blocks: [
        {
          type: 'p',
          text:
            'These two buttons open the master calendar — a planning list of known recurring occasions (festivals, anniversaries) and one-off entries.',
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'The calendar does not create events by itself',
          text:
            'Automatic creation from the master calendar is switched off. The calendar is a planning aid: when a date approaches, create the event manually with New Event.',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'checklist',
      icon: 'ListChecks',
      blurb: 'Confirm these before you create an event.',
      group: 'Reference',
      title: 'Checklist before you create an event',
      blocks: [
        {
          type: 'list',
          items: [
            'Keywords are **specific** — a hashtag, place, organisation or person, not a generic word.',
            'You have **searched the hashtag yourself** and confirmed people are actually posting it.',
            'Keywords are entered under **every language tab** the conversation uses — Telugu, Hindi and English.',
            'Dates are correct.',
            'You have a plan to **pause it** when the event finishes.',
            'You clicked **Fetch Now** and confirmed content is arriving before relying on it.',
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
            ['No content at all', 'Event is Paused, or keywords match nothing', 'Set to Active; test the keyword on the platform itself; click Fetch Now'],
            ['Content from the wrong city', 'Keywords too generic', 'Add “Hyderabad”, a district, or a local hashtag'],
            ['No Facebook content', 'Facebook returned nothing for those keywords, or the Facebook API is failing', 'Try Fetch Now; check the keywords exist on Facebook; report a persistent gap to your administrator'],
            ['Very old posts appearing', 'Search widened when few recent results exist', 'Use more specific keywords; check the post date on each card'],
          ],
        },
      ],
    },
  ],
};

export default events;
