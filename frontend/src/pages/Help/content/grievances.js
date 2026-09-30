/**
 * Help content — Grievances module.
 *
 * Block types: p | steps | live | callout | table | list | fields
 */

const grievances = {
  id: 'grievances',
  title: 'Grievances',
  icon: 'MessageSquare',
  summary:
    'Public complaints, suggestions and criticism aimed at the government accounts you monitor — triaged, communicated on, and tracked to a closed report with its own reference code.',
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
            'A grievance starts life as an ordinary post or comment — a citizen tagging or replying to a government account with a complaint, a suggestion, or criticism. Blurasaga collects the mentions of your watched accounts into one feed, where an officer decides what each one is and works it through to a close.',
        },
        {
          type: 'live',
          route: "/grievances",
          alt: "The Grievances page",
          caption: "The Grievances page as it opens.",
          markers: [
            { n: 1, target: {"text": "Feed"}, label: "Feed / Reports", text: "Switches between the Feed and the report lists. See “The Reports tab”." },
            { n: 2, target: {"text": "mentions"}, label: "Mentions and watched", text: "How many mentions have been collected and how many accounts are watched." },
            { n: 3, target: {"text": "Pending"}, label: "Status filters", text: "Total, Pending, Escalated, Closed and FIR, each with a count. Click one to filter the feed." },
            { n: 4, target: {"placeholder": "Search grievances"}, label: "Search", text: "Search the feed by text." },
          ],
        },
        {
          type: 'p',
          text:
            'The header has a **Feed / Reports** switch, the platform tabs, a count of **mentions** and **watched** accounts, and a fetch button (**Fetch mentions**, or **Fetch posts & comments** on Facebook and Instagram). Below it are the status filters, a **Search grievances…** box and your watched-account chips.',
        },
        {
          type: 'table',
          head: ['Filter', 'Shows'],
          rows: [
            ['**Total**', 'Every mention collected so far.'],
            ['**Pending**', 'Has a Grievance report that is not yet escalated or closed.'],
            ['**Escalated**', 'A Grievance that has been escalated.'],
            ['**Closed**', 'A Grievance that has been closed.'],
            ['**FIR**', 'Grievances closed as converted to an FIR.'],
          ],
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'You may not see every filter',
          text:
            'Which filters and the Reports switch appear depends on your permissions. Ask an administrator if one is missing.',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'add-source',
      group: 'Start here',
      icon: 'PlusCircle',
      blurb: 'Add the government accounts you want mentions collected for.',
      title: 'Adding a government account',
      blocks: [
        {
          type: 'p',
          text:
            'Nothing is collected until at least one government account is watched. Accounts are added in Settings, not on the Grievances page.',
        },
        {
          type: 'steps',
          items: [
            { text: 'Open **Settings** and choose the **Grievances** tab, or click **Configure in Settings** on the Grievances page when no accounts exist.' },
            { text: 'Under **Watched accounts**, click **Add account**.' },
            { text: 'Enter the handle or URL of the account. It is used only for Grievances monitoring.' },
            { text: 'Save. It then appears as a chip on the Grievances page.' },
          ],
        },
        {
          type: 'p',
          text:
            'On the Grievances page each chip has icons to edit the account, fetch its history, or remove it. Clicking a platform tab (Facebook, Instagram, Telegram or X) fetches the latest mentions for the watched accounts on that platform automatically, at most once every 5 minutes. Clicking **All** fetches every watched account on every platform, each time you click it, so it can take longer and uses more of your BluGate quota. The **Reports** view never fetches by itself. Use **Fetch mentions** in the header to fetch again whenever you like: it pulls the latest for the platform you have open, or for every watched account on **All**.',
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'Contacts are in the same place',
          text:
            'The **Contacts** card in Settings → Grievances holds the officers and departments you share reports with (name, phone, department, designation). Add them before you need to communicate on a grievance.',
        },
      ],
    },

    // ══════════════════════════════════════════ THE G PATH
    {
      id: 'card-and-classify',
      group: 'Working a grievance',
      groupBlurb: 'One grievance, start to finish',
      icon: 'Hash',
      blurb: 'Reading a card, and the three kinds of report.',
      title: 'Step 1 — Read the card, then classify it',
      blocks: [
        {
          type: 'p',
          text: 'Every card has a **Report** menu, headed “Create a report from this post”. Pick the one that matches what the citizen is actually saying:',
        },
        {
          type: 'table',
          head: ['Button', 'Use for', 'Opens'],
          rows: [
            ['**Grievance**', 'A formal complaint that needs an answer.', 'The 4-step Grievance Report'],
            ['**Suggestion**', 'Feedback or an idea, not a complaint.', 'The 3-step Suggestion Report'],
            ['**Criticism**', 'Critical of the department, not asking for action.', 'The 3-step Criticism Report'],
          ],
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'Once classified, the card grows a code',
          text:
            'A coloured pill appears on the card showing its reference code, with a **G**, **S** or **C** badge. Click the code any time to reopen that report.',
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
            'Choose **Report → Grievance** on a card and **Create Grievance Report** opens on its first step. The four steps shown across the top are **Write message → Share / Close → Log → Done**.',
        },
        {
          type: 'callout',
          tone: 'tip',
          title: 'Copy button',
          text:
            'Use **Copy** above the message if you want to paste it somewhere outside the built-in WhatsApp step — an email, or a different messaging tool.',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'grievance-communicate',
      group: 'Working a grievance',
      icon: 'MessageCircle',
      blurb: 'Step 2 of 4 — sharing the drafted message with a contact, or closing.',
      title: 'Step 3 — Share / Close',
      blocks: [
        {
          type: 'p',
          text:
            'Clicking **Save & continue** assigns the report its reference code and moves to **Share / Close** — “Share on WhatsApp or close this grievance”. This is where the drafted message actually gets sent to the contact who needs to act on it.',
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'Skip is there for a reason',
          text:
            'Not every grievance needs a contact — sometimes you are only logging it. **Skip** moves straight to the Log step without sending anything. You can also close the grievance from this step.',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'grievance-log',
      group: 'Working a grievance',
      icon: 'ClipboardList',
      blurb: 'Step 3 of 4 — recording who was contacted and what was said.',
      title: 'Step 4 — Log the communication',
      blocks: [
        {
          type: 'p',
          text:
            'The **Log** step is “Step 3 of 4 — Log communication details”. It shows a **Communication Log** of every entry so far, and lets you add your own — for example the messages exchanged with the citizen and with the officer. Click **Save & Finish** when the log is complete.',
        },
        {
          type: 'callout',
          tone: 'tip',
          title: 'The log is the record',
          text:
            'The Communication column in the Reports tab is built from these entries. Write what was said and to whom, not just “done”.',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'grievance-status',
      group: 'Working a grievance',
      icon: 'PauseCircle',
      blurb: 'Pending, Escalated, Closed — and FIR conversion.',
      title: 'Step 5 — Escalate or close from the card',
      blocks: [
        {
          type: 'p',
          text:
            'Once a card carries a Grievance code, its pill includes a **Report status** dropdown right on the card, so you do not need to reopen the full report to move a grievance along.',
        },
        {
          type: 'table',
          head: ['Status', 'What happens when you pick it'],
          rows: [
            ['**Pending**', 'Set straight away.'],
            ['**Escalated**', 'A window opens: **Step 1** select a contact to escalate to, **Step 2** review the escalation message, then the grievance shows as Escalated.'],
            ['**Closed**', 'A window opens asking for the closing details (below), then a confirmation.'],
          ],
        },
        {
          type: 'p',
          text: 'When you pick **Closed**, the window asks for these details:',
        },
        {
          type: 'fields',
          items: [
            { name: 'Closing Remarks', text: 'Required. The system will not close without them.' },
            { name: 'Final Reply to User', text: 'Optional text of the reply given to the citizen.' },
            { name: 'Converted to FIR', text: 'Choose **Yes** or **No**. If Yes, enter the **FIR Number**. These grievances are counted under the **FIR** filter.' },
            { name: 'Closing Attachment Media', text: 'Optional files for reference — images, video, PDF, Word or Excel.' },
          ],
        },
        {
          type: 'callout',
          tone: 'warn',
          title: 'Escalated and Closed are not one click',
          text:
            'Picking either opens a window first, so the reason is on record. Finish it, or Cancel to leave the status unchanged.',
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
            'Clicking a grievance code — on the card, or in the Reports tab — opens the complete report: everything captured so far, plus a QR code and a downloadable PDF.',
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
      title: 'Creating a Suggestion report',
      blocks: [
        {
          type: 'p',
          text:
            'Choose **Report → Suggestion** on a card for feedback or an idea rather than a complaint. The flow is shorter than a Grievance — three steps, because there is no separate status to escalate.',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'criticism-path',
      group: 'Suggestion and Criticism',
      icon: 'AlertCircle',
      blurb: 'The same 3-step flow, for posts that are critical rather than actionable.',
      title: 'Creating a Criticism report',
      blocks: [
        {
          type: 'p',
          text: 'Choose **Report → Criticism** for a post that is critical of the department without asking for a specific action. The Criticism report has the same three steps as Suggestion.',
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'Only Grievances have a status dropdown',
          text:
            'A Suggestion or Criticism pill just opens its report. There is no Pending / Escalated / Closed control, because they have no escalation workflow.',
        },
      ],
    },

    // ══════════════════════════════════════════ REPORTS
    {
      id: 'reports-tab',
      group: 'Reports',
      groupBlurb: 'Every classified item, searchable and exportable',
      icon: 'BarChart3',
      blurb: 'The report lists, and how to find one report fast.',
      title: 'The Reports tab',
      blocks: [
        {
          type: 'p',
          text: 'Click **Reports** in the header to leave the card feed and open the report lists. The summary at the top shows **Total records**, **Grievance (G)**, **Suggestion (S)**, **Criticism (C)** and **Watched Accounts**.',
        },
        {
          type: 'p',
          text: 'Choose **All records**, **Grievance**, **Suggestion** or **Criticism** to switch list. All records has **Date**, **Platform** and **Status** filters and a **Search ID, citizen, description…** box.',
        },
        {
          type: 'live',
          route: "/grievances?tab=reports",
          alt: "The Grievances Reports tab",
          caption: "The Reports tab.",
          markers: [
            { n: 1, target: {"text": "All records"}, label: "All records", text: "Every formal record across the three lists." },
            { n: 2, target: {"text": "Grievance"}, label: "Grievance", text: "Track formal complaints — Pending / Escalated / Closed / FIR." },
            { n: 3, target: {"text": "Suggestion"}, label: "Suggestion", text: "Community feedback." },
            { n: 4, target: {"text": "Criticism"}, label: "Criticism", text: "Critical posts." },
            { n: 5, target: {"placeholder": "Search ID, citizen"}, label: "Search", text: "By unique ID, citizen or description." },
            { n: 6, target: {"label": "Refresh"}, label: "Refresh", text: "Reloads the list." },
          ],
        },
        {
          type: 'p',
          text:
            'The Grievance table has columns for Status, Unique ID, Post Date, Phone, Citizen Profile, Link, Grievance Description, Category, Communication Log, Operator Remarks, Informed Officer, Escalation Remarks, Escalation Time, Resolution Remarks and FIR Number. Use the Excel export button to download the current list, and the refresh button to reload it.',
        },
        {
          type: 'callout',
          tone: 'tip',
          title: 'The eye icon opens the full report',
          text:
            'Click the eye icon on a row (Actions column) to open that grievance\'s full report — the same QR-code-and-thread view covered in “The full Grievance Report”.',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'checklist',
      group: 'Reference',
      groupBlurb: 'Look these up when you need them',
      icon: 'ListChecks',
      blurb: 'Confirm these before you create a report.',
      title: 'Checklist before you create a report',
      blocks: [
        {
          type: 'list',
          items: [
            'You have picked the **right report** — Grievance for a complaint needing action, Suggestion for feedback, Criticism for criticism with nothing actionable in it.',
            'The government account is **added under Settings → Grievances** — unwatched accounts never produce a card.',
            'On the first step, the auto-filled post link and content actually match the post — check before sending.',
            'If you have a **complainant phone**, add it.',
            'Your **Contacts** are set up in Settings so you can share the report.',
            'You know that **Escalated** and **Closed** open a window rather than applying instantly.',
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
            ['No grievances appear at all', 'No government account is watched', 'Add one under Settings → Grievances → Add account, then click Fetch mentions'],
            ['A post you expected is missing', 'It mentions an account that is not watched', 'Add that account; use the fetch icon on its chip to pull its history'],
            ['No contacts to share with', 'No contacts exist', 'Add them under Settings → Grievances → Contacts'],
            ['Status will not change to Escalated or Closed', 'This is expected — a window opens first', 'Complete the window that opens; Closing Remarks are required to close'],
            ['Cannot find a report', 'Wrong list selected', 'Use All records, or pick Grievance, Suggestion or Criticism to match the code badge (G, S, C)'],
            ['The Reports switch is missing', 'Your account does not have access', 'Ask an administrator to check your access'],
          ],
        },
      ],
    },
  ],
};

export default grievances;
