/**
 * Help content — Reports.
 * Block types: p | steps | list | table | fields | callout
 */

const reports = {
  id: 'reports',
  title: 'Reports',
  icon: 'FileText',
  summary:
    'Find formal reports, open the notice generator, download PDFs and Excel files, and log Dial-100 incidents.',
  sections: [
    {
      id: 'overview',
      group: 'Start here',
      groupBlurb: 'The Reports page and its tabs',
      icon: 'Compass',
      title: 'The Reports page',
      blurb: 'One place for every module’s reports.',
      blocks: [
        {
          type: 'p',
          text:
            'Open **Reports** from the sidebar (`/reports`). It gathers the formal reports produced by other modules. The old address `/unified-reports` simply sends you here.',
        },
        {
          type: 'live',
          route: '/reports',
          alt: "The Reports page",
          caption: "Tabs group reports by module; the first tab lists every formal report.",
          markers: [
            { n: 1, target: { text: "Refresh" }, label: "Refresh", text: "Reload the tab counts." },
            { n: 2, target: { text: "All Formal" }, label: "All Formal", text: "Every formal report in one list." },
            { n: 3, target: { text: "Alerts" }, label: "Alerts", text: "Notices raised from alerts." },
            { n: 4, target: { text: "Grievance" }, label: "Grievance", text: "Grievance workflow reports." },
            { n: 5, target: { text: "Events" }, label: "Events", text: "Reports for monitored events." },
            { n: 6, target: { placeholder: "SN, user, handle" }, label: "Search", text: "Find a report by serial number, user or handle." },
          ],
        },
        {
          type: 'table',
          head: ['Tab', 'What it holds'],
          rows: [
            ['All Formal', 'A catalog of every formal report with a detail panel.'],
            ['Alerts', 'Alert reports: status, closing remarks and the notice for each alert.'],
            ['Grievance', 'Reports for citizen grievances.'],
            ['Suggestion', 'Reports for suggestions.'],
            ['Criticism', 'Reports for criticism.'],
            ['Query', 'Reports for queries.'],
            ['Events', 'Event reports, with export to Excel or PDF.'],
          ],
        },
        {
          type: 'p',
          text:
            'The **Refresh** button in the header reloads the tab counts. The time beside it shows when they were last updated.',
        },
      ],
    },
    {
      id: 'catalog',
      group: 'Working with reports',
      groupBlurb: 'Find, open and download',
      icon: 'LayoutPanelTop',
      title: 'All Formal',
      blocks: [
        {
          type: 'steps',
          items: [
            { text: 'Open the **All Formal** tab. Summary tiles show **Total**, **By status**, **Platforms** and **Latest generated**.' },
            { text: 'Type in the search box (**SN, user, handle…**) to narrow the list.' },
            { text: 'Click **All** or a platform icon to filter by platform.' },
            { text: 'Click a report in the list. The detail panel opens on the right.' },
            { text: 'Use **Copy SN** to copy the serial number, **PDF** to download the report, or **Manage in Grievances** to open it in the Grievances page.' },
          ],
        },
        {
          type: 'callout',
          tone: 'info',
          text: 'If the list is empty you will see “No formal reports yet” with an **Open Grievances** button. Reports appear here after they are generated elsewhere.',
        },
      ],
    },
    {
      id: 'alerts-tab',
      group: 'Working with reports',
      icon: 'AlertTriangle',
      title: 'Alerts tab',
      blocks: [
        {
          type: 'p',
          text:
            'Lists alert reports with **Report ID**, **Target User**, **Category**, **Post Link**, **Generated At**, **Status**, **Closing Remarks** and **Actions**.',
        },
        {
          type: 'steps',
          items: [
            { text: 'Search by SN, user or handle. Filter by **Platform** and by **Status** (**All Statuses**, **Sent to Intermediary**, **Closed**).' },
            { text: 'Change a report’s status from the row. When closing, enter closing remarks, for example content removed or no action needed.' },
            { text: 'In **Actions**, use the eye button to open the report, or the download button to open it ready to print.' },
            { text: 'Click **Export Excel** to download the filtered list.' },
          ],
        },
      ],
    },
    {
      id: 'generate',
      group: 'Working with reports',
      icon: 'FilePlus',
      title: 'Generating and downloading a notice',
      blurb: 'The Official Notice Generator.',
      blocks: [
        {
          type: 'p',
          text:
            'The **Official Notice Generator** (`/reports/generate/<alert id>`) opens from the alert reports and from alert cards. It merges the alert’s data into a template so you can edit and save the notice.',
        },
        {
          type: 'steps',
          items: [
            { text: 'Wait while it shows **Generating Notice** and merges the data.' },
            { text: 'Choose a template from the drop-down, or leave it on **Default**.' },
            { text: 'Edit the text on the page. An amber dot next to the title means unsaved changes.' },
            { text: 'Click **Save** to keep your changes.' },
            { text: 'Click the PDF button to download a clean PDF with the reference number in the footer.' },
          ],
        },
        {
          type: 'callout',
          tone: 'warn',
          title: 'Recurring Threat Detected',
          text: 'If SOCEYE finds a similar earlier report, a dialog warns you. Read it, then click **Dismiss** to continue.',
        },
      ],
    },
    {
      id: 'other-tabs',
      group: 'Working with reports',
      icon: 'Files',
      title: 'Suggestion, Criticism and Query tabs',
      blocks: [
        {
          type: 'list',
          items: [
            '**Suggestion** and **Criticism**: filter by date range (All Time, Last 24 Hours, Last 7 Days, Last 30 Days, Last Month, Custom Range), category and platform. Search by unique ID, citizen or description, then use **Export XLSX**.',
            '**Query**: search reports, filter by Platform and Status (**All Status**, **Pending**, **Closed**), then **Refresh** or **Export Excel**. In the preview use **Download PDF**.',
            '**Events**: search events or keywords, then choose **Export** and pick **Excel** or **PDF**.',
          ],
        },
      ],
    },
    {
      id: 'dial100',
      group: 'Dial-100 incidents',
      groupBlurb: 'A spreadsheet-style log',
      icon: 'Activity',
      title: 'Dial-100 Incident Reporting',
      blurb: 'Open it from **Dial 100 Police** on the Dashboard.',
      blocks: [
        {
          type: 'p',
          text:
            'A table of incidents for a date range. The range shows at the top. Click it to open **Select Date Range**, choose the **From** and end dates, then click **Apply**.',
        },
        {
          type: 'steps',
          items: [
            { text: 'Click **Add Row**.' },
            { text: 'Fill in **Incident Details**, **Category**, **Location**, **PS Jurisdiction**, **Zone** and **Remarks**. Attach files under **Media** if needed.' },
            { text: 'Save the row, then click **Save** at the top to store your changes.' },
            { text: 'Click **Export** to download the incidents as a spreadsheet.' },
          ],
        },
        {
          type: 'list',
          items: [
            'Use the pencil button on a row to edit and the red bin button to delete.',
            'Click a media thumbnail to open **Media Preview**.',
            'The **Save** button turns solid when there are unsaved changes.',
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
            ['“Failed to load reports”', 'Click Refresh. If it persists, check your connection and sign in again.'],
            ['No PDF button on a report', 'The report has no PDF yet. Generate it from the notice generator first.'],
            ['“No data to export”', 'The list is empty. Clear filters or widen the date range.'],
            ['“Failed to save” on Dial-100', 'Try Save again. Your rows stay on screen until saved.'],
            ['“Upload failed”', 'Try a smaller file or a different format.'],
            ['Sync Error in the notice generator', 'Use **Back** and open the report again from the Alerts tab.'],
          ],
        },
      ],
    },
  ],
};

export default reports;
