/**
 * Help content — Periscope.
 * Block types: p | steps | list | table | fields | callout
 */

const periscope = {
  id: 'periscope',
  title: 'Periscope',
  icon: 'Radar',
  summary:
    'Prepare the Periscope Daily Situation Report: a dated list of scheduled programmes that you can build by hand, upload, or import, then export as a DOCX.',
  sections: [
    {
      id: 'overview',
      group: 'Start here',
      groupBlurb: 'What Periscope is and how a day works',
      icon: 'Compass',
      title: 'What Periscope is',
      blocks: [
        {
          type: 'p',
          text:
            'Open **Periscope** (`/periscope`, titled **Periscope DSR** with a **Daily Situation Report** badge). Each day has its own report made of programmes: rallies, meetings, agitations and similar scheduled activity, each with zone, place, organizer and expected turnout.',
        },
        {
          type: 'live',
          route: '/periscope',
          alt: "The Periscope page",
          caption: "Each day has its own report of programmes.",
          height: 520,
          markers: [
            { n: 1, target: { label: "Previous Day" }, label: "Previous day", text: "Go back one day." },
            { n: 2, target: { label: "Next Day" }, label: "Next day", text: "Go forward one day." },
            { n: 3, target: { text: "Today" }, label: "Today", text: "Jump to today." },
            { n: 4, target: { text: "Add Programme" }, label: "Add Programme", text: "Enter a programme by hand." },
            { n: 5, target: { text: "Upload DOCX" }, label: "Upload DOCX", text: "Fill the day from a Word file." },
            { n: 6, target: { text: "Download Template" }, label: "Download Template", text: "Get the blank Word template." },
            { n: 7, target: { text: "Export DOCX" }, label: "Export DOCX", text: "Download the day as a Word file." },
            { n: 8, target: { text: "Archive" }, label: "Archive", text: "Open earlier days." },
          ],
        },
        {
          type: 'list',
          items: [
            'Use the **Previous Day** and **Next Day** arrows, or **Today**, to change the report date.',
            'A day with no programmes shows “No Programmes Recorded” with buttons to upload, import or add.',
            'Summary tiles show how many programmes fall in each category and their share of the day.',
          ],
        },
      ],
    },
    {
      id: 'build',
      group: 'Start here',
      icon: 'ListPlus',
      title: 'Building a day’s report',
      blurb: 'Three ways to fill a day.',
      blocks: [
        {
          type: 'table',
          head: ['Button', 'What it does'],
          rows: [
            ['Add Programme', 'Opens a form to type one programme.'],
            ['Upload DOCX', 'Reads a filled-in Periscope DSR .docx and shows it as a draft.'],
            ['Download Template', 'Downloads a blank DOCX template for the selected date, to fill and upload.'],
            ['Import Monitored', 'Pulls in the events being monitored for that date.'],
            ['Archive', 'Opens past reports saved for your organisation.'],
            ['Export DOCX', 'Downloads the day’s report as an official DOCX.'],
          ],
        },
        {
          type: 'steps',
          items: [
            { text: 'To use a file: click **Download Template**, fill it in, then click **Upload DOCX**.' },
            { text: 'Review the draft. Click **Save & Publish** to keep it, or **Discard** to throw it away.' },
          ],
        },
      ],
    },
    {
      id: 'form',
      group: 'Working with programmes',
      groupBlurb: 'Add, find, edit and export',
      icon: 'FormInput',
      title: 'The programme form',
      blurb: 'Add New Programme, Edit Programme or Duplicate Programme.',
      blocks: [
        {
          type: 'steps',
          items: [
            { text: 'Click **Add Programme**.' },
            { text: 'Fill in the fields below. **Programme Name** is required.' },
            { text: 'Click **Save Programme**.' },
          ],
        },
        {
          type: 'fields',
          items: [
            { name: 'Category Name', text: 'Type a category, for example Political Programmes or Agitations, or pick an earlier one.' },
            { name: 'Zone / District', text: 'For example Zone-I, City, District. Earlier values are suggested.' },
            { name: 'Police Station & Place', text: 'Where it takes place.' },
            { name: 'Programme name', text: 'The name of the programme. Required.' },
            { name: 'Organizer Details', text: 'Party or leader details.' },
            { name: 'Expected Members', text: 'For example 500 or 100-150.' },
            { name: 'Timing / Hours', text: 'For example 10:00 AM to 02:00 PM.' },
            { name: 'Permission Status', text: 'For example By Information, Permitted, Government Programme.' },
            { name: 'Priority Level', text: 'High, Medium or Low.' },
            { name: 'Gist of the Programme', text: 'Key demands, route or summary.' },
            { name: 'Comments', text: 'Security arrangements or operational notes.' },
          ],
        },
      ],
    },
    {
      id: 'filters',
      group: 'Working with programmes',
      icon: 'Filter',
      title: 'Searching and filtering',
      blocks: [
        {
          type: 'fields',
          items: [
            { name: 'Search', text: 'Searches zone, programme, PS and organizer.' },
            { name: 'Category', text: '**All Categories**, or one of the categories present that day.' },
            { name: 'Permission', text: '**All Permissions**, or one of the permission values present that day.' },
            { name: 'Priority', text: '**All Priorities**, **High Priority**, **Medium Priority** or **Low Priority**, each with a count.' },
          ],
        },
        {
          type: 'p',
          text:
            'Switch between **Table View** and **Cards View**. The number in brackets is how many programmes match your filters. The table columns are Sl.No, Zones, Name of the Programme, Organizer Details, Expected, Time, Gist of Programme, Permission and Priority Tag.',
        },
      ],
    },
    {
      id: 'row-actions',
      group: 'Working with programmes',
      icon: 'MoreHorizontal',
      title: 'Row actions',
      blocks: [
        {
          type: 'list',
          items: [
            '**Edit programme** changes any field.',
            '**Duplicate** copies a programme so you can adjust it.',
            '**Delete** removes it from the day.',
            '**Add this programme to active Events Monitoring** opens a dialog with **Event Name**, **Location / Jurisdiction**, keywords and platforms. Keywords and at least one platform are required.',
          ],
        },
      ],
    },
    {
      id: 'archive',
      group: 'Working with programmes',
      icon: 'Archive',
      title: 'Archive and export',
      blocks: [
        {
          type: 'steps',
          items: [
            { text: 'Click **Archive** to see **Past Periscope DSR Archive**.' },
            { text: 'Click **Open** on a date to load that day’s report.' },
            { text: 'Use the bin button (Delete from archive) to remove a saved report.' },
            { text: 'Click **Export DOCX** on any loaded day to download the report.' },
          ],
        },
        {
          type: 'callout',
          tone: 'info',
          text: 'Export works only when the day has programmes. Otherwise you see “No programmes to export for this date.”',
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
            ['“Programme Name is required”', 'Enter the programme name before saving.'],
            ['“Failed to parse DOCX”', 'Use the file from Download Template, keep its layout, and upload again.'],
            ['“No monitored events recorded” on Import Monitored', 'Nothing is being monitored for that date. Add programmes another way.'],
            ['“Keywords are mandatory”', 'Add at least one keyword when adding a programme to Events Monitoring.'],
            ['“Select at least one platform to monitor”', 'Tick a platform in the monitoring dialog.'],
            ['A day looks empty', 'Check the date at the top, and clear Category, Permission and Priority filters.'],
          ],
        },
      ],
    },
  ],
};

export default periscope;
