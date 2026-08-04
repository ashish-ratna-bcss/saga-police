/**
 * Help content — Alerts module.
 *
 * Block types: p | steps | shot | callout | table | list | fields
 */

const alerts = {
  id: 'alerts',
  title: 'Alerts',
  icon: 'AlertTriangle',
  summary:
    'Every post the system flags as worth a look, in one queue — with the tools to judge it, escalate it, serve a notice on the platform and track the reply.',
  sections: [
    // ══════════════════════════════════════════ START HERE
    {
      id: 'what-is-an-alert',
      icon: 'Info',
      blurb: 'What raises an alert, and how risk level is worked out.',
      group: 'Start here',
      groupBlurb: 'What alerts are and how to read the screen',
      title: 'How alerts are raised',
      blocks: [
        {
          type: 'p',
          text:
            'Every post collected from a monitored profile is read by the system. If anything stands out, it becomes an alert. There are four reasons an alert appears:',
        },
        {
          type: 'table',
          head: ['Type', 'Raised when'],
          rows: [
            ['**Keyword**', 'The post contains one of the keywords from Settings → Keywords.'],
            ['**AI risk**', 'The AI scored the post above your risk threshold.'],
            ['**Viral**', 'Engagement is climbing unusually fast for that account.'],
            ['**New post**', 'A profile you watch closely has posted.'],
          ],
        },
        {
          type: 'p',
          text:
            'Each alert carries a **risk level** — High, Medium or Low — worked out from the AI score against the thresholds in Settings. Your keyword weights can override the AI: if you gave a keyword a higher weight than the AI\'s score, the keyword wins.',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'the-screen',
      icon: 'Compass',
      blurb: 'A tour of the Alerts page.',
      group: 'Start here',
      title: 'The Alerts screen',
      blocks: [
        {
          type: 'shot',
          src: '/help/alerts/alerts_overview.png',
          alt: 'The Alerts page',
          caption: 'The Alerts page.',
          markers: [
            { n: 1, x: 63, y: 15.7, side: 'top', at: 58, label: 'Top 50 / Category · 24h', text: 'AI-ranked shortlist of the most significant alerts. See “AI-ranked top alerts”.' },
            { n: 2, x: 74.7, y: 15.7, side: 'top', at: 84, label: 'Frequent Engagers', text: 'Every X account analysed so far, and who repeatedly amplifies them.' },
            { n: 3, x: 26.5, y: 25.8, side: 'left', at: 16, label: 'Search', text: 'Search alert text, or paste a post link to pull it in. See “Investigating a link”.' },
            { n: 4, x: 60, y: 25.8, side: 'top', at: 30, label: 'Platform · Category · Keyword filters', text: 'Narrow to one platform, one of the seven categories, or a single keyword.' },
            { n: 5, x: 85.5, y: 25.8, side: 'right', at: 18, label: 'Date range', text: 'Limits the queue to alerts raised between these dates.' },
            { n: 6, x: 24.9, y: 34.8, side: 'left', at: 34, label: 'Status tabs', text: 'Active, False Positive, Acknowledged, Escalated and Reports. The number beside a tab is how many sit in it.' },
            { n: 7, x: 20.1, y: 41, side: 'left', at: 50, label: 'Risk filter', text: 'All, High, Medium, Low — or Viral for posts spreading unusually fast.' },
            { n: 8, x: 22, y: 76, side: 'left', at: 78, label: 'Alert cards', text: 'One card per flagged post. The coloured strip and badge show its risk level.' },
          ],
        },
        {
          type: 'p',
          text:
            'The five tabs are the stages an alert passes through. **Active** is the inbox; **Acknowledged** and **False Positive** are the two ways an alert ends; **Escalated** is where alerts wait for a notice to be raised; **Reports** is where the notices you have already served are tracked.',
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'You may not see every tab',
          text:
            'Which status tabs appear depends on your permissions. If a colleague can see a tab you cannot, ask an administrator to check your access under Settings → Access Management.',
        },
      ],
    },

    // ══════════════════════════════════════════ TRIAGE
    {
      id: 'reading-a-card',
      icon: 'FileText',
      blurb: 'Every control on a single alert card.',
      group: 'Working an alert',
      groupBlurb: 'From the queue to a served notice, in order',
      title: 'Step 1 — Read the alert',
      blocks: [
        {
          type: 'shot',
          src: '/help/alerts/alerts_card.png',
          alt: 'A single alert card',
          caption: 'One alert card. The account name is blurred here.',
          markers: [
            { n: 1, x: 11.2, y: 3.3, side: 'left', at: 3, label: 'Risk badges', text: 'HIGH, MEDIUM or LOW. VIRAL appears alongside when the post is spreading unusually fast.' },
            { n: 2, x: 29.4, y: 9.5, side: 'top', at: 20, label: 'Action', text: 'The menu that moves the alert. Covered in the next step.' },
            { n: 3, x: 52.3, y: 9.5, side: 'top', at: 46, label: 'Format & Share', text: 'Builds a briefing message for the WhatsApp group.' },
            { n: 4, x: 69.9, y: 9.3, side: 'top', at: 68, label: 'Download', text: 'Saves the images or video from the post.' },
            { n: 5, x: 76.8, y: 9.3, side: 'top', at: 84, label: 'Frequent Engagers', text: 'Who repeatedly reshares this account. X only — struck through on other platforms.' },
            { n: 6, x: 89.2, y: 11.9, side: 'right', at: 9, label: 'Platform · View Details', text: 'The eye opens the analysis — why this post was flagged. Read it before you decide.' },
            { n: 7, x: 24, y: 21, side: 'left', at: 20, label: 'Account and location', text: 'Who posted, and the location the system worked out from the post. “Omnipresent” means it could not narrow it down.' },
            { n: 8, x: 29.2, y: 41.8, side: 'left', at: 42, label: 'Read more · Translate', text: 'Expands the full post text, or turns Telugu, Hindi or Urdu into English in place.' },
            { n: 9, x: 50.5, y: 62.7, side: 'left', at: 62, label: 'Media', text: 'Plays here. Download it if the alert may become a case.' },
            { n: 10, x: 40, y: 90, side: 'bottom', at: 40, label: 'Time and engagement', text: 'When it was posted, and the views, reposts and likes at the last check.' },
          ],
        },
        {
          type: 'p',
          text:
            'Read the post itself, not only the badge. Use **Translate** if it is in Telugu, Hindi or Urdu, **Read more** for the full text, and open the original post on the platform if you need the replies or the surrounding thread.',
        },
        {
          type: 'callout',
          tone: 'tip',
          title: 'The reasons are behind the eye',
          text:
            'The card shows the post; it does not show why the post was flagged. Click the **eye** under the platform logo to open the analysis — matched keywords, the AI\'s reasoning, and any legal sections. Covered in “Why it was flagged”.',
        },
        {
          type: 'callout',
          tone: 'warn',
          title: 'Read the post, not just the score',
          text:
            'The AI is a filter, not a decision. A HIGH score on routine police reporting happens, and so does a LOW score on something that matters locally. Your judgement is the one that counts.',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'action-menu',
      icon: 'CheckSquare',
      blurb: 'Acknowledge, escalate, reject — and the two label corrections.',
      group: 'Working an alert',
      title: 'Step 2 — Acknowledge, escalate or reject',
      blocks: [
        {
          type: 'p',
          text: 'Click **Action** on the card. Five choices open:',
        },
        {
          type: 'shot',
          src: '/help/alerts/alert_action_menu.png',
          alt: 'The Action menu open on an alert card',
          caption: 'The Action menu. The top three move the alert; the bottom two correct how it is labelled.',
          markers: [
            { n: 1, x: 39.1, y: 16.5, side: 'left', at: 15, label: 'Acknowledge', text: 'Seen and understood, no further action.' },
            { n: 2, x: 35.7, y: 21.9, side: 'left', at: 22, label: 'Escalate', text: 'Needs a notice to the platform, or attention from another unit.' },
            { n: 3, x: 36.8, y: 27.2, side: 'left', at: 29, label: 'False Positive', text: 'The system was wrong — this is not a concern.' },
            { n: 4, x: 42.2, y: 33.9, side: 'right', at: 34, label: 'Change Risk Level', text: 'Correct the AI — set High, Medium or Low yourself.' },
            { n: 5, x: 41.7, y: 39.2, side: 'right', at: 41, label: 'Change Category', text: 'Move the alert into the right one of the seven categories.' },
          ],
        },
        {
          type: 'table',
          head: ['Decision', 'Use when', 'Where it goes'],
          rows: [
            ['**Acknowledge**', 'Seen, understood, no action needed.', 'Acknowledged tab'],
            ['**Escalate**', 'A notice is needed, or someone senior must see it.', 'Escalated tab — a **Generate** button appears on the card'],
            ['**False Positive**', 'The system was wrong.', 'False Positive tab'],
          ],
        },
        {
          type: 'callout',
          tone: 'tip',
          title: 'Nothing is final, and the two corrections stay with the alert',
          text:
            'You can move an alert between all three tabs at any time. **Change Risk Level** and **Change Category** do not move it — they correct how it is labelled, so the filters and the Dashboard counts reflect reality.',
        },
        {
          type: 'callout',
          tone: 'warn',
          title: 'Mark False Positive honestly',
          text:
            'False Positive is a signal that the keyword or threshold needs tuning, not a way to clear the queue. If the same kind of post keeps being flagged wrongly, tell an administrator so the keyword can be adjusted.',
        },
        {
          type: 'p',
          text:
            'Every change is recorded with your name and the time. That log feeds the **Alert Workflow KPI** on the Dashboard, which shows how many alerts each officer handled per day.',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'generate-report',
      icon: 'Send',
      blurb: 'Turning an escalated alert into a served legal notice.',
      group: 'Working an alert',
      title: 'Step 3 — Generate the notice',
      blocks: [
        {
          type: 'p',
          text:
            'Once an alert is escalated it appears in the **Escalated** tab with a red **Generate** button on the card. That button opens the **Official Notice Generator** — the formal letter served on the platform asking for account details and IP logs.',
        },
        {
          type: 'shot',
          src: '/help/alerts/alert_escalated.png',
          alt: 'An escalated alert card showing the Generate button',
          caption: 'An escalated card. Before a notice exists you see Generate; afterwards it turns into a green Generated badge.',
          markers: [
            { n: 1, x: 83.8, y: 4.1, side: 'top', at: 84, label: 'Escalated tab', text: 'The number beside it is how many alerts are waiting for a notice.' },
            { n: 2, x: 32.7, y: 31.0, side: 'left', at: 30, label: 'Action', text: 'Still available — you can move the alert back out of Escalated at any time.' },
            { n: 3, x: 49.1, y: 30.9, side: 'top', at: 42, label: 'Generate', text: 'Opens the Official Notice Generator in a new tab. Only appears on escalated alerts.' },
            { n: 4, x: 62.1, y: 30.9, side: 'right', at: 30, label: 'Format & Share', text: 'Same button as before — on this tab it shrinks to just its icon to make room for Generate.' },
          ],
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'Format & Share loses its label here',
          text:
            'On the Escalated tab the words disappear and only the document icon is left, beside the download arrow. It is the same button and does the same thing.',
        },
        {
          type: 'steps',
          items: [
            {
              text: 'Click **Generate**. The notice opens in a new tab and is given a **serial number** automatically — this is the reference you quote afterwards.',
            },
            {
              text: 'If the same content has been reported before, a **Recurring Threat Detected** box appears listing the earlier alerts.',
              note: 'Read it before you continue — you may be about to serve a second notice for something already in hand.',
            },
            {
              text: 'Pick a **template** if your unit uses one. If a default template is set it is chosen for you.',
            },
            {
              text: 'Check the pre-filled letter. Every block is editable — click into it and type.',
            },
            {
              text: 'Click **Save** to store your edits against the serial number, then **Print / PDF** for the signed copy.',
              note: 'Save first. Print / PDF builds the document from what is currently on screen, but only Save keeps your edits.',
            },
            {
              text: 'Serve the PDF on the platform through your usual channel, then set the report to **Sent to Intermediary** in the Reports tab.',
            },
          ],
        },
        {
          type: 'shot',
          src: '/help/alerts/report_generator.png',
          alt: 'The top of the Official Notice Generator',
          caption: 'The top of the notice — the letter continues below the fold with the profile/content URLs, legal sections, the four-point request and the signature block (see the field list below).',
          markers: [
            { n: 1, x: 3, y: 4, side: 'left', at: 6, label: 'Back', text: 'Returns to the alert without losing a saved notice.' },
            { n: 2, x: 14, y: 6, side: 'left', at: 14, label: 'Serial number', text: 'Assigned automatically the moment you click Generate. This is the reference you quote afterwards.' },
            { n: 3, x: 89, y: 4, side: 'top', at: 89, label: 'Save', text: 'Stores your edits against the serial number. Do this before Print / PDF.' },
            { n: 4, x: 97, y: 4, side: 'right', at: 6, label: 'Print / PDF', text: 'Builds the document from what is currently on screen.' },
            { n: 5, x: 50, y: 37, side: 'left', at: 42, label: 'Notice heading', text: 'The legal sections cited (IT Act, BNS) and the crime/case reference — carried over from the alert.' },
            { n: 6, x: 50, y: 90, side: 'bottom', at: 50, label: 'Alleged account URL', text: 'The profile being reported. Check it against the original post.' },
          ],
        },
        {
          type: 'p',
          text: 'The notice is filled in for you from the alert. These are the parts you will normally check:',
        },
        {
          type: 'fields',
          items: [
            { name: 'Addressee', text: 'The platform — X Corp., Meta Platforms or Google LLC, chosen from the alert\'s platform. Their Trust & Safety address is filled in.' },
            { name: 'Profile & content URL', text: 'Taken from the post. For a repost, the original author is shown separately.' },
            { name: 'Legal sections', text: 'The BNS sections the AI identified. **Check these against the post yourself.**' },
            { name: 'Request', text: 'The standard four asks — account details, IP logs for a date range, registered email, registered mobile. Edit the date range to your case.' },
            { name: 'Declaration', text: 'The MLAT declaration. Standard text — leave it unless instructed.' },
            { name: 'Sender address & signature', text: 'IT Cell, Commissioner of Police office, Hyderabad. Change the signature to the officer actually signing.' },
          ],
        },
        {
          type: 'callout',
          tone: 'warn',
          title: 'Two things are wrong until you fix them',
          text:
            'The **IP log date range** and the **signing officer** are pre-filled with defaults. Both go out on a legal notice. Change them before you download.',
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'Reopening a notice',
          text:
            'The green **Generated** badge on the card, and **View Full Report** in the Reports tab, both reopen the same notice with your saved edits intact. A second notice is never created for the same alert.',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'reports-tab',
      icon: 'BarChart3',
      blurb: 'Tracking a served notice from sent to closed.',
      group: 'Working an alert',
      title: 'Step 4 — Track it in the Reports tab',
      blocks: [
        {
          type: 'p',
          text:
            'Every notice you generate appears in the **Reports** tab, one row per serial number. This is where a notice is tracked from the day it is served to the day the platform replies.',
        },
        {
          type: 'shot',
          src: '/help/alerts/reports_tab.png',
          alt: 'The Reports tab',
          caption: 'The Reports tab, filtered to Sent to Intermediary — its default.',
          markers: [
            { n: 1, x: 20, y: 27, side: 'left', at: 22, label: 'Search', text: 'By serial number, officer or handle.' },
            { n: 2, x: 68, y: 27, side: 'top', at: 66, label: 'Platform · Status filters', text: 'Status opens on Sent to Intermediary, so closed reports are hidden until you switch it.' },
            { n: 3, x: 91, y: 27, side: 'right', at: 20, label: 'Export Excel', text: 'Downloads the current list as an Excel file.' },
            { n: 4, x: 8, y: 54, side: 'left', at: 50, label: 'Report ID', text: 'The serial number on the notice. Click the eye icon in Actions to open the full report.' },
            { n: 5, x: 63, y: 54, side: 'left', at: 62, label: 'Status', text: 'Change it here as the case moves. See the table below.' },
            { n: 6, x: 80, y: 54, side: 'right', at: 50, label: 'Closing remarks', text: 'What happened in the end. Required before a report can be closed — shows as a dash until then.' },
          ],
        },
        {
          type: 'p',
          text: 'A report moves through three stages:',
        },
        {
          type: 'table',
          head: ['Stage', 'Meaning', 'Set by'],
          rows: [
            ['**Report Generated**', 'The notice exists and has a serial number.', 'Automatic, when you click Generate'],
            ['**Sent to Intermediary**', 'The notice has been served on the platform.', 'You, after serving it'],
            ['**Closed**', 'The matter is finished — content removed, account suspended, or no action needed.', 'You, with closing remarks'],
          ],
        },
        {
          type: 'steps',
          title: 'Updating the status',
          items: [
            { text: 'Find the row by serial number. If it is not there, switch the **Status** filter — it opens on *Sent to Intermediary* and hides closed reports.' },
            { text: 'Use the status dropdown in that row and pick the new stage.' },
            { text: 'A confirmation box appears showing the change from the old status to the new one.' },
            { text: 'To close, type the **closing remarks** — what the platform did, or why no action was needed. The system will not let you close without them.', note: 'For example: *content removed by X on 14/07*, or *account already suspended*.' },
            { text: 'Confirm. The row updates immediately and the remarks stay visible on it.' },
          ],
        },
        {
          type: 'callout',
          tone: 'tip',
          title: 'Check a handle\'s history before you serve another notice',
          text:
            'Open a report and the panel shows every other report raised against that same account, and how many are still open. A repeat offender with three open notices is a different conversation with the platform than a first-time one.',
        },
        {
          type: 'callout',
          tone: 'warn',
          title: 'Closing remarks are the record',
          text:
            'They are what your unit will read months later when the case is questioned. "Done" tells nobody anything. Write what the platform actually did and when.',
        },
      ],
    },

    // ══════════════════════════════════════════ TOOLS
    {
      id: 'view-details',
      icon: 'Eye',
      blurb: 'The AI\'s reasoning behind the flag — read this before you act.',
      group: 'Tools on an alert',
      groupBlurb: 'The buttons on the card, and what each one actually does',
      title: 'Why it was flagged — View Details',
      blocks: [
        {
          type: 'p',
          text:
            'Click the **eye** below the platform logo, at the top right of the card. This is the alert\'s reasoning — it is the single most useful thing on the card and it is not visible until you open it.',
        },
        {
          type: 'shot',
          src: '/help/alerts/view_details.png',
          alt: 'The Alert Analysis Details window',
          caption: 'The analysis behind an alert, top to bottom.',
          markers: [
            { n: 1, x: 50, y: 16, side: 'left', at: 12, label: 'Risk Summary', text: 'Risk level, risk score, category and the AI\'s one-line intent.' },
            { n: 2, x: 30, y: 25, side: 'left', at: 24, label: 'Detected Keywords', text: 'Words from your keyword list found in the post. Reads “None detected” when the alert was raised on AI score alone.' },
            { n: 3, x: 30, y: 36, side: 'left', at: 36, label: 'Indian Laws Violated', text: 'The BNS sections the AI identified, with what each one covers. These carry into the notice — verify them.' },
            { n: 4, x: 30, y: 52, side: 'right', at: 46, label: 'Platform Policies Violated', text: 'Which policy is breached on each platform the post touches.' },
            { n: 5, x: 30, y: 68, side: 'left', at: 62, label: 'Expert Logic', text: 'The AI\'s own reasoning, in plain words.' },
            { n: 6, x: 50, y: 80, side: 'right', at: 76, label: 'Subject Content', text: 'The post text the AI actually analysed. Compare it against the card if anything looks off.' },
          ],
        },
        {
          type: 'callout',
          tone: 'warn',
          title: 'Check the legal sections here, not on the notice',
          text:
            'Whatever the AI lists here is what gets pre-filled into the Official Notice. It is easier to catch a wrong section now than after the letter is drafted.',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'format-share',
      icon: 'Share2',
      blurb: 'A ready-to-send WhatsApp briefing, built from the post.',
      group: 'Tools on an alert',
      title: 'Format & Share to WhatsApp',
      blocks: [
        {
          type: 'p',
          text:
            'Turns an alert into a ready-to-send briefing message for the duty WhatsApp group — greeting, who posted it, the post text, what was detected, the link and the engagement figures.',
        },
        {
          type: 'shot',
          src: '/help/alerts/format_share.png',
          alt: 'The Format & Share dialog',
          caption: 'The Format & Share dialog. The text is editable before you send it.',
          markers: [
            { n: 1, x: 50, y: 40, side: 'left', at: 40, label: 'The message', text: 'Fully editable — trim it, or add your own line, before sharing. Scrolls to show engagement figures further down.' },
            { n: 2, x: 88, y: 87, side: 'bottom', at: 88, label: 'Share', text: 'Copies the message and opens the WhatsApp group.' },
          ],
        },
        {
          type: 'steps',
          items: [
            { text: 'Click **Format & Share** on the card.' },
            { text: 'Read the message and edit it. This is your chance to cut the post text down or add a line of context.' },
            { text: 'Click **Share**.' },
            {
              text: 'WhatsApp opens on the group. **Paste the message in yourself** — press Ctrl+V, or long-press and Paste on a phone.',
              note: 'The message is already on your clipboard.',
            },
          ],
        },
        {
          type: 'callout',
          tone: 'warn',
          title: 'It does not send by itself',
          text:
            'Share copies the message and opens the group — nothing is posted until you paste and press send. If you close WhatsApp without pasting, nothing was shared.',
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'Only the link is shared',
          text:
            'Media is not attached — the message carries the post link, not the image or video.',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'frequent-engagers',
      icon: 'Users',
      blurb: 'Who keeps amplifying this account.',
      group: 'Tools on an alert',
      title: 'Frequent Engagers',
      blocks: [
        {
          type: 'p',
          text:
            'Answers the question *who keeps amplifying this account?* It reads the account\'s tweets from the last 30 days, collects everyone who reposted them, and ranks those people by how often they do it. A one-off repost is noise; the same twelve accounts resharing everything is a network.',
        },
        {
          type: 'shot',
          src: '/help/alerts/frequent_engagers.png',
          alt: 'The Frequent Engagers analysis',
          caption: 'Engager analysis for one account — the network map on the left, the ranked list on the right.',
          markers: [
            { n: 1, x: 10, y: 6, side: 'top', at: 10, label: 'The account analysed', text: 'Tweets read, unique engagers found, and the 30-day window used.' },
            { n: 2, x: 22, y: 16, side: 'left', at: 22, label: 'Network Map', text: 'A visual web of the account and everyone who reshares it — click any node to add that person to monitoring.' },
            { n: 3, x: 53, y: 13, side: 'top', at: 50, label: 'All Engagers · count', text: 'The total number of unique accounts found reposting this one.' },
            { n: 4, x: 90, y: 13, side: 'top', at: 90, label: 'Search', text: 'Filter the list to one handle or name.' },
            { n: 5, x: 60, y: 50, side: 'right', at: 38, label: 'Engager list', text: 'Ranked by how many of the account\'s posts they reshared. Row colour is the frequency tier.' },
            { n: 6, x: 94, y: 50, side: 'right', at: 66, label: 'Add', text: 'Adds that engager as a monitored profile without leaving the dialog.' },
            { n: 7, x: 60, y: 97, side: 'bottom', at: 55, label: 'Tier legend', text: 'Frequent, Regular, Occasional, One-time — matches the row colours.' },
          ],
        },
        {
          type: 'steps',
          items: [
            { text: 'Click **Frequent Engagers** on an X alert card. The dialog opens on the last analysis for that account, if one exists.' },
            { text: 'If it is empty or out of date, run a fresh analysis. It reads 30 days of tweets, so give it a moment.' },
            { text: 'Use the **Network Map** to see the shape of the network at a glance, or the ranked list on the right for the numbers.' },
            { text: 'Read the colour of each row — it tells you how consistent that engager is.' },
            { text: 'When an engager matters, use **Add** on their row, or click their node on the map. They become a monitored profile and start raising alerts of their own.' },
          ],
        },
        {
          type: 'table',
          head: ['Tier', 'Means'],
          rows: [
            ['**Frequent**', 'Reshares almost everything this account posts. Treat as part of the network.'],
            ['**Regular**', 'Reshares often. Worth watching.'],
            ['**Occasional**', 'Reshares now and then.'],
            ['**One-time**', 'Reshared once. Usually nothing.'],
          ],
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'X accounts only',
          text:
            'Engager analysis reads reposts, which only X exposes. There is no equivalent for YouTube, Facebook or Instagram alerts.',
        },
        {
          type: 'callout',
          tone: 'tip',
          title: 'The header button is the wider view',
          text:
            '**Frequent Engagers** at the top of the Alerts page lists every account analysed so far, for comparing networks rather than one account at a time.',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'url-investigation',
      icon: 'Link2',
      blurb: 'Pull in a post from outside the system — a forward, a call, a complaint.',
      group: 'Tools on an alert',
      title: 'Investigating a link',
      blocks: [
        {
          type: 'p',
          text:
            'When a post reaches you from outside the system — a WhatsApp forward, a phone call, a complaint — you do not have to wait for it to be picked up by monitoring. Paste the link into the search box at the top of the Alerts page and the system will fetch it, analyse it and add it to the queue.',
        },
        {
          type: 'shot',
          src: '/help/alerts/url_investigate.png',
          alt: 'A URL pasted into the alerts search box, mid-fetch',
          caption: 'Right after pressing Escalate — the box reads “Escalating…” while it fetches and analyses the post. The Escalated(1) badge here is from an earlier alert, not this one — the result of this action lands in Active.',
          markers: [
            { n: 1, x: 35, y: 27, side: 'left', at: 27, label: 'The pasted link', text: 'A recognised post URL. Plain words search the existing queue instead.' },
            { n: 2, x: 88, y: 27, side: 'right', at: 27, label: 'Escalating…', text: 'Reads Escalate before you click it, then Escalating… while it works.' },
            { n: 3, x: 8, y: 60, side: 'bottom', at: 20, label: 'Active tab', text: 'Not Escalated — the new alert lands here, outlined in amber, once the fetch finishes.' },
          ],
        },
        {
          type: 'steps',
          items: [
            { text: 'Copy the link to the post — from the platform, or straight out of the WhatsApp forward.' },
            { text: 'Paste it into the search box on the Alerts page. An **Escalate** button appears at the right of the box.' },
            { text: 'Click it, or press Enter. The box shows *Escalating…* while it works.' },
            { text: 'The system fetches the post, runs the full AI analysis and adds it to the **Active** tab at the top of the list, outlined in amber so you can spot it.' },
            { text: 'From there work it exactly like any other alert — read it, then Acknowledge, Escalate or mark False Positive.' },
          ],
        },
        {
          type: 'callout',
          tone: 'warn',
          title: 'The button says Escalate, but the alert lands in Active',
          text:
            'Pulling a link in is not the same as escalating it. The result is a normal alert awaiting your judgement — if it needs a notice, escalate it yourself using the Action menu.',
        },
        {
          type: 'p',
          text: 'Links from these are recognised:',
        },
        {
          type: 'list',
          items: [
            '**X** — `x.com`, `twitter.com`, `t.co`',
            '**YouTube** — `youtube.com`, `youtu.be`',
            '**Facebook** — `facebook.com`, `fb.watch`',
            '**Instagram** — `instagram.com`',
            '**Shortened links** — `bit.ly`, `tinyurl.com`',
          ],
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'If the author is already monitored',
          text:
            'The new alert is linked to their existing profile, so it joins the rest of their history. If they are not, the card offers to add them to monitoring.',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'translate-download',
      icon: 'Languages',
      blurb: 'In-place translation, and saving the evidence.',
      group: 'Tools on an alert',
      title: 'Translate and Download',
      blocks: [
        {
          type: 'fields',
          items: [
            { name: 'Translate', text: 'Turns Telugu, Hindi or Urdu into English in place on the card. Click again to see the original.' },
            { name: 'Download', text: 'Saves the images or the video from the post to your machine, for attaching to a case file.' },
          ],
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'Download the evidence early',
          text:
            'A post that is deleted or an account that goes private takes its media with it. If an alert looks like it will become a case, download the media while it is still there.',
        },
      ],
    },

    // ══════════════════════════════════════════ REFERENCE
    {
      id: 'top-alerts',
      icon: 'Sparkles',
      blurb: 'The AI-ranked shortlist for starting the day.',
      group: 'Reference',
      groupBlurb: 'Look these up when you need them',
      title: 'AI-ranked top alerts',
      blocks: [
        {
          type: 'p',
          text:
            '**Top 50 / Category** asks the AI to pick the most significant alerts in each category from the last 24, 48 or 72 hours — ranked by threat to public order, how fast it is spreading, and risk score, while avoiding the same account filling the list.',
        },
        {
          type: 'callout',
          tone: 'tip',
          title: 'Use it to start the day',
          text:
            'When the Active queue has hundreds of alerts, this tells you which ones to open first. It takes about a minute to build.',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'alerts-troubleshooting',
      icon: 'LifeBuoy',
      blurb: 'Common problems and what to do about them.',
      group: 'Reference',
      title: 'Troubleshooting',
      blocks: [
        {
          type: 'table',
          head: ['Problem', 'Likely cause', 'Fix'],
          rows: [
            ['No **Generate** button on the card', 'The alert is not escalated yet', 'Escalate it first — Generate only appears on the Escalated tab'],
            ['A report is missing from the Reports tab', 'The Status filter opens on *Sent to Intermediary*', 'Switch the Status filter, or search the serial number'],
            ['Cannot close a report', 'Closing remarks are empty', 'Type what the platform did — the system requires it'],
            ['Nothing arrived in the WhatsApp group', 'Share copies the message; it does not send it', 'Paste into the group with Ctrl+V, then send'],
            ['**Escalate** does not appear when I paste a link', 'The link is not from a supported platform', 'Check the list under “Investigating a link”'],
            ['No **Frequent Engagers** button', 'The alert is not from X', 'Engager analysis reads reposts, which only X exposes'],
            ['Too many low-value alerts', 'A keyword is too broad, or the threshold is too low', 'Mark them False Positive and ask an administrator to retune the keyword'],
            ['A tab is missing', 'Your account does not have access to it', 'Ask an administrator to check Settings → Access Management'],
            ['Video will not download', 'Some platform videos are stream-only', 'Open the original post using the link on the card'],
            ['Translate returns nothing', 'The post has no text — image or video only', 'Nothing to translate; judge it from the media'],
            ['Top 50 takes a long time', 'It is ranking thousands of alerts with the AI', 'Expected. Leave it running for about a minute'],
          ],
        },
      ],
    },
  ],
};

export default alerts;
