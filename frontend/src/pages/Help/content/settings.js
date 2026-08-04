/**
 * Help content — Settings & Profiles module.
 *
 * Block types: p | steps | shot | callout | table | list | fields
 */

const settings = {
  id: 'settings',
  title: 'Settings & Profiles',
  icon: 'SettingsIcon',
  summary:
    'The control room for the whole platform — which accounts are watched and how often, what counts as high risk, the keywords that raise alerts, the notice templates, and who is allowed to see what.',
  sections: [
    // ══════════════════════════════════════════ START HERE
    {
      id: 'overview',
      group: 'Start here',
      groupBlurb: 'What lives in Settings, and how changes are saved',
      icon: 'Compass',
      blurb: 'The six tabs, what each one controls, and who can open them.',
      title: 'The Settings screen',
      blocks: [
        {
          type: 'p',
          text:
            'Settings is where the platform is configured rather than used. Everything here changes what SOCEYE collects, how it scores what it finds, and what other officers are allowed to open. Six tabs sit across the top, and the tab you are on is remembered in the address bar — so a browser Back returns you to the tab you came from, not to the first one.',
        },
        {
          type: 'shot',
          src: '/help/settings/settings_tabs.png',
          alt: 'The Settings page on the Configuration tab',
          caption: 'The Settings page. The six tabs run across the top; Configuration is the default.',
          markers: [
            { n: 1, x: 27.7, y: 13.3, side: 'top', at: 20, label: 'The six tabs', text: 'Configuration, Profiles, Keywords, Report Templates, Access Management, Policy Manager. The one you are on is remembered in the address bar.' },
            { n: 2, x: 9.4, y: 21, side: 'left', at: 24, label: 'Profile Monitoring', text: 'How often each category is checked, per platform. Covered under “Profile Monitoring frequency”.' },
            { n: 3, x: 39.3, y: 21, side: 'top', at: 55, label: 'Risk Levels', text: 'The two numbers that split every alert into high, medium and low.' },
            { n: 4, x: 71.9, y: 21, side: 'right', at: 24, label: 'Viral Alerts', text: 'Engagement thresholds per platform, with their own on/off switch.' },
            { n: 5, x: 9.7, y: 71.5, side: 'left', at: 74, label: 'Events Monitoring', text: 'Separate collection intervals for event feeds — all four platforms.' },
            { n: 6, x: 42.3, y: 71.5, side: 'bottom', at: 46, label: 'Grievance Monitoring', text: 'Separate again, and only X and Facebook.' },
          ],
        },
        {
          type: 'table',
          head: ['Tab', 'What it controls'],
          rows: [
            ['**Configuration**', 'How often each platform is checked, what score counts as high risk, and when a post is treated as going viral.'],
            ['**Profiles**', 'The accounts being monitored — add, edit, pause and delete them.'],
            ['**Keywords**', 'Words and phrases that raise an alert when they appear in collected content.'],
            ['**Report Templates**', 'The DOCX letters used to generate official notices from an alert.'],
            ['**Access Management**', 'Officer accounts and which pages each of them can open.'],
            ['**Policy Manager**', 'The category definitions the AI uses when it decides what a post is.'],
          ],
        },
        {
          type: 'callout',
          tone: 'warn',
          title: 'Access Management is Super Admin only',
          text:
            'The tab is visible to everyone, but only a Super Admin can actually open it. If you are Level 1 or Level 2 and you click it, you are not shown an error — you are sent straight back to the Dashboard and out of Settings. That is expected behaviour, not a fault.',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'saving',
      group: 'Start here',
      icon: 'Save',
      blurb: 'Nothing on the Configuration tab is live until you save it.',
      title: 'Saving changes',
      blocks: [
        {
          type: 'p',
          text:
            'Changes on the **Configuration** tab are held until you save them. Edit any value and an amber **You have unsaved changes** bar appears with **Discard** and **Save All Changes**. Switching tabs with unsaved edits raises a dialog offering **Discard** or **Save & Continue**.',
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'The other tabs save immediately',
          text:
            'Only Configuration works this way. Everywhere else — adding a keyword, deleting a profile, saving a template — takes effect as soon as you confirm it. There is no undo.',
        },
      ],
    },

    // ══════════════════════════════════════════ PROFILES
    {
      id: 'profiles-screen',
      group: 'Profiles',
      groupBlurb: 'The accounts SOCEYE watches',
      icon: 'Users',
      blurb: 'Platform tabs, the counters, filters, and the profile table.',
      title: 'The Profiles tab',
      blocks: [
        {
          type: 'p',
          text:
            'A profile is one social media account that SOCEYE collects content from. Everything the platform later flags — alerts, risk scores, frequent engagers — starts from a profile being monitored here.',
        },
        {
          type: 'shot',
          src: '/help/settings/settings_profiles.png',
          alt: 'The Profiles tab inside Settings',
          caption: 'Profile Management. One platform is always selected — X is the default. Handles, names and pictures are blurred throughout this guide.',
          markers: [
            { n: 1, x: 7.2, y: 27.8, side: 'left', at: 28, label: 'Platform pills', text: 'X (Twitter), Instagram, Facebook, YouTube, each with its profile count. Pick one — there is no “All” view.' },
            { n: 2, x: 94.4, y: 19.5, side: 'top', at: 86, label: 'Add Profile', text: 'Opens the form that creates the person record and their handles together.' },
            { n: 3, x: 37.6, y: 39.3, side: 'top', at: 38, label: 'The counters', text: 'All four apply to the selected platform only. The last three open Alerts already filtered.' },
            { n: 4, x: 16.2, y: 53.3, side: 'left', at: 55, label: 'Search and filters', text: 'Search matches name, handle, alias, mobile, FIR and district. Category and Status narrow it further.' },
            { n: 5, x: 89.6, y: 64.2, side: 'right', at: 58, label: 'Resume All / Pause All', text: 'Acts on the filtered list shown by the “Showing N of M” line — not the whole database.' },
            { n: 6, x: 93.5, y: 79.6, side: 'right', at: 80, label: 'Row actions', text: 'Edit, pause or resume, and delete. Clicking the row itself opens the linked Person of Interest instead.' },
          ],
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'There is no “All platforms” view',
          text:
            'The platform pills are a choice of one, not a filter you can clear. X is selected when the tab opens, and every counter, filter and row below applies only to the platform you pick.',
        },
        {
          type: 'table',
          head: ['Column', 'What it shows'],
          rows: [
            ['**Handle**', 'Platform icon, the handle, and a link out to the live account. A blue tick here means the account is marked official.'],
            ['**Display Name**', 'Profile picture and name as it appears on the platform.'],
            ['**Last Checked**', 'When SOCEYE last fetched from this account, or **Never** if it has not run yet.'],
            ['**Status**', '**Active** (green) or **Paused** (amber).'],
            ['**Actions**', 'Edit, pause or resume, and delete — three icons at the end of every row.'],
          ],
        },
        {
          type: 'callout',
          tone: 'tip',
          title: 'Clicking a row opens the person, not the account',
          text:
            'Clicking anywhere on a row — other than the checkbox, the action buttons or the outward link — opens the linked Person of Interest profile. If that profile does not exist yet you get “No POI profile linked to this source yet”, which means the account was added without a person record behind it.',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'add-profile',
      group: 'Profiles',
      icon: 'UserPlus',
      blurb: 'Every field on the Add Profile form, and the one rule that blocks saving.',
      title: 'Adding a profile',
      blocks: [
        {
          type: 'p',
          text:
            'Click **Add Profile** at the top right. One form creates both the person record and the social accounts attached to them, so you fill in who the person is first, then list the handles to watch.',
        },
        {
          type: 'shot',
          src: '/help/settings/settings_add_profile.png',
          alt: 'The Add Profile dialog showing the person details',
          caption: 'The top of the Add Profile form — the person record.',
          markers: [
            { n: 1, x: 13.6, y: 16.2, side: 'left', at: 16, label: 'Real Name', text: 'Who the profile belongs to. Everything else on this block is optional reference detail.' },
            { n: 2, x: 43, y: 21.6, side: 'right', at: 20, label: 'Add Alias / Number / Email', text: 'These fields start empty — click the link to add a row, and again for each extra one.' },
            { n: 3, x: 13, y: 27.7, side: 'left', at: 32, label: 'Category', text: 'Decides how often the account is checked, using the intervals on the Configuration tab. Defaults to Others.' },
            { n: 4, x: 72.9, y: 94, side: 'bottom', at: 70, label: 'Add Source', text: 'Saves the profile. It fails unless at least one social handle has been added further down.' },
          ],
        },
        {
          type: 'p',
          text:
            'Only **Real Name** and **Category** shape how the profile is treated. Everything else — aliases, mobile, email, address, PS limits, district, IP, device identifiers, FIRs, linked incidents, WhatsApp — is reference detail. Fill in what you have; blanks are fine.',
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'Two fields fill themselves in',
          text:
            '**No of times escalated to Intermediaries** counts up on its own. **User ID (Auto)** is fetched from the platform once you type a valid handle.',
        },
        {
          type: 'shot',
          src: '/help/settings/settings_add_profile_social.png',
          alt: 'The Social Media Profiles section of the Add Profile dialog',
          caption: 'Scroll down for Social Media Profiles — one block per platform.',
          markers: [
            { n: 1, x: 16.5, y: 20.9, side: 'left', at: 20, label: 'Social Media Profiles', text: 'Four blocks, one per platform, each showing how many handles it holds.' },
            { n: 2, x: 28.1, y: 39.9, side: 'left', at: 40, label: 'Identifier / Handle', text: 'Required. Typing a valid handle starts the lookup that fills User ID.' },
            { n: 3, x: 28.1, y: 49.1, side: 'left', at: 52, label: 'User ID (Auto)', text: 'Filled by the platform lookup — leave it alone.' },
            { n: 4, x: 45.5, y: 63.8, side: 'bottom', at: 38, label: 'Active toggle', text: 'On by default. Turn it off to add the handle on record without collecting from it yet.' },
            { n: 5, x: 15.5, y: 70.2, side: 'left', at: 72, label: 'Add another', text: 'Adds a second handle on the same platform. One person can hold several.' },
            { n: 6, x: 88.3, y: 79.5, side: 'right', at: 80, label: 'Empty platforms', text: 'Show “No … profile linked” with an Add Profile link instead.' },
          ],
        },
        {
          type: 'steps',
          title: 'Adding the accounts to watch',
          items: [
            { text: 'Scroll to **Social Media Profiles** and find the platform you want. If it already has a handle, click **Add another X Profile**; if it is empty, click the **Add Profile** link beside it.' },
            { text: 'Enter the **Identifier / Handle** — this is required, and typing it triggers the lookup that fills User ID.' },
            { text: 'Enter a **Display Name** so the account is recognisable in lists.' },
            { text: 'Set **Category** and **Priority** (High, Medium or Low) for this specific handle.', note: 'Category defaults to the one on the person record, but you can override it per handle. Priority defaults to Medium.' },
            { text: 'Leave the **Active** toggle on unless you want the handle recorded but not yet collected from.' },
            { text: 'Repeat for every handle the person uses. One person can hold several accounts across all four platforms.' },
            { text: 'Click **Add Source** at the bottom to save.' },
          ],
        },
        {
          type: 'callout',
          tone: 'warn',
          title: 'At least one social handle is required',
          text:
            'Saving with no handles fails with “Please add at least one Social Media profile to monitor”. A person record on its own is not a monitorable profile — there has to be something to collect from.',
        },
        {
          type: 'p',
          text:
            '**Previously Deleted Profiles** at the bottom is a plain record of accounts the person used before and has since removed — X, Facebook, Instagram, YouTube and WhatsApp. Nothing is collected from these; they are there so the history is not lost.',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'profile-actions',
      group: 'Profiles',
      icon: 'Settings2',
      blurb: 'Pausing, editing, deleting, and acting on many profiles at once.',
      title: 'Managing existing profiles',
      blocks: [
        {
          type: 'table',
          head: ['Action', 'Where', 'What happens'],
          rows: [
            ['**Edit**', 'Pencil on the row', 'Reopens the same form as Add Profile, titled **Edit Profile**, with everything filled in.'],
            ['**Pause / Resume**', 'Pause or play icon on the row', 'Stops or restarts collection for that one account. The profile and everything already collected stay exactly as they are.'],
            ['**Delete**', 'Bin on the row', 'Asks for confirmation, then removes the profile. This cannot be undone.'],
            ['**Resume All / Pause All**', 'Above the table', 'Applies to every profile currently shown by your filters — not the whole database.'],
            ['**Delete Selected**', 'Appears once rows are ticked', 'Bulk delete, with a confirmation showing how many will go.'],
            ['**Export**', 'Top right', 'Downloads a CSV of the current platform — name, handle, platform, category and status.'],
            ['**Refresh**', 'Top right', 'Re-reads the list from the server.'],
          ],
        },
        {
          type: 'callout',
          tone: 'warn',
          title: 'Pause All and Resume All follow your filters',
          text:
            'They act on the filtered list, which always includes the selected platform tab. With X selected and Category set to Political, Pause All pauses every political X profile — and nothing else. Check what the “Showing N of M” line says before you click.',
        },
        {
          type: 'p',
          text:
            'The table shows 20 profiles per page, with **Previous** and **Next** underneath when there are more. Ticking rows keeps them selected while you move between pages.',
        },
      ],
    },

    // ══════════════════════════════════════════ CONFIGURATION
    {
      id: 'monitoring',
      group: 'Configuration',
      groupBlurb: 'How often SOCEYE looks, and what it treats as serious',
      icon: 'Activity',
      blurb: 'Set how often each category is checked, per platform.',
      title: 'Profile Monitoring frequency',
      blocks: [
        {
          type: 'p',
          text:
            'The **Profile Monitoring** card sets how often SOCEYE fetches new content from monitored accounts. It is a grid: pick a platform along the top, then set an interval in hours for each of the seven categories — Political, Communal, Trouble Makers, Defamation, Narcotics, History Sheeters and Others.',
        },
        {
          type: 'shot',
          src: '/help/settings/settings_config_row1.png',
          alt: 'Profile Monitoring, Risk Levels and Viral Alerts cards',
          caption: 'The Profile Monitoring card. The platform you pick decides which set of intervals you are editing.',
          markers: [
            { n: 1, x: 30.5, y: 18.2, side: 'top', at: 30, label: 'Master switch', text: 'Off stops profile collection on all four platforms and greys out every box below.' },
            { n: 2, x: 16.7, y: 30.9, side: 'left', at: 32, label: 'Platform', text: 'X, Instagram, Facebook, YouTube. Each holds its own set of seven category intervals.' },
            { n: 3, x: 5, y: 66, side: 'left', at: 68, label: 'The seven categories', text: 'Political, Communal, Trouble Makers, Defamation, Narcotics, History Sheeters, Others — matching the category on each handle.' },
            { n: 4, x: 28.1, y: 66.4, side: 'bottom', at: 28, label: 'Interval in hours', text: 'Whole hours only. Default is 1 everywhere.' },
          ],
        },
        {
          type: 'p',
          text:
            'Every combination has its own value, so a political X account can be checked hourly while a narcotics YouTube channel is checked once a day. A profile follows the schedule for the category set on its handle. The default everywhere is **1 hour**.',
        },
        {
          type: 'callout',
          tone: 'warn',
          title: 'Whole hours, and the switch stops everything',
          text:
            'These boxes take whole hours only — 0 does not mean “constantly”, so leave it at 1 or more. Turning the card switch off stops profile collection on all four platforms; Events and Grievance monitoring have their own switches and are unaffected.',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'risk-levels',
      group: 'Configuration',
      icon: 'ShieldAlert',
      blurb: 'The two numbers that split every alert into high, medium and low.',
      title: 'Risk Levels',
      blocks: [
        {
          type: 'p',
          text:
            'Every analysed post gets a risk score from 0 to 100. The **Risk Levels** card turns that score into the High, Medium and Low badges you see on alerts, using two cut-off points.',
        },
        {
          type: 'shot',
          src: '/help/settings/settings_config_row1.png',
          alt: 'The Risk Levels card',
          caption: 'The Risk Levels card, showing the bands each threshold produces.',
          markers: [
            { n: 1, x: 50, y: 37.9, side: 'top', at: 48, label: 'High Risk threshold', text: 'Scores at or above this are High. Default 70.' },
            { n: 2, x: 63.7, y: 28.9, side: 'right', at: 22, label: 'Live range readout', text: 'Updates as you type, so you can see what each band will cover.' },
            { n: 3, x: 50, y: 55.5, side: 'bottom', at: 48, label: 'Medium Risk threshold', text: 'Scores from here up to one below the high threshold. Default 40.' },
            { n: 4, x: 37.4, y: 64.1, side: 'left', at: 66, label: 'Low Risk', text: 'Everything underneath. Calculated for you — there is no box to set.' },
          ],
        },
        {
          type: 'table',
          head: ['Band', 'Range', 'Set by'],
          rows: [
            ['**High Risk**', 'From the high threshold up to 100', 'The **High Risk** box. Default 70.'],
            ['**Medium Risk**', 'From the medium threshold up to one below the high threshold', 'The **Medium Risk** box. Default 40.'],
            ['**Low Risk**', '0 up to one below the medium threshold', 'Calculated — there is nothing to set.'],
          ],
        },
        {
          type: 'p',
          text:
            'The card shows you the resulting ranges as you type, so you can see immediately what each band will cover. Lowering the high threshold produces more high-risk alerts; raising it produces fewer.',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'viral-alerts',
      group: 'Configuration',
      icon: 'Zap',
      blurb: 'How a post gets flagged for spreading fast — and what the numbers really mean.',
      title: 'Viral Alerts',
      blocks: [
        {
          type: 'p',
          text:
            'Viral alerts are separate from risk scoring. They fire when a post picks up engagement quickly, regardless of what it says. The table sets four numbers per platform: **Low**, **Med**, **High** and **Hrs**.',
        },
        {
          type: 'shot',
          src: '/help/settings/settings_config_row1.png',
          alt: 'The Viral Alerts card',
          caption: 'The Viral Alerts table — four numbers for each of the four platforms.',
          markers: [
            { n: 1, x: 97, y: 18.2, side: 'top', at: 94, label: 'Master switch', text: 'Off means no post is ever raised for spreading fast, on any platform.' },
            { n: 2, x: 83.5, y: 30.7, side: 'top', at: 76, label: 'Low / Med / High', text: 'Engagement counts. Each of likes, reposts, comments and views is checked against these same three numbers.' },
            { n: 3, x: 95.5, y: 30.7, side: 'right', at: 26, label: 'Hrs', text: 'A freshness window, not a rate. A post is only considered while it is younger than this many hours.' },
            { n: 4, x: 72, y: 38.7, side: 'right', at: 48, label: 'One row per platform', text: 'X, Instagram, Facebook and YouTube each get their own figures.' },
          ],
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'How the four numbers actually work',
          text:
            '**Hrs** is a freshness window — a post is only ever considered while it is younger than that many hours. Inside that window, likes, reposts, comments and views are each compared against the same three numbers, and the highest band any one of them reaches becomes the alert priority. So a post that crosses the High figure on views alone is a High viral alert, even if nothing else moves.',
        },
        {
          type: 'callout',
          tone: 'tip',
          title: 'Set them against your fastest metric',
          text:
            'The thresholds apply to each metric separately, not to a total. Views climb far quicker than replies, so a figure that suits comments will fire constantly on views.',
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'events-grievances',
      group: 'Configuration',
      icon: 'Radio',
      blurb: 'Separate collection intervals for Events and Grievances.',
      title: 'Events and Grievance monitoring',
      blocks: [
        {
          type: 'p',
          text:
            'The second row of the Configuration tab holds two more cards, each with its own on/off switch and its own intervals in hours. These are independent of profile monitoring — an event keeps collecting even if profile monitoring is switched off.',
        },
        {
          type: 'fields',
          items: [
            { name: 'Events Monitoring', text: 'How often each event feed is refreshed. Four platforms: X, Instagram, Facebook and YouTube.' },
            { name: 'Grievance Monitoring', text: 'How often tagged posts are pulled in for the Grievances module. Only **X** and **Facebook** — grievances are not collected from Instagram or YouTube.' },
          ],
        },
      ],
    },

    // ══════════════════════════════════════════ KEYWORDS
    {
      id: 'keywords',
      group: 'Keywords',
      groupBlurb: 'Words that raise an alert',
      icon: 'Hash',
      blurb: 'Adding keywords in three languages, and what Scan does.',
      title: 'Managing keywords',
      blocks: [
        {
          type: 'p',
          text:
            'Keywords are words and phrases that raise an alert when they turn up in collected content. They sit in three buckets — **Violence**, **Threat** and **Hate** — shown as sub-tabs, with every keyword in that bucket listed as a chip tagged with its language.',
        },
        {
          type: 'shot',
          src: '/help/settings/settings_keywords.png',
          alt: 'The Keywords tab',
          caption: 'The Keywords tab, with the Violence category open.',
          markers: [
            { n: 1, x: 5.4, y: 40, side: 'left', at: 40, label: 'Category sub-tabs', text: 'Violence, Threat and Hate. Each holds its own list.' },
            { n: 2, x: 89.9, y: 31.4, side: 'top', at: 82, label: 'Scan', text: 'Re-runs analysis over the last 24 hours only — see the warning below.' },
            { n: 3, x: 94.3, y: 31.4, side: 'right', at: 24, label: 'Add', text: 'Opens the dialog for category, language and the keyword itself.' },
            { n: 4, x: 3.9, y: 47.5, side: 'left', at: 56, label: 'Language badge', text: 'EN, HI or TE on every chip, so you can see at a glance what a keyword is written in.' },
            { n: 5, x: 16.6, y: 62, side: 'bottom', at: 18, label: 'The keywords', text: 'Hover a chip and click the bin to remove it. It stops matching immediately.' },
          ],
        },
        {
          type: 'steps',
          title: 'Adding a keyword',
          items: [
            { text: 'Click **Add**.' },
            { text: 'Choose a **Category** — Violence, Threat or Hate.' },
            { text: 'Choose a **Language** — English, Hindi, Telugu or All.' },
            { text: 'Type the keyword or phrase.' },
            { text: 'Click **Add**. The chip appears under its category straight away.' },
          ],
        },
        {
          type: 'callout',
          tone: 'tip',
          title: 'Typing Telugu and Hindi without a keyboard',
          text:
            'Pick Telugu or Hindi and an **Auto-transliterate** switch appears. With it on, type the word phonetically in English letters and suggestions appear in the real script — click one to use it, or keep typing and it converts on the space bar. The switch is not offered for English or All, which need no conversion.',
        },
        {
          type: 'p',
          text:
            'To remove a keyword, hover its chip and click the bin. It stops matching immediately; alerts already raised from it are untouched.',
        },
        {
          type: 'callout',
          tone: 'warn',
          title: 'Scan only reaches back 24 hours',
          text:
            'The **Scan** button re-runs analysis over content collected in the **last 24 hours** using the current keyword list, and can raise new alerts from posts already in the system. It is for catching up after adding a keyword — it will not re-scan your whole history, and older content stays as it was scored at the time.',
        },
      ],
    },

    // ══════════════════════════════════════════ TEMPLATES
    {
      id: 'templates',
      group: 'Report Templates',
      groupBlurb: 'The letters generated from an alert',
      icon: 'FileText',
      blurb: 'Upload a DOCX, edit it, and set the default per platform.',
      title: 'Uploading a template',
      blocks: [
        {
          type: 'p',
          text:
            'A report template is the letter used when an officer generates an official notice from an alert. You upload an ordinary Word document, SOCEYE converts it to editable content, and from then on alert data is filled into it automatically.',
        },
        {
          type: 'shot',
          src: '/help/settings/settings_templates.png',
          alt: 'The Report Templates tab',
          caption: 'The Report Templates tab with the Placeholders Reference expanded.',
          markers: [
            { n: 1, x: 91.7, y: 21.6, side: 'top', at: 86, label: 'Upload Template', text: 'Starts the two-step flow — pick the DOCX, then edit it before it is saved.' },
            { n: 2, x: 9.8, y: 28.2, side: 'left', at: 28, label: 'Placeholders Reference', text: 'Click the bar to expand or collapse the tag list.' },
            { n: 3, x: 54.3, y: 67.7, side: 'right', at: 62, label: 'ORIGINAL_AUTHOR', text: 'Listed here but NOT filled in by the system. Do not use it — see the warning below.' },
            { n: 4, x: 6.4, y: 71.4, side: 'left', at: 74, label: 'INTENT', text: 'The other tag that is advertised but never substituted.' },
            { n: 5, x: 13.7, y: 82.3, side: 'bottom', at: 20, label: 'A saved template', text: 'Its platform badge, and “Auto-fill mode” when the document contains no placeholders at all.' },
          ],
        },
        {
          type: 'steps',
          title: 'Adding a template',
          items: [
            { text: 'Click **Upload Template**.' },
            { text: 'Give it a **Template Name** that says what it is — this is what officers pick from later.' },
            { text: 'Choose the **Platform** it is for: All Platforms, X (Twitter), YouTube, Facebook or Instagram.' },
            { text: 'Drag a **.docx** file onto the drop zone, or click to browse.', note: 'Only .doc and .docx are accepted — anything else is rejected with a message.' },
            { text: 'Optionally turn on **Set as default for this platform**.' },
            { text: 'Click **Next — Parse & Edit**. The document is converted and opens in a full-page editor.' },
            { text: 'Check it read across correctly, fix anything that did not, then click **Save Template**.' },
          ],
        },
        {
          type: 'callout',
          tone: 'tip',
          title: 'The editor step is not optional',
          text:
            'Word-to-web conversion is never perfect — repair spacing, headings and tables here before the template is used on real notices. The **Data Tags** panel lists every field you can drop in; click one to copy it.',
        },
        {
          type: 'table',
          head: ['On a saved template', 'What it does'],
          rows: [
            ['**Pencil** or **eye**', 'Both reopen the same editor. There is no separate read-only view.'],
            ['**Star**', 'Makes it the default for its platform. Only shown when it is not already the default.'],
            ['**Bin**', 'Deletes it.'],
            ['**Default badge**', 'Marks the template used automatically for that platform.'],
            ['**Auto-fill mode**', 'Means the document contains no placeholders — alert data is still filled in, just without you placing tags.'],
          ],
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'placeholders',
      group: 'Report Templates',
      icon: 'BrainCircuit',
      blurb: 'The tags that get replaced with real alert data — and two that do not.',
      title: 'Placeholders',
      blocks: [
        {
          type: 'p',
          text:
            'A placeholder is a tag in double braces that is swapped for real data when a notice is generated. Put `{{AUTHOR_HANDLE}}` in the letter and the flagged account handle appears there. They can be typed into the Word file before uploading, or added in the editor afterwards.',
        },
        {
          type: 'table',
          head: ['Placeholder', 'Filled with'],
          rows: [
            ['`{{SERIAL_NUMBER}}`', 'The report reference number.'],
            ['`{{DATE}}` / `{{DATE_LONG}}`', 'Today, as dd.mm.yyyy or written out in full.'],
            ['`{{PLATFORM}}`', 'Platform name — X, YouTube and so on.'],
            ['`{{PLATFORM_OPERATOR}}`', 'The operating company, such as X Corp. or Meta.'],
            ['`{{PLATFORM_DOMAIN}}`', 'The platform web address.'],
            ['`{{AUTHOR_NAME}}` / `{{AUTHOR_HANDLE}}`', 'Display name, and handle with the @ added if missing.'],
            ['`{{PROFILE_URL}}` / `{{CONTENT_URL}}`', 'Links to the account and to the flagged post.'],
            ['`{{CONTENT_TEXT}}`', 'The text of the flagged post.'],
            ['`{{POST_DATE}}`', 'When the post was published.'],
            ['`{{LEGAL_SECTIONS}}`', 'Full sections with their descriptions.'],
            ['`{{LEGAL_SECTIONS_NUMBERS}}`', 'Just the section numbers.'],
            ['`{{CATEGORY}}` / `{{RISK_LEVEL}}`', 'The violation category, and HIGH / MEDIUM / LOW.'],
            ['`{{IS_REPOST}}`', 'Yes or No.'],
            ['`{{ALERT_DESCRIPTION}}`', 'The alert description text.'],
            ['`{{DEPARTMENT_NAME}}` / `{{GOVERNMENT_NAME}}`', 'The department and government names.'],
          ],
        },
        {
          type: 'callout',
          tone: 'danger',
          title: 'Two placeholders in the reference list do not work',
          text:
            '`{{ORIGINAL_AUTHOR}}` and `{{INTENT}}` are listed in the Placeholders Reference panel but are not filled in by the system. If you put them in a template they are printed literally, braces and all, on the finished notice. Do not use them.',
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'Department and government names are fixed',
          text:
            'There is no field in Settings for these. `{{DEPARTMENT_NAME}}` and `{{GOVERNMENT_NAME}}` fall back to the values set on the server, so they will read the same on every notice until an administrator changes them there.',
        },
      ],
    },

    // ══════════════════════════════════════════ ACCESS & POLICIES
    {
      id: 'access',
      group: 'Access & Policies',
      groupBlurb: 'Officer accounts and AI category definitions',
      icon: 'KeyRound',
      blurb: 'Create officers and choose the pages each one can open. Super Admin only.',
      title: 'Access Management',
      blocks: [
        {
          type: 'p',
          text:
            'Access Management creates officer accounts and decides which pages each of them can open. Only a Super Admin can use it — anyone else who clicks the tab is redirected to the Dashboard without explanation.',
        },
        {
          type: 'p',
          text:
            'The screen is split in two: officers on the left, and the page permissions for whoever is selected on the right. Pick an officer from the dropdown or the list underneath, and their current access loads into the right-hand panel.',
        },
        {
          type: 'table',
          head: ['Role', 'Means'],
          rows: [
            ['**Super Admin**', 'Unrestricted. Every page and every feature, with no permission grid to set — the right-hand panel just says so.'],
            ['**Level 2**', 'Only the pages ticked for them.'],
            ['**Level 1**', 'Only the pages ticked for them. The default for a new officer.'],
          ],
        },
        {
          type: 'steps',
          title: 'Creating an officer',
          items: [
            { text: 'Click **New**.' },
            { text: 'Enter **Full Name**, **Email Address** and a **Password** of at least six characters.' },
            { text: 'Choose the **Role**.' },
            { text: 'Click **Create Officer**.' },
            { text: 'Select them from the list and tick the pages they need, then click **Save Permissions**.' },
          ],
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'Ticking a page grants all of its features',
          text:
            'Alerts, SM Handles and Grievances have sub-features. Ticking the page switches them all on — untick the ones that officer should not have. A page left on with no features ticked will not save.',
        },
        {
          type: 'list',
          items: [
            'Access Management is not in the grid, so it cannot be granted — only a Super Admin ever reaches it.',
            '**Select All** grants every page except Access Management; **Clear** removes everything.',
            'A **Custom** badge means that officer’s permissions differ from their role default.',
            'You cannot delete your own account, and Delete is hidden for Super Admins.',
            'On **Edit Details**, a blank password keeps the existing one.',
          ],
        },
      ],
    },

    // ────────────────────────────────────────────────────────────────────
    {
      id: 'policies',
      group: 'Access & Policies',
      icon: 'Scale',
      blurb: 'The category definitions that drive AI analysis.',
      title: 'Policy Manager',
      blocks: [
        {
          type: 'p',
          text:
            'A policy tells the AI what a category actually means. The **AI Definition** you write here is what the model reads when it decides whether a post is hate speech, communal, or anything else — so the wording has a direct effect on what gets flagged across the whole platform.',
        },
        {
          type: 'shot',
          src: '/help/settings/settings_policies.png',
          alt: 'The Policy Manager tab',
          caption: 'Each card is one policy. Click the card body to open it.',
          markers: [
            { n: 1, x: 92.5, y: 26, side: 'top', at: 86, label: 'New Policy', text: 'Opens the same slide-over panel used for editing, but empty.' },
            { n: 2, x: 18.8, y: 42.3, side: 'left', at: 42, label: 'Search policies', text: 'Filters the cards as you type.' },
            { n: 3, x: 7, y: 54.9, side: 'left', at: 57, label: 'Category badge', text: 'The stored name. Underscores are shown back as spaces here.' },
            { n: 4, x: 17.9, y: 63.5, side: 'bottom', at: 16, label: 'AI Definition', text: 'What the model reads when deciding whether a post belongs in this category. Click anywhere on the card to edit it.' },
            { n: 5, x: 20.9, y: 75.4, side: 'bottom', at: 38, label: 'Legal Ref and Rules', text: 'How many legal sections and platform rules are mapped to this policy.' },
          ],
        },
        {
          type: 'steps',
          title: 'Creating or changing a policy',
          items: [
            { text: 'Click **New Policy**, or click an existing card to edit it. A panel slides in from the right.' },
            { text: 'On **General**, set the **Category Name** and write the **AI Definition**. Both are required.' },
            { text: 'On **Legal Framework**, map the sections that apply — pick from **Add Existing Section**, or click **New** and enter a section code and description.' },
            { text: 'On **Platform Rules**, add the platform policies breached, under Meta, X or YouTube.' },
            { text: 'Click **Save Changes**. Editing an existing policy asks you to confirm first; creating a new one saves straight away.' },
          ],
        },
        {
          type: 'callout',
          tone: 'warn',
          title: 'Punctuation in a category name is silently dropped',
          text:
            'On save, spaces are converted to underscores and anything that is not a letter, number or underscore is deleted without warning. Spaces survive the round trip — the card shows the underscores back as spaces — but punctuation does not. Typed as **Hate Speech!**, the policy is stored as `Hate_Speech` and the exclamation mark is gone for good. Keep names to plain words.',
        },
        {
          type: 'callout',
          tone: 'warn',
          title: 'Facebook and Instagram share one rule list',
          text:
            'The **Meta (Facebook & Instagram)** group is a single list saved to both platforms. There is no way to give Facebook and Instagram different rules from this screen.',
        },
        {
          type: 'callout',
          tone: 'danger',
          title: 'Closing the panel discards your edits without warning',
          text:
            'Unlike the Configuration tab, **Cancel** and clicking outside the panel throw away everything you have typed with no prompt — even though **Save Changes** has clearly lit up. Save before you close.',
        },
        {
          type: 'callout',
          tone: 'warn',
          title: 'Policy Manager is not restricted',
          text:
            'Any officer who can open the Settings page can create, change and delete policies here, regardless of role. Because policies steer AI analysis for everyone, treat access to Settings as the control and check with your administrator before editing a live policy.',
        },
      ],
    },

    // ══════════════════════════════════════════ REFERENCE
    {
      id: 'troubleshooting',
      group: 'Reference',
      groupBlurb: 'When something is not behaving',
      icon: 'LifeBuoy',
      blurb: 'Common problems and what to check.',
      title: 'Troubleshooting',
      blocks: [
        {
          type: 'table',
          head: ['Problem', 'What to check'],
          rows: [
            ['Nothing is being collected from a profile', 'Is its **Status** Active, not Paused? Is the **Profile Monitoring** switch on? And is the interval for that category and platform sensible — a 24-hour setting will look like nothing is happening.'],
            ['A profile I added is not in the list', 'Check the platform pill. The list only ever shows one platform, and it opens on X — a YouTube channel you just added will not appear until you click YouTube.'],
            ['**Last Checked** still says Never', 'The first fetch has not run yet. Wait one interval for that category, then use **Refresh**.'],
            ['My Configuration change had no effect', 'It was probably not saved. Look for the amber **You have unsaved changes** bar — if it is there, click **Save All Changes**.'],
            ['Adding a keyword raised no alerts', 'Keywords apply to content collected from then on. Use **Scan** to re-check the last 24 hours; anything older will not be revisited.'],
            ['Too many or too few high-risk alerts', 'Adjust the **High Risk** threshold on the Risk Levels card. Lower it to catch more, raise it to catch less.'],
            ['Viral alerts fire constantly', 'The numbers are compared against views as well as likes and replies. Raise the thresholds to suit whichever metric moves fastest on that platform, or shorten the **Hrs** window.'],
            ['A notice printed `{{SOMETHING}}` literally', 'That placeholder is not supported. `{{ORIGINAL_AUTHOR}}` and `{{INTENT}}` are the two listed in the app that do not work — remove them from the template.'],
            ['Clicking Access Management throws me out to the Dashboard', 'You are not a Super Admin. Only they can open that tab.'],
            ['My Policy Manager edits vanished', 'The panel was closed without saving. Cancel and clicking outside discard changes silently — reopen the policy and redo them, then click **Save Changes**.'],
          ],
        },
      ],
    },
  ],
};

export default settings;
