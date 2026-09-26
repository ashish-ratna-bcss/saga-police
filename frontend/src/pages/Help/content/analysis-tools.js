/**
 * Help content — Analysis Tools (Scrape and OSINT).
 * Block types: p | steps | list | table | fields | callout
 */

const analysisTools = {
  id: 'analysis-tools',
  title: 'Analysis Tools',
  icon: 'Wrench',
  summary:
    'Two workbenches under Tools: Scrape to crawl and search websites, and OSINT to look up a phone number, email or username or investigate a subject.',
  sections: [
    {
      id: 'overview',
      group: 'Start here',
      groupBlurb: 'The Tools page',
      icon: 'Compass',
      blurb: 'The module list and how runs are kept.',
      title: 'The Tools page',
      blocks: [
        {
          type: 'p',
          text: 'Open **Tools** in the sidebar. A rail on the left lists the modules, **Scrape** and **OSINT**. Pick one and its workspace opens on the right.',
        },
        {
          type: 'p',
          text: 'Both workspaces work the same way: enter a target at the top, start a run, then pick the run in the **Recent runs** list to read its report. The header shows counters for **total**, **running**, **done** and **failed** runs.',
        },
        {
          type: 'callout',
          tone: 'warn',
          title: 'Your run list lives in this browser only',
          text:
            'The list of runs (the last 30) is saved in your browser, not on the server. It will not appear on another computer or browser, and clearing site data removes it. Save anything you need to keep.',
        },
        {
          type: 'p',
          text: 'To remove a run from the list, hover it and click the bin icon.',
        },
      ],
    },

    {
      id: 'scrape-crawl',
      group: 'Scrape',
      groupBlurb: 'Collect content from websites',
      icon: 'Globe',
      blurb: 'Crawl a site and follow its progress.',
      title: 'Crawling a site',
      blocks: [
        {
          type: 'live',
          route: '/analysis-tools/scrape',
          alt: "The Scrape workspace, Crawl tab",
          caption: "Type a site address and start a crawl.",
          markers: [
            { n: 1, target: { text: "Scrape" }, label: "Scrape", text: "The module rail. Scrape opens this workspace." },
            { n: 2, target: { text: "OSINT" }, label: "OSINT", text: "Switch to the OSINT workspace." },
            { n: 3, target: { text: "Crawl" }, label: "Crawl tab", text: "Crawl a whole site. Preflight and Search sit beside it." },
            { n: 4, target: { placeholder: "https://example.com" }, label: "Address box", text: "Type the site to crawl." },
            { n: 5, target: { text: "Start crawl" }, label: "Start crawl", text: "Begin the crawl." },
            { n: 6, target: { text: "Max pages" }, label: "Max pages", text: "Limit how many pages are collected." },
          ],
        },
        {
          type: 'steps',
          items: [
            { text: 'In **Scrape**, choose the **Crawl** tab.' },
            { text: 'Type the site address in the box, for example `https://example.com`.' },
            { text: 'Set the limits (see below).' },
            { text: 'Click **Start crawl**. A new run appears in **Recent crawl runs**.' },
            { text: 'Click the run to open its report. While it runs, a progress bar refreshes every 3 seconds.' },
          ],
        },
        {
          type: 'fields',
          items: [
            { name: 'Max pages', text: 'The most pages to collect, from 1 to 1000.' },
            { name: 'Max depth', text: 'How many links deep to follow from the first page, from 0 to 10. 0 means only the page you entered.' },
            { name: 'Same domain only', text: 'When ticked, the crawl stays on the same website. Untick it to follow links to other sites.' },
          ],
        },
        {
          type: 'p',
          text: 'The crawl report has two tabs. **Overview** shows tiles for **Pages crawled**, **Errors**, **Max depth** and **Max pages**, and whether the crawl stayed on the same domain. **Raw** shows the full response as returned.',
        },
      ],
    },

    {
      id: 'scrape-other',
      group: 'Scrape',
      icon: 'Search',
      blurb: 'Preflight, instant search and the data tables.',
      title: 'Preflight, Search and the data tables',
      blocks: [
        {
          type: 'table',
          head: ['Tab', 'What it does'],
          rows: [
            ['**Preflight**', 'Enter a URL and click **Run preflight** to check it before you crawl. The report lists what was found about the address.'],
            ['**Search**', 'Enter a query and click **Search** for instant web results. Each result shows a title link, the address and a short snippet.'],
            ['**Documents**', 'Pages and files collected by your crawls.'],
            ['**Entities**', 'People, organisations and places extracted from documents.'],
            ['**Sources**', 'Websites and feeds being monitored.'],
          ],
        },
        {
          type: 'p',
          text: 'Documents, Entities and Sources are tables. Use the filter box to narrow the rows, and **Refresh** to reload them. Click a row to open a detail drawer with the full record; **Raw data** inside it shows everything stored.',
        },
      ],
    },

    {
      id: 'osint-run',
      group: 'OSINT',
      groupBlurb: 'Look up identifiers and investigate subjects',
      icon: 'Radar',
      blurb: 'Choose a mode, enter a target, read the report.',
      title: 'Running a lookup or investigation',
      blocks: [
        {
          type: 'live',
          route: '/analysis-tools/osint',
          alt: "The OSINT workspace",
          caption: "Enter a target, pick a mode and start a run.",
          markers: [
            { n: 1, target: { placeholder: "Subject, domain or identifier" }, label: "Target box", text: "Type the subject, domain or identifier to look up." },
            { n: 2, target: { label: "Mode" }, label: "Mode", text: "Choose a lookup or an investigation." },
            { n: 3, target: { text: "Investigate" }, label: "Investigate", text: "Start the run. This reads Run lookup for lookup modes." },
            { n: 4, target: { text: "Recent runs" }, label: "Recent runs", text: "Pick a run here to read its report." },
          ],
        },
        {
          type: 'steps',
          items: [
            { text: 'In **OSINT**, choose a mode from the dropdown.' },
            { text: 'Type the target in the box. The hint text changes with the mode.' },
            { text: 'Click **Run lookup** (for lookups) or **Investigate** (for investigations).' },
            { text: 'Click the run in **Recent runs** to read the report.' },
          ],
        },
        {
          type: 'table',
          head: ['Mode', 'Enter'],
          rows: [
            ['**Investigation · General**', 'A subject, domain or identifier. A standard investigation.'],
            ['**Investigation · Deep**', 'The same, but a deeper investigation.'],
            ['**Phone lookup**', 'A phone number with country code.'],
            ['**Email lookup**', 'An email address.'],
            ['**Username lookup**', 'A username.'],
          ],
        },
        {
          type: 'p',
          text: 'Investigations take time. The report shows a progress bar that refreshes every 5 seconds, and the status changes to completed or failed when done.',
        },
      ],
    },

    {
      id: 'osint-report',
      group: 'OSINT',
      icon: 'FileSearch',
      blurb: 'What each report tab shows.',
      title: 'Reading an OSINT report',
      blocks: [
        {
          type: 'p',
          text: 'The report header shows the target, a status badge, the run ID and, for investigations, the number of entities and relations found.',
        },
        {
          type: 'table',
          head: ['Run type', 'Tabs'],
          rows: [
            ['Investigation', '**Overview**, **Entities**, **Relationships**, **Evidence**, **Raw**'],
            ['Lookup (phone, email, username)', '**Overview**, **Sources**, **Raw**'],
          ],
        },
        {
          type: 'list',
          items: [
            '**Overview** for an investigation shows summary tiles and a **Relationship graph** linking the entities found.',
            '**Entities** lists what was found; **Relationships** lists how they connect; **Evidence** lists what supports the findings.',
            '**Sources** (lookups) lists where the details came from.',
            '**Raw** shows the full response.',
          ],
        },
        {
          type: 'callout',
          tone: 'tip',
          title: 'Valid or not',
          text: 'For lookups a green tick beside the title means the identifier was found valid, and a red cross means it was not.',
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
            ['My earlier runs are gone', 'The run list is stored in this browser only. Another browser, another computer or cleared site data starts empty.'],
            ['A crawl stays on running', 'Large crawls take time. The report refreshes every 3 seconds. Lower **Max pages** or **Max depth** for faster results.'],
            ['A crawl collected very few pages', 'Check **Max depth** (0 stops at the first page) and whether **Same domain only** is blocking the links.'],
            ['A table says "Could not load"', 'Click **Refresh**. If it keeps failing, check **Health** for the web intelligence service.'],
            ['"No summary fields returned"', 'The service returned no summary. Open the **Raw** tab to see the response.'],
            ['An investigation failed', 'Try again, or use **General** instead of **Deep**. Check **Health** to see which services are running.'],
          ],
        },
      ],
    },
  ],
};

export default analysisTools;
