/**
 * Help content — Settings.
 * Block types: p | steps | list | table | fields | callout
 */

const settings = {
  id: 'settings',
  title: 'Settings',
  icon: 'SettingsIcon',
  summary:
    'Set what counts as high risk and viral, manage alert keywords, report templates, AI policies, grievance contacts and the look of the app.',
  sections: [
    {
      id: 'overview',
      group: 'Start here',
      groupBlurb: 'What lives in Settings',
      icon: 'Compass',
      blurb: 'The tabs and how changes are saved.',
      title: 'The Settings page',
      blocks: [
        {
          type: 'p',
          text: 'Settings is where SOCEYE is configured. The tab you are on is kept in the address bar, so the browser Back button returns you to it.',
        },
        {
          type: 'table',
          head: ['Tab', 'What it controls'],
          rows: [
            ['**Alerts**', 'The risk bands, viral alert thresholds and the alert keywords.'],
            ['**Platforms**', 'BluGate and which platforms are active. Admins only. See the Platforms & BluGate article.'],
            ['**Report Templates**', 'The Word letters used to generate notices from an alert.'],
            ['**Policy Manager**', 'Category definitions the AI uses to classify posts.'],
            ['**Grievances**', 'Accounts monitored for the Grievances page, and grievance contacts.'],
            ['**Theme**', 'Light or dark mode and the colour of the app.'],
          ],
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'What saves automatically',
          text: 'On **Alerts**, risk bands and viral thresholds wait for you to click **Save changes**. Keywords, templates, policies, grievances and theme take effect as soon as you confirm them.',
        },
        {
          type: 'p',
          text: 'Account and page access is managed on the **Users** page. See the Administration article.',
        },
      ],
    },

    {
      id: 'saving',
      group: 'Start here',
      icon: 'Save',
      blurb: 'The unsaved-changes bar and what it offers.',
      title: 'Saving changes on the Alerts tab',
      blocks: [
        {
          type: 'p',
          text: 'When you edit a risk value, the viral switch or a viral threshold, **Unsaved** appears at the top right with **Discard** and **Save changes**.',
        },
        {
          type: 'p',
          text: 'If you switch tabs with unsaved edits, a dialog asks **Discard** or **Save & Continue**. Closing the browser tab also warns you.',
        },
      ],
    },

    {
      id: 'risk-levels',
      group: 'Alerts',
      groupBlurb: 'What SOCEYE treats as serious',
      icon: 'ShieldAlert',
      blurb: 'The two numbers that split alerts into High, Medium and Low.',
      title: 'Risk levels',
      blocks: [
        {
          type: 'p',
          text: 'Every analysed post gets a risk score from 0 to 100. The **Risk levels** card turns the score into High, Medium and Low using two start points. Drag the two handles on the colour bar, or type the numbers underneath. The bar and the ranges update as you go.',
        },
        {
          type: 'live',
          route: '/settings?tab=general',
          alt: 'Settings, Alerts tab',
          caption: 'The Alerts tab holds risk levels, viral alerts and keywords.',
          height: 900,
          markers: [
            { n: 1, target: { text: 'Alerts' }, label: 'Alerts tab', text: 'The default tab, where alert rules live.' },
            { n: 2, target: { text: 'Risk levels' }, label: 'Risk levels', text: 'Drag the handles or type where Medium and High begin.' },
            { n: 3, target: { text: 'Viral alerts' }, label: 'Viral alerts', text: 'Turn viral alerts on and set levels per platform.' },
            { n: 4, target: { text: 'Alert keywords' }, label: 'Alert keywords', text: 'Words that raise alerts.' },
            { n: 5, target: { placeholder: 'Add keywords, separated by commas' }, label: 'Keyword box', text: 'Type one keyword, or several separated by commas.' },
            { n: 6, target: { text: 'Add' }, label: 'Add', text: 'Saves the keywords.' },
          ],
        },
        {
          type: 'table',
          head: ['Band', 'Range', 'Set by'],
          rows: [
            ['**High**', 'From its start point to 100', 'The right handle, or the **Starts at** box in the High row. Default 70.'],
            ['**Medium**', 'From its start point up to one below High', 'The left handle, or the **Starts at** box in the Medium row. Default 40.'],
            ['**Low**', '0 up to one below Medium', 'Automatic. Everything below Medium.'],
          ],
        },
        {
          type: 'steps',
          items: [
            { text: 'Open **Settings > Alerts**.' },
            { text: 'Drag the two handles, or change **Starts at** for High or Medium. Numbers only.', note: 'Type a score in **Try a score** to see which level it lands in.' },
            { text: 'Click **Save changes**.', note: 'Medium must be at least 1 and below High. A red message appears and saving is blocked until it is fixed.' },
          ],
        },
        {
          type: 'callout',
          tone: 'tip',
          title: 'Getting more or fewer high alerts',
          text: 'Move the High handle left to see more High alerts, or right to see fewer.',
        },
      ],
    },

    {
      id: 'viral-alerts',
      group: 'Alerts',
      icon: 'Zap',
      blurb: 'When a fast-spreading post raises an alert.',
      title: 'Viral alerts',
      blocks: [
        {
          type: 'p',
          text: 'Viral alerts fire when a post gains engagement quickly, whatever it says. The **Viral alerts** card has an **On/Off** switch, and a table with one row per platform, each with the platform logo.',
        },
        {
          type: 'fields',
          items: [
            { name: 'Low', text: 'Engagement count for a low-priority viral alert.' },
            { name: 'Medium', text: 'Engagement count for a medium-priority viral alert.' },
            { name: 'High', text: 'Engagement count for a high-priority viral alert.' },
            { name: 'Window (hours)', text: 'How recent a post must be to be considered, in hours.' },
          ],
        },
        {
          type: 'p',
          text: 'Likes, reposts, comments and views are each compared against the same three numbers. The highest band reached becomes the alert priority. Turn the switch off to stop viral alerts on every platform. In each row Low must be smaller than Medium, and Medium smaller than High. A number that breaks this turns red, and saving is blocked until it is fixed. Click **Save changes** to apply.',
        },
        {
          type: 'callout',
          tone: 'tip',
          title: 'Set for the fastest metric',
          text: 'Views grow much faster than replies. A number that suits comments will fire constantly on views.',
        },
        {
          type: 'p',
          text: 'The rows come from your platforms. If the table says "No platforms yet", connect BluGate and fetch your platforms under the **Platforms** tab first (see "Platforms & BluGate").',
        },
      ],
    },

    {
      id: 'keywords',
      group: 'Alerts',
      icon: 'Tag',
      blurb: 'Words that raise alerts.',
      title: 'Alert keywords',
      blocks: [
        {
          type: 'p',
          text: 'The **Alert keywords** card at the bottom of the Alerts tab lists every keyword, with a total count. Posts that contain one of them raise a risk alert. New keywords are also checked against posts already collected.',
        },
        {
          type: 'steps',
          title: 'Add a keyword',
          items: [
            { text: 'Type it in the box, for example a word or short phrase. To add several at once, separate them with commas.' },
            { text: 'Click **Add**.', note: 'A message tells you if it was already saved and how many earlier posts were queued to be checked again.' },
          ],
        },
        {
          type: 'list',
          items: [
            'Click the pencil on a keyword to edit it, then **Save** (or **Cancel**).',
            'Click the bin to delete it. You are asked to confirm.',
            'With more than eight keywords, a **Search keywords** box appears.',
          ],
        },
      ],
    },

    {
      id: 'templates',
      group: 'Report Templates',
      groupBlurb: 'Letters generated from an alert',
      icon: 'FileText',
      blurb: 'Upload a Word document, edit it, set a default.',
      title: 'Uploading a template',
      blocks: [
        {
          type: 'p',
          text: 'A report template is the letter used when you generate a notice from an alert. You upload an ordinary Word document, edit it in the browser, and alert details are filled in automatically.',
        },
        {
          type: 'live',
          route: '/settings?tab=templates',
          alt: 'Settings, Report Templates tab',
          caption: 'The Report Templates tab lists your letter templates.',
          height: 560,
          markers: [
            { n: 1, target: { text: 'Settings' }, label: 'Settings', text: 'The Settings page, with one tab per area.' },
            { n: 2, target: { text: 'Report Templates' }, label: 'Report Templates tab', text: 'Where report letters are managed.' },
            { n: 3, target: { text: 'Upload any DOCX — edit before saving' }, label: 'Card description', text: 'Any Word document can become a template.' },
            { n: 4, target: { text: 'Upload Template' }, label: 'Upload Template', text: 'Opens the form to upload a DOCX file.' },
          ],
        },
        {
          type: 'steps',
          items: [
            { text: 'Open **Settings > Report Templates** and click **Upload Template**.' },
            { text: 'Enter a **Template Name**, for example "Notice - X".' },
            { text: 'Choose the **Platform** it is for, or all platforms.' },
            { text: 'Drop a `.docx` (or `.doc`) file on the box, or click it to browse.' },
            { text: 'Optionally turn on **Set as default for this platform**.' },
            { text: 'Click **Next — Parse & Edit**. The document opens in an editor.' },
            { text: 'Check it, fix anything that did not convert well, then click **Save Template**.' },
          ],
        },
        {
          type: 'callout',
          tone: 'tip',
          title: 'Use the editor step',
          text: 'Word-to-web conversion is not perfect. Check spacing, headings and tables before using the template on a real notice. The **Data Tags** panel on the right lists every field; click one to copy it.',
        },
        {
          type: 'table',
          head: ['On a saved template', 'What it does'],
          rows: [
            ['**Pencil** or **eye**', 'Both open the editor. Change the text and click **Save Template**.'],
            ['**Star**', 'Makes it the default for its platform. Hidden if it already is.'],
            ['**Bin**', 'Deletes it.'],
            ['**Default** badge', 'Marks the template used automatically for that platform.'],
            ['**Auto-fill mode**', 'The document has no placeholders. Details are still filled in.'],
          ],
        },
        {
          type: 'p',
          text: 'The action icons appear when you hover a template row.',
        },
      ],
    },

    {
      id: 'placeholders',
      group: 'Report Templates',
      icon: 'BrainCircuit',
      blurb: 'The tags replaced by alert data.',
      title: 'Placeholders',
      blocks: [
        {
          type: 'p',
          text: 'A placeholder is a tag in double braces that is replaced with real data when a notice is generated. Type `{{AUTHOR_HANDLE}}` in the letter and the flagged account’s handle appears there. Add them in the Word file or in the editor. Click **Placeholders Reference** on the templates tab to see the list.',
        },
        {
          type: 'table',
          head: ['Placeholder', 'Filled with'],
          rows: [
            ['`{{SERIAL_NUMBER}}`', 'The report reference number.'],
            ['`{{DATE}}` / `{{DATE_LONG}}`', 'Today’s date, short or written out in full.'],
            ['`{{PLATFORM}}`', 'Platform name.'],
            ['`{{PLATFORM_OPERATOR}}`', 'The company that runs the platform.'],
            ['`{{PLATFORM_DOMAIN}}`', 'The platform web address.'],
            ['`{{AUTHOR_NAME}}` / `{{AUTHOR_HANDLE}}`', 'Display name, and handle.'],
            ['`{{PROFILE_URL}}` / `{{CONTENT_URL}}`', 'Links to the account and the flagged post.'],
            ['`{{CONTENT_TEXT}}`', 'The text of the flagged post.'],
            ['`{{POST_DATE}}`', 'When the post was published.'],
            ['`{{LEGAL_SECTIONS}}`', 'Full legal sections with descriptions.'],
            ['`{{LEGAL_SECTIONS_NUMBERS}}`', 'Just the section numbers.'],
            ['`{{CATEGORY}}` / `{{RISK_LEVEL}}`', 'The category, and HIGH, MEDIUM or LOW.'],
            ['`{{IS_REPOST}}`', 'Yes or No.'],
            ['`{{ALERT_DESCRIPTION}}`', 'The alert description.'],
            ['`{{DEPARTMENT_NAME}}` / `{{GOVERNMENT_NAME}}`', 'The department and government names.'],
          ],
        },
        {
          type: 'callout',
          tone: 'danger',
          title: 'Two listed placeholders are not filled in',
          text: '`{{ORIGINAL_AUTHOR}}` and `{{INTENT}}` appear in the Placeholders Reference but are not replaced. They print literally on the notice. Do not use them.',
        },
      ],
    },

    {
      id: 'policies',
      group: 'Policy Manager',
      groupBlurb: 'How the AI classifies posts',
      icon: 'Scale',
      blurb: 'Category definitions with legal references and platform rules.',
      title: 'Policy Manager',
      blocks: [
        {
          type: 'p',
          text: 'A policy tells the AI what a category means. The **AI definition** you write is what the model reads when deciding whether a post belongs in that category, so the wording affects what is flagged. Each policy appears as a card; use **Search policies** to filter.',
        },
        {
          type: 'live',
          route: '/settings?tab=policies',
          alt: 'Settings, Policy Manager tab',
          caption: 'The Policy Manager tab lists your category policies.',
          height: 560,
          markers: [
            { n: 1, target: { text: 'Settings' }, label: 'Settings', text: 'The Settings page, with one tab per area.' },
            { n: 2, target: { text: 'Category definitions that steer' }, label: 'Policy Manager', text: 'Category definitions that steer AI analysis.' },
            { n: 3, target: { text: 'New Policy' }, label: 'New Policy', text: 'Opens the panel to create a policy.' },
            { n: 4, target: { placeholder: 'Search policies' }, label: 'Search policies', text: 'Filter the policy cards by name.' },
          ],
        },
        {
          type: 'steps',
          title: 'Create or change a policy',
          items: [
            { text: 'Click **New Policy**, or click an existing card. A panel opens on the right.' },
            { text: 'On **General**, enter the **Category name** and the **AI definition**. Both are required.' },
            { text: 'On **Legal Framework**, map the sections that apply. Pick from **Add existing...**, or click **New** and enter a code and description.' },
            { text: 'On **Platform Rules**, add the platform policies that apply under **Meta (Facebook & Instagram)**, **X (Twitter)** or **YouTube**.' },
            { text: 'Click **Save Changes**. Editing an existing policy asks you to confirm first.' },
          ],
        },
        {
          type: 'callout',
          tone: 'info',
          title: 'Global default policies',
          text: 'Policies marked as global defaults are system standards and cannot be edited. Create a new policy for your own rules.',
        },
        {
          type: 'callout',
          tone: 'warn',
          title: 'Names lose punctuation',
          text: 'When saved, spaces become underscores and anything that is not a letter, number or underscore is removed. Keep category names to plain words.',
        },
        {
          type: 'callout',
          tone: 'warn',
          title: 'Facebook and Instagram share one list',
          text: 'The **Meta** rules are a single list applied to both platforms.',
        },
        {
          type: 'callout',
          tone: 'danger',
          title: 'Save before you close',
          text: 'Closing the panel without saving discards your edits without a prompt.',
        },
      ],
    },

    {
      id: 'grievances',
      group: 'Grievances',
      groupBlurb: 'Accounts and contacts for the Grievances page',
      icon: 'MessageSquare',
      blurb: 'Watched accounts and contacts for the Grievances page.',
      title: 'Watched accounts and contacts',
      blocks: [
        {
          type: 'p',
          text: 'The **Grievances** tab has two cards. The first, **Watched accounts**, lists the official accounts monitored only for the Grievances page, with a count per platform. They are separate from the profiles on the Profiles page.',
        },
        {
          type: 'live',
          route: '/settings?tab=grievances',
          alt: 'Settings, Grievances tab',
          caption: 'The Grievances tab manages watched accounts and contacts.',
          height: 560,
          markers: [
            { n: 1, target: { text: 'Settings' }, label: 'Settings', text: 'The Settings page, with one tab per area.' },
            { n: 2, target: { text: 'Grievances' }, label: 'Grievances tab', text: 'Where watched accounts and contacts are managed.' },
            { n: 3, target: { text: 'Watched accounts' }, label: 'Watched accounts', text: 'Accounts monitored only for the Grievances page.' },
            { n: 4, target: { text: 'Add account' }, label: 'Add account', text: 'Opens the form to add an account.' },
          ],
        },
        {
          type: 'steps',
          title: 'Add a watched account',
          items: [
            { text: 'Click **Add account**.' },
            { text: 'Enter a handle or URL and complete the form. The account is used only for Grievances monitoring.' },
            { text: 'Save. Use the pencil to edit later, or the bin to remove (you are asked to confirm).' },
          ],
        },
        {
          type: 'p',
          text: 'The second card, **Contacts**, lists the officers and departments to whom grievance reports are routed and forwarded on WhatsApp.',
        },
        {
          type: 'steps',
          title: 'Add a contact',
          items: [
            { text: 'Click **Add contact**. A dialog opens.' },
            { text: 'Enter **Name** and **Phone** (both required). Add **Department** and **Designation** if useful.' },
            { text: 'Click **Add contact** in the dialog. With more than four contacts, use **Search name, phone or department** to find one. Use the pencil or bin to edit or remove it.' },
          ],
        },
        {
          type: 'callout',
          tone: 'tip',
          title: 'Include the country code',
          text: 'Enter each phone number with its country code so reports reach the right person.',
        },
      ],
    },

    {
      id: 'theme',
      group: 'Theme',
      groupBlurb: 'How SOCEYE looks for you',
      icon: 'Palette',
      blurb: 'Light or dark mode and the accent colour.',
      title: 'Theme & Appearance',
      blocks: [
        {
          type: 'p',
          text: 'The **Theme** tab changes how SOCEYE looks for your account. Every choice saves as soon as you click it.',
        },
        {
          type: 'live',
          route: '/settings?tab=theme',
          alt: 'Settings, Theme tab',
          caption: 'The Theme tab changes how SOCEYE looks for you.',
          height: 560,
          markers: [
            { n: 1, target: { text: 'Theme & Appearance' }, label: 'Theme & Appearance', text: 'Colour mode and theme choices.' },
            { n: 2, target: { text: 'Color Mode' }, label: 'Color Mode', text: 'Choose light or dark.' },
            { n: 3, target: { text: 'Light' }, label: 'Light', text: 'Switches to the light look.' },
            { n: 4, target: { text: 'Dark' }, label: 'Dark', text: 'Switches to the dark look.' },
            { n: 5, target: { text: 'Gradient Themes' }, label: 'Gradient Themes', text: 'Pick a colour theme.' },
          ],
        },
        {
          type: 'fields',
          items: [
            { name: 'Color Mode', text: 'Choose **Light** or **Dark**.' },
            { name: 'Featured Prefixed Best Themes', text: 'Curated high-contrast themes. Click a card to use it.' },
            { name: 'Gradient Themes', text: 'Two-tone gradients for cards, buttons and highlights.' },
            { name: 'Solid Color Presets', text: 'Single-colour accents. Use **Custom** to pick any colour.' },
          ],
        },
        {
          type: 'p',
          text: 'A tick shows the current choice. If a change cannot be saved, the previous look is restored and an error message appears.',
        },
      ],
    },

    {
      id: 'troubleshooting',
      group: 'Reference',
      icon: 'LifeBuoy',
      blurb: 'Common problems and what to check.',
      title: 'Troubleshooting',
      blocks: [
        {
          type: 'table',
          head: ['Problem', 'What to check'],
          rows: [
            ['My risk or viral change had no effect', 'Look for **Unsaved** at the top right and click **Save changes**.'],
            ['No **Platforms** tab', 'It is shown to admin accounts only.'],
            ['Viral table says "No platforms yet"', 'Add and activate platforms under **Platforms** first.'],
            ['Too many or too few High alerts', 'Move the High handle, or change the High **Starts at** number, on **Risk levels**.'],
            ['Viral alerts fire constantly', 'Raise the thresholds, or shorten **Window (hours)**. Views climb faster than likes.'],
            ['Adding a keyword shows no new alerts', 'Only posts collected and re-queued are checked. Give the system a little time.'],
            ['Only .doc or .docx files are supported', 'Save your letter as Word format and upload again.'],
            ['A notice printed `{{SOMETHING}}` literally', 'That placeholder is not supported. Remove `{{ORIGINAL_AUTHOR}}` and `{{INTENT}}` from the template.'],
            ['Policy edits vanished', 'The panel was closed without saving. Reopen the policy and click **Save Changes**.'],
            ['Category name has no punctuation', 'Punctuation is removed when a policy is saved. This is expected.'],
            ['Name and phone are required', 'Both fields must be filled to save a grievance contact.'],
          ],
        },
      ],
    },
  ],
};

export default settings;
