/**
 * Help content — Person of Interest.
 * Block types: p | steps | list | table | fields | callout
 */

const poi = {
  id: 'poi',
  title: 'Person of Interest',
  icon: 'UserSearch',
  summary:
    'Keep a dossier for each person you track: identity details, contact information, linked social accounts and a profile image.',
  sections: [
    {
      id: 'overview',
      group: 'Start here',
      groupBlurb: 'What the page holds and how to add an entry',
      icon: 'Compass',
      title: 'What this page is for',
      blocks: [
        {
          type: 'p',
          text:
            'The Person of Interest page (`/person-of-interest`, titled **Profiles** on screen) shows one card per person. Each entry can hold personal details, phone numbers, emails, case references and their social media accounts. Linked social accounts are tracked automatically.',
        },
        {
          type: 'live',
          route: '/person-of-interest',
          alt: "The Person of Interest page",
          caption: "Search or filter the cards, or add a person.",
          height: 420,
          markers: [
            { n: 1, target: { text: "Add Profile" }, label: "Add Profile", text: "Create a new person entry." },
            { n: 2, target: { placeholder: "Search profiles by name" }, label: "Search", text: "Search by name, number, address or handle." },
            { n: 3, target: { sel: 'select' }, label: "Status filter", text: "Show active, inactive or archived people." },
            { n: 4, target: { sel: 'select:nth-of-type(2)' }, label: "Platform filter", text: "Show people with an account on one platform." },
          ],
        },
        {
          type: 'list',
          items: [
            'The pill under the title shows how many profiles match your search.',
            'Cards are shown in a grid, with paging at the bottom when there are many.',
            'Each card has view, edit and delete actions.',
          ],
        },
      ],
    },
    {
      id: 'add',
      group: 'Start here',
      icon: 'PlusCircle',
      title: 'Adding a person',
      blurb: 'Only the name is required.',
      blocks: [
        {
          type: 'steps',
          items: [
            { text: 'Click **Add Profile** at the top right.' },
            { text: 'In the **Add Profile** dialog, enter the **Real Name**. This is the only required person field.' },
            { text: 'Fill in whichever other fields you know. See the field list below.' },
            { text: 'To attach a social account, use **Social Media Profiles**. Each account needs a handle and a display name, plus a category and priority.' },
            { text: 'Click **Add Source**. To back out, click **Cancel**; you are asked **Discard Changes?** if you typed anything.' },
          ],
        },
        {
          type: 'callout',
          tone: 'info',
          text: 'When a new source is added, Blurasaga generates a tracking profile for it in the background.',
        },
      ],
    },
    {
      id: 'fields',
      group: 'Start here',
      icon: 'ListChecks',
      title: 'Fields on the form',
      blocks: [
        {
          type: 'fields',
          items: [
            { name: 'Real Name', text: 'Required. Full real name.' },
            { name: 'Brief Summary', text: 'Up to 500 characters. A counter shows how many you have used.' },
            { name: 'Alias Names', text: 'Names used in the real world or on social media. Add as many as needed.' },
            { name: 'Mobile Number / Email IDs', text: 'Add several of each.' },
            { name: 'Current Address', text: 'Free text.' },
            { name: 'PS Limits', text: 'Police station limits.' },
            { name: 'District / Commissionerate', text: 'Free text.' },
            { name: 'Last Used IP', text: 'The last known IP address.' },
            { name: 'Software / Hardware Identifiers', text: 'Device or software identifiers.' },
            { name: 'Total FIRs Against', text: 'Enter a number. A row appears for each FIR with FIR No, PS Limits and District / Commissionerate.' },
            { name: 'Linked Incidents', text: 'Free text for related incidents.' },
            { name: 'Social Media Profiles', text: 'X, Facebook, Instagram, YouTube and WhatsApp numbers.' },
            { name: 'Previously Deleted Profiles', text: 'Accounts that were deleted: X Profiles, Face Book, Instagram, Youtube and Whatsapp.' },
            { name: 'Additional Fields', text: 'Add your own label and value pairs.' },
          ],
        },
      ],
    },
    {
      id: 'categories',
      group: 'Working with people',
      groupBlurb: 'Search, view, edit and manage the image',
      icon: 'Tags',
      title: 'Categories',
      blurb: 'Set on each social account, shown on the person.',
      blocks: [
        {
          type: 'p',
          text:
            'Each social account on a person has a **Category**. The detail page lists the categories in use under **Category**.',
        },
        {
          type: 'list',
          items: ['Political', 'Communal', 'Trouble Makers', 'Defamation', 'Narcotics', 'History Sheeters', 'Others'],
        },
        {
          type: 'p',
          text: 'Each account also has a **Priority** of High, Medium or Low.',
        },
      ],
    },
    {
      id: 'search',
      group: 'Working with people',
      icon: 'Search',
      title: 'Searching and filtering',
      blocks: [
        {
          type: 'steps',
          items: [
            { text: 'Type in the search box. It matches name, number, address, handle and more. Results update after you stop typing.' },
            { text: 'Use the status drop-down: **All Status**, **Active**, **Inactive** or **Archived**.' },
            { text: 'Use the platform drop-down to show only people linked to one platform.' },
          ],
        },
      ],
    },
    {
      id: 'edit',
      group: 'Working with people',
      icon: 'Pencil',
      title: 'Viewing, editing and deleting',
      blocks: [
        {
          type: 'list',
          items: [
            'Open a card to see a quick **Profile Details** panel.',
            'Choose edit to open **Edit Profile**, change the fields and save. If you close with unsaved changes you are asked **Discard Changes?**.',
            'Choose delete and confirm to remove the entry.',
          ],
        },
      ],
    },
    {
      id: 'detail',
      group: 'Working with people',
      icon: 'UserSquare',
      title: 'The detail page',
      blurb: 'The full dossier for one person.',
      blocks: [
        {
          type: 'p',
          text:
            'The detail page shows the same fields in a read-only layout, with linked social accounts grouped by platform (X, Facebook, Instagram, YouTube, WhatsApp). Recent alert activity for the person is also shown.',
        },
        {
          type: 'steps',
          items: [
            { text: 'Click **Edit Profile** to change anything on the page. Then click **Save** or **Cancel**.' },
            { text: 'In a platform table, click **Refresh** to re-read the account from the platform and update its handle and details.' },
            { text: 'Use **Unlink Account** to detach an account, or **Link Search** to find and link an existing one.' },
            { text: 'Use **Add another X Profile** (or the equivalent for other platforms) to add more accounts.' },
            { text: 'Click the **Export Report** button at the top to download a PDF of the profile.' },
            { text: 'Use **Back** to return to the list. Unsaved changes prompt you to discard or keep them.' },
          ],
        },
      ],
    },
    {
      id: 'image',
      group: 'Working with people',
      icon: 'Image',
      title: 'Profile image',
      blocks: [
        {
          type: 'steps',
          items: [
            { text: 'On the detail page, click the round photo at the top of the profile panel.' },
            { text: 'In **Manage Profile Image**, click to upload an image file.' },
            { text: 'Click **Save Changes**.' },
          ],
        },
        {
          type: 'callout',
          tone: 'warn',
          text: 'The image must be smaller than 5 MB.',
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
            ['“Name is required”', 'Enter the Real Name and try again.'],
            ['“File size must be less than 5MB”', 'Choose a smaller image.'],
            ['“Failed to upload image”', 'Try again with a different image file.'],
            ['“Social profile #n is missing mandatory fields”', 'Each social account needs a handle and a display name.'],
            ['“This profile is not linked to a source yet”', 'Link the account first (Link Search), then Refresh.'],
            ['No profiles found', 'Clear the search box and set the status and platform filters to All.'],
          ],
        },
      ],
    },
  ],
};

export default poi;
