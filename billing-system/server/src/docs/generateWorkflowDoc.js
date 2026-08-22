import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';

/**
 * Generates the workflow document.
 *
 *   npm run docs:workflow
 *
 * Written as a script rather than a file somebody edits by hand, because a
 * workflow document that is not regenerated goes out of date silently and then
 * actively misleads — which is worse than not having one. Everything described
 * here is covered by the `workflows` acceptance suite, so if the document is
 * wrong, that suite should be failing.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../../../docs/Billing-and-Warehouse-Workflow.pdf');

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const INK = '#1a1a1a';
const MUTED = '#5f6b7a';
const RULE = '#d8dee6';
const ACCENT = '#1f5f8b';
const BASIC = '#2e7d5b';
const ADVANCED = '#8b5a1f';

const PAGE = { size: 'A4', margins: { top: 56, bottom: 56, left: 56, right: 56 } };
const WIDTH = 595.28 - 112;

function heading(doc, text, colour = ACCENT) {
  if (doc.y > 690) doc.addPage();
  doc.moveDown(0.8);
  doc.fillColor(colour).font('Helvetica-Bold').fontSize(15).text(text);
  doc.moveTo(doc.x, doc.y + 3).lineTo(doc.x + WIDTH, doc.y + 3)
    .strokeColor(RULE).lineWidth(0.75).stroke();
  doc.moveDown(0.6);
  doc.fillColor(INK).font('Helvetica').fontSize(10);
}

function subheading(doc, text) {
  if (doc.y > 710) doc.addPage();
  doc.moveDown(0.5);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(11).text(text);
  doc.moveDown(0.25);
  doc.font('Helvetica').fontSize(10);
}

function para(doc, text) {
  if (doc.y > 730) doc.addPage();
  doc.fillColor(INK).font('Helvetica').fontSize(10)
    .text(text, { align: 'left', lineGap: 2.5 });
  doc.moveDown(0.45);
}

/** A numbered step in a workflow. */
function stepItem(doc, n, title, detail) {
  if (doc.y > 700) doc.addPage();
  const top = doc.y;
  doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(10)
    .text(`${n}.`, doc.page.margins.left, top, { width: 20 });
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(10)
    .text(title, doc.page.margins.left + 20, top, { width: WIDTH - 20 });
  if (detail) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(9.5)
      .text(detail, doc.page.margins.left + 20, doc.y + 1, { width: WIDTH - 20, lineGap: 2 });
  }
  doc.x = doc.page.margins.left;
  doc.moveDown(0.55);
}

/**
 * A boxed rule.
 *
 * Reserved for the handful of things that are genuinely load-bearing — the
 * invariants somebody would otherwise break by writing perfectly reasonable
 * code. Used sparingly so it keeps meaning something.
 */
function ruleBox(doc, title, text) {
  const padding = 10;
  doc.font('Helvetica').fontSize(9.5);
  const bodyHeight = doc.heightOfString(text, { width: WIDTH - padding * 2 - 4, lineGap: 2 });
  const boxHeight = bodyHeight + padding * 2 + 14;

  if (doc.y + boxHeight > 760) doc.addPage();

  const top = doc.y;
  const left = doc.page.margins.left;

  doc.save();
  doc.rect(left, top, WIDTH, boxHeight).fillColor('#f4f7fa').fill();
  doc.rect(left, top, 3, boxHeight).fillColor(ACCENT).fill();
  doc.restore();

  doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(9)
    .text(title.toUpperCase(), left + padding + 4, top + padding, { width: WIDTH - padding * 2 - 4, characterSpacing: 0.6 });
  doc.fillColor(INK).font('Helvetica').fontSize(9.5)
    .text(text, left + padding + 4, doc.y + 2, { width: WIDTH - padding * 2 - 4, lineGap: 2 });

  doc.x = left;
  doc.y = top + boxHeight;
  doc.moveDown(0.7);
}

/** A simple two-column reference table. */
function table(doc, columns, rows, widths) {
  const left = doc.page.margins.left;
  const rowGap = 5;

  const drawRow = (cells, bold) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
    const heights = cells.map((c, i) => doc.heightOfString(String(c), { width: widths[i] - 8, lineGap: 1.5 }));
    const height = Math.max(...heights) + rowGap * 2;

    if (doc.y + height > 760) {
      doc.addPage();
      drawRow(columns, true);
    }

    const top = doc.y;
    if (bold) {
      doc.save().rect(left, top, WIDTH, height).fillColor('#eef2f6').fill().restore();
    }

    let x = left;
    cells.forEach((cell, i) => {
      doc.fillColor(bold ? INK : MUTED).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
        .text(String(cell), x + 4, top + rowGap, { width: widths[i] - 8, lineGap: 1.5 });
      x += widths[i];
    });

    doc.y = top + height;
    doc.moveTo(left, doc.y).lineTo(left + WIDTH, doc.y)
      .strokeColor(RULE).lineWidth(0.5).stroke();
    doc.x = left;
  };

  drawRow(columns, true);
  rows.forEach((row) => drawRow(row, false));
  doc.moveDown(0.8);
}

/**
 * A flow like `Order » Allocate » Pick`, drawn as connected labels.
 *
 * The separator is a guillemet rather than an arrow because the built-in
 * Helvetica encodes WinAnsi, which has no U+2192. An arrow silently becomes
 * a blank glyph — the diagram still lays out, it just stops meaning anything.
 */
function flow(doc, steps) {
  if (doc.y > 700) doc.addPage();
  doc.moveDown(0.2);
  const text = steps.join('   »   ');
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(ACCENT)
    .text(text, { width: WIDTH, lineGap: 4 });
  doc.fillColor(INK).font('Helvetica').fontSize(10);
  doc.moveDown(0.6);
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

function coverPage(doc, generatedOn) {
  doc.rect(0, 0, 595.28, 200).fillColor('#12354f').fill();

  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(26)
    .text('Billing & Warehouse', 56, 74, { width: WIDTH });
  doc.fillColor('#9fc6e0').font('Helvetica-Bold').fontSize(26)
    .text('Operating Workflow', 56, doc.y, { width: WIDTH });

  doc.fillColor('#c9dced').font('Helvetica').fontSize(10.5)
    .text('One application, two modes — from a single counter to a multi-warehouse operation',
      56, doc.y + 8, { width: WIDTH });

  doc.y = 240;
  doc.x = 56;

  para(doc,
    'This document describes how the system is actually operated, end to end. It covers '
    + 'the Basic workflow — the one a single shop runs every day — and the Advanced '
    + 'workflow that a multi-location or third-party warehouse business runs on the same '
    + 'database, with the same records, when it grows into it.');

  para(doc,
    'It is deliberately a description of the working system rather than a specification of '
    + 'an intended one. Every step below is exercised by the automated workflow suite, so a '
    + 'step that stopped being true would show up as a failing test rather than as a '
    + 'document quietly drifting away from the software.');

  ruleBox(doc, 'The governing principle',
    'There is one application, one database and one set of business rules. Basic and '
    + 'Advanced are not separate products or separate installations — they are the same '
    + 'system with different modules switched on. A shop that grows does not migrate; it '
    + 'turns things on, and its existing stock, customers, ledgers and history carry '
    + 'straight over.');

  doc.moveDown(1.5);
  doc.fillColor(MUTED).font('Helvetica').fontSize(9)
    .text(`Generated ${generatedOn}`, { width: WIDTH });
  doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(9)
    .text('Regenerate with: npm run docs:workflow', { width: WIDTH });
}

function modesSection(doc) {
  doc.addPage();
  heading(doc, 'The two modes');

  para(doc,
    'Business mode decides which modules are available. Basic modules are always on. '
    + 'Advanced modules appear only in Advanced mode, and each can still be switched off '
    + 'individually — so a warehouse business that has no interest in double-entry '
    + 'bookkeeping simply does not have it.');

  table(doc,
    ['Capability', 'Basic', 'Advanced'],
    [
      ['Counter billing, invoices, returns', 'Yes', 'Yes'],
      ['Products, customers, suppliers, purchases', 'Yes', 'Yes'],
      ['Customer & supplier ledger (udhar / khata)', 'Yes', 'Yes'],
      ['Expenses, cash register, cash flow', 'Yes', 'Yes'],
      ['Batch & expiry tracking', 'Optional', 'Yes'],
      ['Stock audit and reconciliation', 'Yes', 'Yes'],
      ['Warehouses, zones, aisles, racks, bins', '—', 'Yes'],
      ['Purchase orders and goods receipt (GRN)', '—', 'Yes'],
      ['Put-away, picking, packing, dispatch', '—', 'Yes'],
      ['Stock transfers between locations', '—', 'Yes'],
      ['Serial number tracking', '—', 'Yes'],
      ['Approval workflow', '—', 'Yes'],
      ['Double-entry accounting and financials', '—', 'Yes'],
      ['Third-party (3PL) stock and storage billing', '—', 'Optional'],
    ],
    [WIDTH - 150, 75, 75]);

  ruleBox(doc, 'Switching modes is safe and reversible',
    'Moving to Advanced does not rewrite anything. Stock, ledgers and history are '
    + 'untouched; new capabilities simply become reachable. Switching back closes those '
    + 'doors again and leaves the data intact. This is verified in both directions.');
}

function basicWorkflow(doc) {
  doc.addPage();
  heading(doc, 'Basic workflow — the shop day', BASIC);

  para(doc,
    'This is the whole operating cycle for a single-counter business: set up what you '
    + 'sell, buy it in, sell it, take the money, record what it cost you, and check at the '
    + 'end that the numbers agree with themselves.');

  flow(doc, ['Set up', 'Buy in', 'Sell', 'Take payment', 'Record costs', 'Close the day', 'Check']);

  subheading(doc, 'Setting up what you sell');
  stepItem(doc, 1, 'Create categories and products',
    'A product carries its purchase price, selling price, MRP and GST rate. It can also '
    + 'carry a secondary unit — for example 1 BOX = 10 PKT — which lets you buy in boxes '
    + 'and sell in packets without doing arithmetic in your head.');
  stepItem(doc, 2, 'Add suppliers and customers',
    'A customer added at the counter mid-bill is the common case, so the invoice screen '
    + 'can create one inline without leaving the sale.');

  ruleBox(doc, 'MRP is enforced at entry',
    'Selling above a printed MRP is refused when the product is saved, not discovered '
    + 'later on a bill. A secondary unit without a real conversion factor is refused for '
    + 'the same reason — it looks like a working setup while silently billing the wrong '
    + 'quantity.');

  subheading(doc, 'Goods coming in');
  stepItem(doc, 3, 'Record a purchase',
    'Entered in whichever unit the supplier invoiced. Buying 5 BOX of a product whose '
    + 'conversion is 10 adds 50 packets to stock, and the purchase, the stock movement and '
    + 'the supplier ledger entry are written together.');

  subheading(doc, 'Selling');
  stepItem(doc, 4, 'Raise an invoice, or bill at the counter',
    'Cash, card, UPI, bank transfer or credit. Stock falls as the bill is saved, and the '
    + 'movement is written in the same transaction — a sale can never reduce stock without '
    + 'leaving a trace, or leave a trace without reducing stock.');
  stepItem(doc, 5, 'Selling more than you have is refused',
    'Unless the company has deliberately allowed negative stock. Two counters selling the '
    + 'last unit at the same moment resolve to one sale and one clear refusal, not two '
    + 'sales and a mystery.');

  subheading(doc, 'Money');
  stepItem(doc, 6, 'Record payments against the bill',
    'Part payments are normal. What a customer owes is always derived from their ledger '
    + 'rather than stored on their record — a cached balance is the thing that goes stale '
    + 'and gets argued over.');
  stepItem(doc, 7, 'Udhar / khata',
    'The running account for a party, showing every bill and payment in order, with the '
    + 'closing balance at the bottom.');

  subheading(doc, 'Costs and the day\'s cash');
  stepItem(doc, 8, 'Record expenses',
    'Rent, electricity, wages, repairs. These are Basic-mode features on purpose: the '
    + 'smallest shop tracks them, and only double-entry bookkeeping is genuinely advanced.');
  stepItem(doc, 9, 'Open the till in the morning, close it at night',
    'Opening float in, closing count out, with the difference visible rather than absorbed.');

  subheading(doc, 'Checking');
  stepItem(doc, 10, 'Reconcile stock',
    'Three things should agree about every product: the balance, the sum of its movements, '
    + 'and the sum of its lots. The audit reports any that do not, valued at cost, so the '
    + 'largest problem is dealt with first.');
  stepItem(doc, 11, 'Reports and alerts',
    'Sales, stock valuation and GST reports. The notification bell raises low stock, '
    + 'expiring lots, overdue receivables and any drift the audit found.');
}

function advancedWorkflow(doc) {
  doc.addPage();
  heading(doc, 'Advanced workflow — the warehouse', ADVANCED);

  para(doc,
    'Everything in the Basic workflow still applies. What follows is what the same company '
    + 'gains when it operates a real warehouse: a physical layout, a controlled buying '
    + 'process, and a fulfilment cycle where goods are tracked from the receiving bay to '
    + 'the customer\'s door.');

  subheading(doc, 'The building');
  para(doc,
    'A location is described as a tree, and every rung is optional — a small godown can '
    + 'stop at "Zone A" and never define a bin.');
  flow(doc, ['Warehouse', 'Zone', 'Aisle', 'Rack', 'Shelf', 'Bin']);

  stepItem(doc, 1, 'Define the layout, then generate a walking route',
    'Each bin gets a pick sequence: its position in the order a picker walks past it. The '
    + 'generated route is a serpentine — down the first aisle, back up the second — which '
    + 'is what a picker does naturally. Sequences are numbered with gaps so a new bin can '
    + 'be inserted later without renumbering the building.');

  ruleBox(doc, 'The tree and the route answer different questions',
    'The tree says what contains what. It cannot say that the last rack of aisle 1 is next '
    + 'to the last rack of aisle 2, because they sit in different branches. Picking by tree '
    + 'order therefore walks the length of the building once per aisle. The pick sequence '
    + 'is the authority on routing, and it is set by whoever knows the building.');

  subheading(doc, 'Buying: purchase order to shelf');
  flow(doc, ['PO raised', 'Approved', 'GRN received', 'Posted to stock', 'Put away']);

  stepItem(doc, 2, 'Raise and approve a purchase order',
    'Orders below the approval threshold clear on submission; larger ones wait for a '
    + 'decision. Approval rules are configurable per document type and value.');
  stepItem(doc, 3, 'Receive goods against it (GRN)',
    'Ordered, received and accepted quantities are recorded separately, so a short or '
    + 'damaged delivery is visible rather than averaged away.');
  stepItem(doc, 4, 'Post the receipt',
    'A saved GRN has not moved stock. Posting it is the deliberate act that does, which '
    + 'means a receipt can be checked and corrected before it affects anything.');
  stepItem(doc, 5, 'Put away',
    'Posted stock lands in the receiving bay and appears on the put-away queue until it is '
    + 'on a shelf. Put-away rules suggest where each product should go — cold goods to cold '
    + 'storage, fast movers near dispatch — but only suggest: the storeman can always '
    + 'choose otherwise, because a rule pointing at a full bin must not stop the work.');

  subheading(doc, 'Selling: order to doorstep');
  flow(doc, ['Order', 'Allocate', 'Route', 'Pick', 'Pack', 'Dispatch', 'Delivered']);

  stepItem(doc, 6, 'Allocate',
    'Sets stock aside for the order. Nothing physical happens — what changes is that the '
    + 'goods are now spoken for, which is what stops two orders promising the same last box '
    + 'to two customers. A partial allocation is normal and is reported as such.');
  stepItem(doc, 7, 'Produce the pick list',
    'Which bin to walk to for each line, oldest lot first, then ordered into a single walk '
    + 'across the whole order — not one walk per product.');
  stepItem(doc, 8, 'Release the route as tasks',
    'Each stop becomes a warehouse task with the bin, product, quantity and walk position '
    + 'on it. From here the work is assignable, measurable and can be handed over at shift '
    + 'change.');
  stepItem(doc, 9, 'Pick, then pack',
    'Picking takes goods off the shelf onto the packing bench. Packing puts them into '
    + 'cartons, each with its own package number and weight.');
  stepItem(doc, 10, 'Dispatch, then track delivery',
    'Courier and tracking number are recorded, and the order can be followed through to '
    + 'delivered.');

  ruleBox(doc, 'Stock leaves the location exactly once, at dispatch',
    'Allocation, picking and packing all happen inside the building, so the location total '
    + 'must not move. Only dispatch takes goods out. This is why the shelf figure does not '
    + 'change when an order is picked — and why a cancelled pick can put everything back '
    + 'without anything needing to be unwound.');

  ruleBox(doc, 'Expiry decides what is picked; the route decides only the order',
    'Oldest lot first is an inventory rule and is not negotiable. The walking route is '
    + 'applied afterwards, to picks that have already been chosen. Folding the two together '
    + 'would let a shorter walk quietly outrank the expiry rule, and the first anybody would '
    + 'know is a write-off.');

  subheading(doc, 'Moving and correcting stock');
  stepItem(doc, 11, 'Transfer between locations',
    'Raised, approved, dispatched from one location and received at the other. Both legs '
    + 'are written to the ledger, and goods in transit are visible as such rather than '
    + 'missing.');
  stepItem(doc, 12, 'Adjustments and counts',
    'Damage, expiry and counting differences are recorded as adjustments with a reason. '
    + 'Cycle counts can be run per location without stopping the warehouse.');

  subheading(doc, 'Exceptions and labour');
  stepItem(doc, 13, 'Raise an exception when something is wrong',
    'Short picks, over-receipts, damaged stock, wrong bin, wrong product, stock mismatch, '
    + 'expired batch, missing scan. Raising one is quick and never blocks the picker — '
    + 'forcing them to stop and reconcile means, in practice, that they stop reporting.');
  stepItem(doc, 14, 'Resolve it with an account of what was done',
    'Closing an exception requires a resolution note. "Resolved" with no explanation is '
    + 'indistinguishable from ignored, except that it also hides the problem.');
  stepItem(doc, 15, 'Measure the work',
    'Because every job is a task with a start and finish time, productivity per person and '
    + 'per task type falls out without anybody filling in a timesheet.');

  subheading(doc, 'Third-party (3PL) storage');
  para(doc,
    'Optional, and off unless switched on. It lets the warehouse hold goods belonging to '
    + 'other companies alongside its own.');

  stepItem(doc, 16, 'Register the client and receive their goods',
    'Their stock is held against them, at the same locations and in the same bins as '
    + 'yours, with a rate card for storage and handling.');
  stepItem(doc, 17, 'Capture storage daily, bill monthly',
    'A snapshot of what was held is written every day by a background job. The monthly '
    + 'bill is the sum of those days.');

  ruleBox(doc, 'A client\'s goods are never yours',
    'Client stock is not sellable, not in your valuation, not in your catalogue total and '
    + 'not pickable on your orders. The separation is structural — a separate balance — '
    + 'rather than a filter somebody has to remember to apply.');

  ruleBox(doc, 'Storage charges are never recalculated from current stock',
    'Goods that arrived on the 3rd and left on the 11th are invisible in a month-end '
    + 'balance, yet eight days are owed on them. Each day is written down while it is still '
    + 'true and never recomputed, so the same period billed twice gives the same figure.');

  subheading(doc, 'The books');
  stepItem(doc, 18, 'Double-entry accounting',
    'Sales, purchases, payments and expenses post to a chart of accounts automatically. '
    + 'Trial balance, profit and loss, and balance sheet are derived from the journal — '
    + 'never from stored totals — so they cannot disagree with it.');
}

function invariants(doc) {
  doc.addPage();
  heading(doc, 'The rules that hold it together');

  para(doc,
    'These are the invariants the system is built around. They are listed because each one '
    + 'is easy to break by writing perfectly reasonable code, and because breaking any of '
    + 'them produces a problem that surfaces weeks later as unexplainable drift.');

  table(doc,
    ['Rule', 'Why it matters'],
    [
      ['Stock only moves through one engine',
        'Quantity and ledger entry are written together, in one transaction. A movement '
        + 'that changed stock without leaving a trace is the one bug an inventory system '
        + 'cannot recover from.'],
      ['Bin quantities never exceed location stock',
        'Bins are a sub-allocation of the location, not a second copy. Anything that takes '
        + 'goods out of a location releases them from their shelves too — enforced centrally, '
        + 'because the next outbound path somebody writes would forget.'],
      ['The difference is the receiving bay',
        'Stock at a location but in no bin is goods that have arrived and not yet been put '
        + 'away. Real warehouses have one, so the model does too.'],
      ['Ownership is a dimension of stock',
        'Every balance belongs to exactly one owner. A shop has one — itself — and never '
        + 'notices. Quantities never mingle across owners.'],
      ['Catalogue stock and valuation are house-only',
        'Counting a client\'s goods would silence reorder alerts on things you have none of, '
        + 'and put someone else\'s inventory on your balance sheet.'],
      ['Statements are derived, never stored',
        'Balances, trial balance and financials are computed from their underlying entries '
        + 'so they cannot drift away from them.'],
      ['A repeated request happens once',
        'Scanner operations carry an idempotency key. The unique index arbitrates, so two '
        + 'copies of a request cannot both do the work.'],
      ['A task completes once',
        'Guarded in the database, not in application logic. Two devices racing to finish '
        + 'one job resolve to one completion and one stock movement.'],
      ['Deletion is soft, and audited',
        'Records are marked rather than removed, with who and when, so history stays '
        + 'reconstructible.'],
    ],
    [165, WIDTH - 165]);
}

function operatingNotes(doc) {
  doc.addPage();
  heading(doc, 'Operating notes');

  subheading(doc, 'Daily');
  para(doc,
    'A background job captures the previous day\'s storage position and sweeps expired '
    + 'idempotency keys. It runs on its own and catches up any days a switched-off server '
    + 'missed. It is safe to re-run: a duplicate day collides rather than billing twice.');

  subheading(doc, 'Before invoicing a storage period');
  para(doc,
    'Check for missing snapshot days. A bill built over a period with gaps is quietly '
    + 'short, and the only moment anybody would notice is when the client queries it. The '
    + 'bill reports its own completeness for this reason.');

  subheading(doc, 'Before printing pick routes');
  para(doc,
    'Check the route health for unsequenced bins. A bin with no pick sequence still works '
    + '— it is visited at the end rather than failing the pick — but it means part of the '
    + 'layout has not been thought about.');

  subheading(doc, 'First run against an existing database');
  para(doc,
    'Take a backup. The first boot after an upgrade applies schema changes, attributes '
    + 'existing stock to the house owner, and renames any duplicate bin codes within a '
    + 'warehouse so the uniqueness rule can be enforced. Every rename is logged so the '
    + 'shelf label can be corrected.');

  subheading(doc, 'Roles');
  table(doc,
    ['Role', 'Typically does'],
    [
      ['Admin', 'Everything, including settings, modes and modules.'],
      ['Accountant', 'Books, approvals, financial reports, storage billing.'],
      ['Warehouse Manager', 'Layout, routes, task assignment, exceptions, counts.'],
      ['Inventory Staff', 'Put-away, picking, packing, raising exceptions.'],
      ['Purchase Manager', 'Purchase orders, goods receipt, suppliers.'],
      ['Sales', 'Counter billing, invoices, customers, quotations.'],
      ['Branch Manager', 'One location\'s trading, cash and transfers.'],
      ['Auditor', 'Read-only across stock audit and reports.'],
    ],
    [140, WIDTH - 140]);

  para(doc,
    'Rights are also granted per location, at three levels: View, Operate and Manage. An '
    + 'area manager can read three branches while billing at only one.');
}

// ---------------------------------------------------------------------------

function generateWorkflowDoc(outputPath = OUT) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  // Pages are buffered so the footer can say "3 of 9" — the total is not known
  // until the last page has been written.
  const doc = new PDFDocument({ ...PAGE, autoFirstPage: false, bufferPages: true, info: {
    Title: 'Billing & Warehouse Operating Workflow',
    Author: 'Billing System',
    Subject: 'Basic and Advanced operating workflows',
  } });

  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  const generatedOn = new Date().toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  doc.addPage();
  coverPage(doc, generatedOn);
  modesSection(doc);
  basicWorkflow(doc);
  advancedWorkflow(doc);
  invariants(doc);
  operatingNotes(doc);

  // Page numbers, added at the end so the total is known.
  //
  // The footer sits below the bottom margin, which pdfkit treats as an overflow
  // and answers by starting a new page — one blank page per footer, and the
  // loop then numbers those too. Dropping the bottom margin for the duration
  // makes the footer land on the page it belongs to.
  const range = doc.bufferedPageRange?.();
  if (range) {
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      const bottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.fillColor(MUTED).font('Helvetica').fontSize(8)
        .text(`${i + 1} of ${range.count}`, 56, doc.page.height - 38, {
          width: WIDTH, align: 'center', lineBreak: false,
        });
      doc.page.margins.bottom = bottom;
    }
  }

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve(outputPath));
    stream.on('error', reject);
  });
}

// Run directly: node src/docs/generateWorkflowDoc.js
if (process.argv[1] && process.argv[1].endsWith('generateWorkflowDoc.js')) {
  generateWorkflowDoc()
    .then((file) => {
      const { size } = fs.statSync(file);
      console.log(`Workflow document written to ${file} (${Math.round(size / 1024)} KB)`);
    })
    .catch((error) => {
      console.error(`Could not generate the workflow document: ${error.message}`);
      process.exit(1);
    });
}
