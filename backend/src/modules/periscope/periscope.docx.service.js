const mammoth = require('mammoth');
const cheerio = require('cheerio');
const {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  WidthType,
  AlignmentType,
  BorderStyle,
  ShadingType,
  PageOrientation,
} = require('docx');



/** Parse DD.MM.YYYY or YYYY-MM-DD string to standard YYYY-MM-DD */
function normalizeDateStr(raw) {
  if (!raw) return null;
  const str = String(raw).trim();
  // Match DD.MM.YYYY or DD/MM/YYYY
  const dmyMatch = str.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }
  // Match YYYY-MM-DD
  const ymdMatch = str.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (ymdMatch) return ymdMatch[0];
  return null;
}

/** Get day of week name from YYYY-MM-DD */
function getDayOfWeek(dateStr) {
  if (!dateStr) return 'MONDAY';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return 'MONDAY';
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  return days[d.getDay()];
}

/**
 * Parses an uploaded DOCX buffer and extracts the structured Periscope DSR data.
 * @param {Buffer} buffer
 */
async function parseDocxBuffer(buffer) {
  const { value: html } = await mammoth.convertToHtml({ buffer });
  const $ = cheerio.load(html);

  let organization = 'SPECIAL BRANCH POLICE';
  let title = 'PERISCOPE REPORT OF SPECIAL BRANCH';
  let reportDate = null;
  let dayOfWeek = null;
  let notes = '';

  // Extract top paragraphs before the first table
  const topParagraphs = [];
  $('body')
    .children('p')
    .each((_, el) => {
      const txt = $(el).text().trim();
      if (txt) topParagraphs.push(txt);
    });

  if (topParagraphs.length >= 1) {
    organization = topParagraphs[0];
  }
  if (topParagraphs.length >= 2) {
    title = topParagraphs[1];
    // Extract date and day of week from title, e.g. "FOR THE DAY 15.06.2026 (MONDAY)"
    const dateMatch = title.match(/(\d{1,2}[./-]\d{1,2}[./-]\d{4})/);
    if (dateMatch) {
      reportDate = normalizeDateStr(dateMatch[1]);
    }
    const dayMatch = title.match(/\(([A-Z]+)\)/i);
    if (dayMatch) {
      dayOfWeek = dayMatch[1].toUpperCase();
    }
  }

  if (!dayOfWeek && reportDate) {
    dayOfWeek = getDayOfWeek(reportDate);
  }

  const tables = $('table');
  const programmes = [];
  const abstract = [];

  // Parse Table 0: Main Programmes Table
  if (tables.length > 0) {
    const mainTable = tables.first();
    let currentCategory = 'General Programmes';

    mainTable.find('tr').each((_, tr) => {
      const cells = $(tr).find('th, td');
      if (cells.length === 0) return;

      // Check if it's a category header row (colspan or single cell)
      const firstCell = cells.first();
      const colspan = Number(firstCell.attr('colspan') || 1);
      const isHeaderRow = $(tr).parent().is('thead') || cells.is('th');

      if (colspan >= 5 || cells.length === 1) {
        const catText = firstCell.text().trim();
        if (catText && !catText.toLowerCase().includes('sl.no') && !catText.toLowerCase().includes('zones')) {
          // Clean trailing "- 02" or count if present, and remove hardcoded state-specific prefixes (like AP)
          let cleaned = catText.replace(/\s*-\s*\d+\s*$/, '').trim();
          cleaned = cleaned.replace(/\/AP\b/gi, '').replace(/\bof AP\b/gi, '').replace(/\bAP,\s*/gi, '').replace(/\s{2,}/g, ' ').trim();
          currentCategory = cleaned || 'Other Programmes';
        }
        return;
      }

      // Check if this is the table column header row
      const rowText = cells.text().toLowerCase();
      if (rowText.includes('sl.no') && rowText.includes('programme')) {
        return;
      }

      // It is a data row
      if (cells.length >= 8) {
        const getCell = (idx) => (cells.eq(idx) ? cells.eq(idx).text().trim() : '');
        const slNo = parseInt(getCell(0), 10) || programmes.length + 1;
        const zone = getCell(1);
        const name = getCell(2);
        const policeStationPlace = getCell(3);
        const organizer = getCell(4);
        const expectedMembers = getCell(5);
        const time = getCell(6);
        const gist = getCell(7);
        const permissionStatus = cells.length >= 9 ? getCell(8) : 'Publicly reported';
        const comments = cells.length >= 10 ? getCell(9) : '';

        if (name || zone || gist) {
          programmes.push({
            id: `p-${Date.now()}-${programmes.length + 1}`,
            sl_no: slNo,
            category: currentCategory,
            zone,
            name: name || 'Untitled Programme',
            police_station_place: policeStationPlace,
            organizer: organizer || 'Not specified',
            expected_members: expectedMembers || 'Not specified',
            time: time || (reportDate ? reportDate : 'Not specified'),
            gist,
            permission_status: permissionStatus || 'Publicly reported',
            comments,
          });
        }
      }
    });
  }

  // Parse Table 1: Abstract of Programmes (if present)
  if (tables.length > 1) {
    const abstractTable = tables.eq(1);
    abstractTable.find('tr').each((_, tr) => {
      const cells = $(tr).find('td');
      if (cells.length >= 3) {
        const slNo = parseInt(cells.eq(0).text().trim(), 10);
        const catName = cells.eq(1).text().trim();
        const count = parseInt(cells.eq(2).text().trim(), 10);
        if (Number.isFinite(slNo) && catName) {
          abstract.push({
            sl_no: slNo,
            category: catName,
            count: Number.isFinite(count) ? count : 0,
          });
        }
      }
    });
  }

  // If abstract wasn't in the document, compute it from programmes
  if (abstract.length === 0 && programmes.length > 0) {
    const countsMap = {};
    programmes.forEach((p) => {
      countsMap[p.category] = (countsMap[p.category] || 0) + 1;
    });
    let idx = 1;
    for (const [cat, count] of Object.entries(countsMap)) {
      abstract.push({
        sl_no: idx++,
        category: `${cat} - ${String(count).padStart(2, '0')}`,
        count,
      });
    }
  }

  // Footer notes
  const bottomParagraphs = [];
  $('body > p').each((_, el) => {
    const txt = $(el).text().trim();
    if (txt && (txt.toLowerCase().includes('source status') || txt.toLowerCase().includes('prepared from'))) {
      bottomParagraphs.push(txt);
    }
  });
  notes = bottomParagraphs.join('\n');

  return {
    organization,
    title,
    report_date: reportDate || new Date().toISOString().split('T')[0],
    day_of_week: dayOfWeek || getDayOfWeek(reportDate),
    programmes,
    abstract,
    notes: notes || '',
  };
}

/**
 * Generate a DOCX document matching the exact Periscope DSR structure.
 * @param {object} data
 */
async function generateDocx(data) {
  const org = data.organization || '';
  const reportDate = data.report_date ? normalizeDateStr(data.report_date) : new Date().toISOString().split('T')[0];
  const [yyyy, mm, dd] = reportDate.split('-');
  const formattedDate = `${dd}.${mm}.${yyyy}`;
  const dayOfWeek = data.day_of_week || getDayOfWeek(reportDate);
  const title =
    data.title || (org ? `${org} PERISCOPE REPORT FOR THE DAY ${formattedDate} (${dayOfWeek})` : `PERISCOPE REPORT FOR THE DAY ${formattedDate} (${dayOfWeek})`);

  const programmes = Array.isArray(data.programmes) ? data.programmes : [];

  // Group programmes by category
  const categoriesMap = new Map();
  programmes.forEach((p) => {
    const cat = p.category || 'Other Programmes';
    if (!categoriesMap.has(cat)) {
      categoriesMap.set(cat, []);
    }
    categoriesMap.get(cat).push(p);
  });

  // Table borders styling
  const cellBorder = {
    top: { style: BorderStyle.SINGLE, size: 4, color: '888888' },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: '888888' },
    left: { style: BorderStyle.SINGLE, size: 4, color: '888888' },
    right: { style: BorderStyle.SINGLE, size: 4, color: '888888' },
  };

  // 10 Column widths in twips (Total width for A4 Landscape is ~14,000 twips)
  const colWidths = [
    600,   // Sl.No
    1400,  // Zones
    2000,  // Name of Programme
    1500,  // Police Station & Place
    1700,  // Organizer details
    1100,  // Expected Members
    1200,  // Time From & To
    2600,  // Gist of Programme
    1200,  // Permission status
    1600,  // Comments
  ];

  const headerTitles = [
    'Sl.No',
    'Zones',
    'Name of the Programme',
    'Police Station & Place',
    'Organizer’s details with party affiliation',
    'ExpectedMembers',
    'Time,From & To',
    'Gist of the Programmes',
    'Whether permissiongranted/ rejected',
    'Comments',
  ];

  const tableRows = [];

  // 1. Column Header Row
  tableRows.push(
    new TableRow({
      tableHeader: true,
      children: headerTitles.map(
        (t, idx) =>
          new TableCell({
            width: { size: colWidths[idx], type: WidthType.DXA },
            shading: { fill: 'EAEAEA', type: ShadingType.SOLID },
            borders: cellBorder,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: t, bold: true, size: 18, font: 'Calibri' })],
              }),
            ],
          })
      ),
    })
  );

  // 2. Category Sections and Programme Data Rows
  let runningIndex = 1;
  const abstractList = [];

  categoriesMap.forEach((items, catName) => {
    const countStr = String(items.length).padStart(2, '0');
    const categoryHeaderLabel = `${catName} - ${countStr}`;

    abstractList.push({
      sl_no: abstractList.length + 1,
      category: categoryHeaderLabel,
      count: items.length,
    });

    // Category banner row spanning all 10 columns
    tableRows.push(
      new TableRow({
        children: [
          new TableCell({
            columnSpan: 10,
            shading: { fill: 'F3F4F6', type: ShadingType.SOLID },
            borders: cellBorder,
            children: [
              new Paragraph({
                alignment: AlignmentType.LEFT,
                children: [
                  new TextRun({
                    text: categoryHeaderLabel,
                    bold: true,
                    size: 19,
                    font: 'Calibri',
                    color: '1E293B',
                  }),
                ],
              }),
            ],
          }),
        ],
      })
    );

    // Programme rows under this category
    items.forEach((item) => {
      const rowValues = [
        String(item.sl_no || runningIndex++),
        item.zone || '',
        item.name || '',
        item.police_station_place || '',
        item.organizer || '',
        item.expected_members || 'Not specified',
        item.time || '',
        item.gist || '',
        item.permission_status || 'Publicly reported',
        item.comments || '',
      ];

      tableRows.push(
        new TableRow({
          children: rowValues.map(
            (val, colIdx) =>
              new TableCell({
                width: { size: colWidths[colIdx], type: WidthType.DXA },
                borders: cellBorder,
                children: [
                  new Paragraph({
                    alignment: colIdx === 0 ? AlignmentType.CENTER : AlignmentType.LEFT,
                    children: [
                      new TextRun({
                        text: val || '-',
                        size: 17,
                        font: 'Calibri',
                      }),
                    ],
                  }),
                ],
              })
          ),
        })
      );
    });
  });

  const mainTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: tableRows,
  });

  // 3. Abstract Table Rows
  const abstractTableRows = [
    new TableRow({
      tableHeader: true,
      children: [
        new TableCell({
          width: { size: 1200, type: WidthType.DXA },
          shading: { fill: 'EAEAEA', type: ShadingType.SOLID },
          borders: cellBorder,
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: 'Sl. No.', bold: true, size: 18, font: 'Calibri' })],
            }),
          ],
        }),
        new TableCell({
          width: { size: 8500, type: WidthType.DXA },
          shading: { fill: 'EAEAEA', type: ShadingType.SOLID },
          borders: cellBorder,
          children: [
            new Paragraph({
              alignment: AlignmentType.LEFT,
              children: [
                new TextRun({ text: 'Name of the Programmes', bold: true, size: 18, font: 'Calibri' }),
              ],
            }),
          ],
        }),
        new TableCell({
          width: { size: 2500, type: WidthType.DXA },
          shading: { fill: 'EAEAEA', type: ShadingType.SOLID },
          borders: cellBorder,
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: 'No. of Programmes', bold: true, size: 18, font: 'Calibri' }),
              ],
            }),
          ],
        }),
      ],
    }),
  ];

  const abstractData =
    Array.isArray(data.abstract) && data.abstract.length > 0 ? data.abstract : abstractList;

  abstractData.forEach((row, i) => {
    abstractTableRows.push(
      new TableRow({
        children: [
          new TableCell({
            width: { size: 1200, type: WidthType.DXA },
            borders: cellBorder,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: String(row.sl_no || i + 1), size: 18, font: 'Calibri' }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 8500, type: WidthType.DXA },
            borders: cellBorder,
            children: [
              new Paragraph({
                alignment: AlignmentType.LEFT,
                children: [new TextRun({ text: row.category || '', size: 18, font: 'Calibri' })],
              }),
            ],
          }),
          new TableCell({
            width: { size: 2500, type: WidthType.DXA },
            borders: cellBorder,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: String(row.count ?? 0), size: 18, font: 'Calibri', bold: true }),
                ],
              }),
            ],
          }),
        ],
      })
    );
  });

  const abstractTable = new Table({
    width: { size: 85, type: WidthType.PERCENTAGE },
    rows: abstractTableRows,
  });

  // Construct Document in Landscape orientation
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 720, right: 720 },
            size: { orientation: PageOrientation.LANDSCAPE },
          },
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: org.toUpperCase(),
                bold: true,
                size: 26,
                font: 'Calibri',
                color: '0F172A',
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
            children: [
              new TextRun({
                text: title.toUpperCase(),
                bold: true,
                size: 21,
                font: 'Calibri',
                color: '334155',
              }),
            ],
          }),
          mainTable,
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 360, after: 180 },
            children: [
              new TextRun({
                text: 'ABSTRACT OF PROGRAMMES',
                bold: true,
                size: 22,
                font: 'Calibri',
                color: '0F172A',
              }),
            ],
          }),
          abstractTable,
          new Paragraph({
            spacing: { before: 300 },
            children: [
              new TextRun({
                text:
                  data.notes ||
                  `Source status: Draft compiled from publicly available reports for ${formattedDate}; venue, timing, crowd and permission details not found publicly are marked for verification. This is an official Periscope DSR compilation.`,
                italics: true,
                size: 16,
                font: 'Calibri',
                color: '64748B',
              }),
            ],
          }),
          new Paragraph({
            spacing: { before: 100 },
            children: [
              new TextRun({
                text: `Prepared from verified intelligence and publicly available sources | ${formattedDate}`,
                size: 15,
                font: 'Calibri',
                color: '94A3B8',
              }),
            ],
          }),
        ],
      },
    ],
  });

  return await Packer.toBuffer(doc);
}

module.exports = {
  parseDocxBuffer,
  generateDocx,
  getDayOfWeek,
  normalizeDateStr,
};
