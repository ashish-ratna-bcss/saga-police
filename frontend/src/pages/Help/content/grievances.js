/**
 * Help content — Grievances module.
 *
 * Block types: p | steps | shot | callout | table | list | fields
 */

const grievances = {
  id: 'grievances',
  title: 'Grievances',
  icon: 'MessageSquare',
  summary:
    'Public complaints, suggestions and criticism tagged at monitored government accounts on X — triaged, communicated on, and tracked to a closed report with its own reference code.',
  sections: [
    // ══════════════════════════════════════════ START HERE
    {
      id: 'overview',
      group: 'Start here',
      groupBlurb: 'What a grievance is and a tour of the screen',
      icon: 'Compass',
      blurb: 'What a grievance is, and a tour of the page.',
      title: 'The Grievances screen',
      blocks: [
        {
          type: 'p',
          text:
            'A grievance starts life as an ordinary X post — a citizen tagging a government account with a complaint, a suggestion, or criticism. SOCEYE collects every post tagging your monitored government accounts into one feed, where an officer decides what it actually is and works it through to a close.',
        },
        {
          type: 'shot',
          src: '/help/grievances/grievances_overview.png',
          alt: 'The Grievances page',
          caption: 'The Grievances page. Names, handles and avatars are blurred in every screenshot in this guide.',
          markers: [
            { n: 1, x: 13, y: 20, side: 'left', at: 16, label: 'Platform tabs', text: 'All / X. Only X accounts can be monitored for grievances today.' },
            { n: 2, x: 91, y: 20, side: 'right', at: 16, label: 'Reports', text: 'Opens the three report tabs — Grievance Reports, Suggestions, Criticism. See “The Reports tab”.' },
            { n: 3, x: 22, y: 26, side: 'left', at: 26, label: 'Status filters', text: 'Total, Pending, Escalated, Closed, FIR, Criticism, Suggestion. Click one to filter the feed.' },
            { n: 4, x: 30, y: 47, side: 'left', at: 40, label: 'A grievance card', text: 'The tagged post, and — where the citizen kept posting — their full thread underneath it.' },
          ],
        },
        {
          type: 'table',
          head: ['Filter', 'Shows'],
          rows: [
            ['**Total**', 'Every tagged post collected so far.'],
            ['**Pending**', 'Classified as a Grievance, not yet escalated or closed.'],
            ['**Escalated**', 'A Grievance that has been escalated.'],
            ['**Closed**', 'A Grievance that has been closed.'],
            ['**FIR**', 'Grievances converted to an FIR.'],
            ['**Criticism / Suggestion**', 'Posts classified into those two categories instead.'],
          ],
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'add-source',
      group: 'Start here',
      icon: 'PlusCircle',
      blurb: 'Add the government accounts you want tagged posts collected for.',
      title: 'Adding a government account',
      blocks: [
        {
          type: 'p',
          text:
            'Nothing is collected until at least one government account is monitored. Add every official account whose mentions you need to track — a post only becomes a grievance card if it tags one of these.',
        },
        {
          type: 'steps',
          items: [
            { text: 'Open the account menu next to the platform tabs and choose **Add Government Account**.' },
            { text: 'Enter the **Twitter Handle** — without the @ symbol.' },
            { text: 'Optionally enter the **Department**, for your own reference.' },
            { text: 'Click **Add Source**.' },
          ],
        },
        {
          type: 'shot',
          src: '/help/grievances/grievances_add_source.png',
          alt: 'The Add Government Account dialog',
          caption: 'The Add Government Account dialog.',
          markers: [
            { n: 1, x: 50, y: 45, side: 'left', at: 40, label: 'Twitter Handle', text: 'Without the @ — just the username.' },
            { n: 2, x: 50, y: 65, side: 'right', at: 60, label: 'Department', text: 'Optional. Shown against the source for your own reference.' },
          ],
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'X only, for now',
          text:
            'The schema has room for Facebook and WhatsApp sources, but only X accounts can be added from this screen today.',
        },
      ],
    },

    // ══════════════════════════════════════════ THE G PATH
    {
      id: 'card-and-classify',
      group: 'Working a grievance',
      groupBlurb: 'One grievance, start to finish',
      icon: 'Hash',
      blurb: 'Reading a card, and the three ways to classify it.',
      title: 'Step 1 — Read the card, then classify it',
      blocks: [
        {
          type: 'shot',
          src: '/help/grievances/grievance_card.png',
          alt: 'A single grievance card',
          caption: 'One card. When the citizen posted a follow-up, their thread is shown underneath the tagged post.',
          markers: [
            { n: 1, x: 12, y: 5, side: 'top', at: 10, label: 'Poster', text: 'Who tagged the government account, and when.' },
            { n: 2, x: 70, y: 5, side: 'top', at: 65, label: 'Download · G · S · C', text: 'Download the media, or classify with one of the three buttons.' },
            { n: 3, x: 45, y: 24, side: 'left', at: 26, label: 'Thread', text: 'If the citizen followed up with more posts, they appear here in order.' },
            { n: 4, x: 90, y: 96, side: 'bottom', at: 80, label: 'Details', text: 'Opens the full post — every image, and the raw thread.' },
          ],
        },
        {
          type: 'p',
          text: 'Every card has three classification buttons. Pick the one that matches what the citizen is actually saying:',
        },
        {
          type: 'table',
          head: ['Button', 'Use for', 'Opens'],
          rows: [
            ['**G** — Grievance', 'A formal complaint that needs an answer.', 'The 4-step Grievance Report'],
            ['**S** — Suggestion', 'Feedback or an idea, not a complaint.', 'The 3-step Suggestion Report'],
            ['**C** — Criticism', 'Critical of the department, not asking for action.', 'The 3-step Criticism Report'],
          ],
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'Once classified, the card grows a code',
          text:
            'A coloured pill appears on the card showing its reference code — G-, S- or C- followed by a date-based number. Click it any time to reopen that report.',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'grievance-compose',
      group: 'Working a grievance',
      icon: 'Send',
      blurb: 'Step 1 of 4 — the auto-drafted message you check before sending.',
      title: 'Step 2 — Compose the Grievance Report',
      blocks: [
        {
          type: 'p',
          text:
            'Click **G** on a card and the Grievance Report opens on **1. Compose** — the first of four steps shown across the top of the window: Compose → Communicate → Log → Done.',
        },
        {
          type: 'shot',
          src: '/help/grievances/grievance_compose.png',
          alt: 'The Grievance Report — Compose step',
          caption: 'Step 1 — Compose. The message is a full WhatsApp-formatted draft, built from the post automatically.',
          markers: [
            { n: 1, x: 55, y: 4, side: 'top', at: 50, label: 'Step indicator', text: '1. Compose · 2. Communicate · 3. Log · 4. Done.' },
            { n: 2, x: 12, y: 15, side: 'left', at: 12, label: 'Category', text: 'Classify the complaint type — defaults to Others.' },
            { n: 3, x: 70, y: 15, side: 'top', at: 68, label: 'Complainant Mobile No', text: 'Add it if you have it. Left blank, the message reads “Complaint Phone Number: None”.' },
            { n: 4, x: 50, y: 55, side: 'left', at: 48, label: 'Message Preview', text: 'Fully editable. Posted-by, post link and content are filled in from the alert — check them before sending.' },
            { n: 5, x: 82, y: 95, side: 'bottom', at: 78, label: 'Proceed', text: 'Saves the draft and moves to Communicate.' },
          ],
        },
        {
          type: 'callout',
          tone: 'tip',
          title: 'Copy button',
          text:
            'Use Copy on the message preview if you want to paste it somewhere outside the built-in WhatsApp step — an email, or a different messaging tool.',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'grievance-communicate',
      group: 'Working a grievance',
      icon: 'MessageCircle',
      blurb: 'Step 2 of 4 — sharing the drafted message to a department contact.',
      title: 'Step 3 — Communicate',
      blocks: [
        {
          type: 'p',
          text:
            'Clicking **Proceed** assigns the report its reference code and moves to **2. Communicate** — "Share or Close Grievance". This is where the drafted message actually gets sent to the department that needs to act on it.',
        },
        {
          type: 'shot',
          src: '/help/grievances/grievance_communicate.png',
          alt: 'The Grievance Report — Communicate step, contact list',
          caption: 'Step 2 — a searchable directory of department contacts, each with a one-click WhatsApp share.',
          markers: [
            { n: 1, x: 30, y: 4, side: 'top', at: 24, label: 'Reference code', text: 'Assigned the moment you clicked Proceed. Quote this from now on.' },
            { n: 2, x: 50, y: 22, side: 'left', at: 20, label: 'Search contacts', text: 'Find the right department or station by name.' },
            { n: 3, x: 88, y: 30, side: 'right', at: 22, label: 'WhatsApp', text: 'Sends the composed message to that contact.' },
            { n: 4, x: 15, y: 97, side: 'bottom', at: 15, label: 'Back', text: 'Return to Compose to edit the message.' },
            { n: 5, x: 93, y: 97, side: 'bottom', at: 90, label: 'Next', text: 'Move on to Log once you have shared it.' },
          ],
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'Skip is there for a reason',
          text:
            'Not every grievance needs a department contacted — sometimes you are only logging it. Skip moves straight to the Log step without sending anything.',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'grievance-status',
      group: 'Working a grievance',
      icon: 'PauseCircle',
      blurb: 'Tracking it from the card — Pending, Escalated, Closed.',
      title: 'Step 4 — Track status from the card',
      blocks: [
        {
          type: 'p',
          text:
            'Once a card carries a G-code, its pill includes a status dropdown right on the card — you do not need to reopen the full report just to move a grievance along.',
        },
        {
          type: 'shot',
          src: '/help/grievances/grievance_status_change.png',
          alt: 'The inline status dropdown on a classified card',
          caption: 'The status dropdown, open. This card also shows the citizen\'s two-post thread above the tagged reply.',
          markers: [
            { n: 1, x: 25, y: 63, side: 'left', at: 55, label: 'Reference code', text: 'This grievance\'s G-code.' },
            { n: 2, x: 55, y: 68, side: 'right', at: 62, label: 'Status dropdown', text: 'Pending, Escalated or Closed — right on the card.' },
          ],
        },
        {
          type: 'table',
          head: ['Status', 'Meaning'],
          rows: [
            ['**Pending**', 'Set instantly — no extra steps.'],
            ['**Escalated**', 'Needs a follow-up before it is set — opens the report to that point.'],
            ['**Closed**', 'Also needs a follow-up before it is set — the matter is finished.'],
          ],
        },
        {
          type: 'callout',
          tone: 'warn',
          title: 'Escalated and Closed are not one click',
          text:
            'Picking either of these opens the Grievance Report rather than applying immediately — the system wants the Log step filled in first, so the reason is on record.',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'grievance-report-detail',
      group: 'Working a grievance',
      icon: 'FileText',
      blurb: 'The full report — QR code, PDF, post details and the whole thread.',
      title: 'The full Grievance Report',
      blocks: [
        {
          type: 'p',
          text:
            'Clicking a G-code — on the card, or in the Reports tab — opens the complete report: everything captured during Compose and Communicate, plus a QR code and a downloadable PDF.',
        },
        {
          type: 'shot',
          src: '/help/grievances/grievances_export.png',
          alt: 'The full Grievance Report with QR code and post details',
          caption: 'The full report. Scrolls down further into the complete tweet thread.',
          markers: [
            { n: 1, x: 17, y: 20, side: 'left', at: 15, label: 'Status', text: 'Pending, Escalated or Closed.' },
            { n: 2, x: 37, y: 20, side: 'top', at: 30, label: 'PDF QR', text: 'Scan to open the PDF on a phone.' },
            { n: 3, x: 78, y: 20, side: 'top', at: 75, label: 'Download PDF · Regenerate PDF', text: 'Download the current PDF, or rebuild it after editing the report.' },
            { n: 4, x: 35, y: 46, side: 'left', at: 44, label: 'Post Details', text: 'Platform, posted-by, date, post link, category, complainant phone, and who it was shared with.' },
            { n: 5, x: 30, y: 88, side: 'bottom', at: 80, label: 'Full Tweet Thread', text: 'Every post in the citizen\'s thread, in order, starting from Thread Start.' },
          ],
        },
      ],
    },

    // ══════════════════════════════════════════ S / C PATHS
    {
      id: 'suggestion-path',
      group: 'Suggestion and Criticism',
      groupBlurb: 'The two lighter paths — no escalation, no FIR',
      icon: 'Lightbulb',
      blurb: 'The 3-step flow for feedback that isn\'t a complaint.',
      title: 'Classifying a Suggestion',
      blocks: [
        {
          type: 'p',
          text:
            'Click **S** on a card for feedback or an idea rather than a complaint. The flow is the same shape as Grievance but shorter — three steps instead of four, because there is no separate status to escalate.',
        },
        {
          type: 'shot',
          src: '/help/grievances/suggestion_popup.png',
          alt: 'The Suggestion Report — Compose step',
          caption: 'The Suggestion Report. 1. Compose · 2. Share · 3. Done.',
          markers: [
            { n: 1, x: 60, y: 5, side: 'top', at: 55, label: 'Step indicator', text: 'Compose · Share · Done — no Log step, and no Escalated/Closed status.' },
            { n: 2, x: 12, y: 18, side: 'left', at: 15, label: 'Category', text: 'Same category list as Grievance.' },
            { n: 3, x: 50, y: 55, side: 'right', at: 45, label: 'Message Preview', text: 'The note under the label matters: text typed above “Suggestion Details” is saved as your remarks.' },
            { n: 4, x: 87, y: 95, side: 'bottom', at: 80, label: 'Submit & Continue', text: 'Assigns the S-code and moves to Share.' },
          ],
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'criticism-path',
      group: 'Suggestion and Criticism',
      icon: 'AlertCircle',
      blurb: 'The same 3-step flow, for posts that are critical rather than actionable.',
      title: 'Classifying a Criticism',
      blocks: [
        {
          type: 'p',
          text: 'Click **C** for a post that is critical of the department without asking for a specific action. The Criticism Report is structurally identical to Suggestion.',
        },
        {
          type: 'shot',
          src: '/help/grievances/criticism_popup.png',
          alt: 'The Criticism Report — Compose step',
          caption: 'The Criticism Report. Same 3-step shape as Suggestion.',
          markers: [
            { n: 1, x: 60, y: 5, side: 'top', at: 55, label: 'Step indicator', text: '1. Compose · 2. Share · 3. Done.' },
            { n: 2, x: 87, y: 95, side: 'bottom', at: 80, label: 'Submit & Continue', text: 'Assigns the C-code and moves to Share.' },
          ],
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'Criticism has no status dropdown on the card',
          text:
            'Unlike a Grievance, a Criticism pill just opens its report — there is no inline Pending/Escalated/Closed control, because Criticism has no escalation workflow.',
        },
      ],
    },

    // ══════════════════════════════════════════ REPORTS
    {
      id: 'reports-tab',
      group: 'Reports',
      groupBlurb: 'Every classified item, searchable and exportable',
      icon: 'BarChart3',
      blurb: 'The three report lists, and how to find one report fast.',
      title: 'The Reports tab',
      blocks: [
        {
          type: 'p',
          text: 'Click **Reports** in the header to leave the card feed and open the three report lists — one per classification.',
        },
        {
          type: 'shot',
          src: '/help/grievances/suggestion_criticism_reports.png',
          alt: 'The Reports tab with the three category selector cards',
          caption: 'The three report categories. Grievance Reports is the busiest of the three.',
          markers: [
            { n: 1, x: 27, y: 27, side: 'top', at: 22, label: 'Grievance Reports', text: 'Track formal complaints — Pending / Escalated / Closed / FIR.' },
            { n: 2, x: 50, y: 27, side: 'top', at: 48, label: 'Suggestions', text: 'Community feedback.' },
            { n: 3, x: 71, y: 27, side: 'top', at: 74, label: 'Criticism', text: 'Critical posts.' },
          ],
        },
        {
          type: 'shot',
          src: '/help/grievances/grievance_reports_tab.png',
          alt: 'The Grievance Workflow Reports table',
          caption: 'Grievance Reports — the full table.',
          markers: [
            { n: 1, x: 20, y: 15, side: 'left', at: 12, label: 'Search', text: 'By G-ID, content, handle, phone or category.' },
            { n: 2, x: 55, y: 27, side: 'top', at: 50, label: 'Filters', text: 'Date range, category, platform and status — narrow the list before searching.' },
            { n: 3, x: 27, y: 39, side: 'left', at: 36, label: 'Status counters', text: 'Pending, Escalated, Closed and FIR — totals for the current filter.' },
            { n: 4, x: 91, y: 6, side: 'right', at: 8, label: 'Export Excel', text: 'Downloads the current filtered list.' },
            { n: 5, x: 62, y: 58, side: 'right', at: 55, label: 'Communication', text: 'A preview of the message sent, or “No Logs” if nothing has gone out yet.' },
          ],
        },
        {
          type: 'callout',
          tone: 'tip',
          title: 'The eye icon opens the full report',
          text:
            'Click the eye next to any row\'s status to open that grievance\'s full report — the same QR-code-and-thread view covered in “The full Grievance Report”.',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'checklist',
      group: 'Reference',
      groupBlurb: 'Look these up when you need them',
      icon: 'ListChecks',
      blurb: 'Confirm these before you classify a grievance.',
      title: 'Checklist before you classify',
      blocks: [
        {
          type: 'list',
          items: [
            'You have picked the **right button** — G for a complaint needing action, S for feedback, C for criticism with nothing actionable in it.',
            'The government account that was tagged is **added as a source** — untagged accounts never produce a card.',
            'On **Compose**, the auto-filled post link and content actually match the post — check before sending.',
            'If you have a **complainant number**, add it — it is what makes “Complaint Phone Number: None” disappear from the message.',
            'You know that **Escalated** and **Closed** open the report rather than applying instantly — expect that extra step.',
          ],
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'troubleshooting',
      group: 'Reference',
      icon: 'LifeBuoy',
      blurb: 'Common problems and what to do about them.',
      title: 'Troubleshooting',
      blocks: [
        {
          type: 'table',
          head: ['Problem', 'Likely cause', 'Fix'],
          rows: [
            ['No grievances appear at all', 'No government account is added as a source', 'Add one under Add Government Account — only tagged posts to a monitored account are collected'],
            ['A post you expected is missing', 'It tags an account that is not monitored', 'Add that account as a source; past posts are not backfilled automatically'],
            ['Status won\'t change to Escalated/Closed', 'This is expected — it opens the report instead of applying directly', 'Complete the step in the report that opens'],
            ['Can\'t find a report', 'Wrong report category selected', 'G-codes live under Grievance Reports, S- under Suggestions, C- under Criticism — check the prefix'],
            ['"Complaint Phone Number: None" in the message', 'No number was entered on Compose', 'Add the Complainant Mobile No before sending, or edit the message directly'],
          ],
        },
      ],
    },
  ],
};

export default grievances;
