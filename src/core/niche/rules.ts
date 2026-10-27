import type { Verification } from '../schema';

/**
 * Placement rules for hardware niches: how far hardware sits from a niche's visible edge, the gap between units,
 * where each die-cut label goes, and how tall each shelf space is. A rule set belongs to a show; every value keeps
 * its status and the page it was read from, the same way catalog values do.
 *
 * Lengths are millimetres. Values given in inches on the source drawings are stored converted (1" = 25.4 mm).
 */

export const IN = 25.4;

export interface RuleSource { id: string; title: string; publisher: string }

export interface RuleValue {
  value: number;
  status: Verification;
  sourceId?: string;
  /** page or drawing reference inside the source */
  ref?: string;
  note?: string;
}

/** what the rule does, for the interface and for the reasons given with every check */
export interface RuleDef { key: RuleKey; label: string; group: 'Niche' | 'Shelf' | 'Label' | 'Pedestal' | 'Rack'; meaning: string }

export type RuleKey =
  | 'centreAff' | 'edge' | 'gap' | 'depth' | 'void'
  | 'shelfThickness' | 'shelfDepth' | 'bottomSpace' | 'shelfClearMin' | 'topClearMin' | 'headroom'
  | 'labelBelow' | 'rowGap' | 'capStandard' | 'capSmall'
  | 'pedHeight' | 'pedEdge' | 'pedBack' | 'pedGap' | 'pedToLabel' | 'pedLabelToEdge'
  | 'rackLabelDrop';

export const RULE_DEFS: RuleDef[] = [
  { key: 'centreAff', label: 'Niche centre above floor', group: 'Niche', meaning: 'Every niche opening is centred on this height, so the hardware wall reads as one line.' },
  { key: 'edge', label: 'Visible edge to hardware', group: 'Niche', meaning: 'Clear space from the niche’s visible edge to the nearest hardware, on every side.' },
  { key: 'gap', label: 'Gap between units', group: 'Niche', meaning: 'Clear space between neighbouring pieces of hardware in a row.' },
  { key: 'depth', label: 'Niche depth', group: 'Niche', meaning: 'Clear depth inside the niche, front face to back panel.' },
  { key: 'void', label: 'Service void behind', group: 'Niche', meaning: 'Space behind the back panel for cables and LED tape.' },
  { key: 'shelfThickness', label: 'Shelf thickness', group: 'Shelf', meaning: 'Finished shelf thickness, including the opal acrylic in its rebate.' },
  { key: 'shelfDepth', label: 'Shelf depth', group: 'Shelf', meaning: 'Shelf depth from the back panel.' },
  { key: 'bottomSpace', label: 'Space below the lowest shelf', group: 'Shelf', meaning: 'From the bottom of the opening to the underside of the lowest shelf.' },
  { key: 'shelfClearMin', label: 'Minimum clear height between shelves', group: 'Shelf', meaning: 'Shelf top to the underside of the shelf above, at least.' },
  { key: 'topClearMin', label: 'Minimum clear height above the top shelf', group: 'Shelf', meaning: 'Top shelf to the top of the opening, at least.' },
  { key: 'headroom', label: 'Clear height above the tallest unit', group: 'Shelf', meaning: 'Each shelf space is at least the tallest unit on it plus this.' },
  { key: 'labelBelow', label: 'Label below hardware', group: 'Label', meaning: 'Wall-hung hardware: the top of each label sits this far below the lowest hardware in its row.' },
  { key: 'rowGap', label: 'Label to next row', group: 'Label', meaning: 'Wall-hung hardware: clear space from a row’s labels to the hardware below.' },
  { key: 'capStandard', label: 'Standard letter height', group: 'Label', meaning: 'Cap height of standard-size die-cut type.' },
  { key: 'capSmall', label: 'Smaller letter height', group: 'Label', meaning: 'Cap height of the smaller die-cut type, for small hardware.' },
  { key: 'pedHeight', label: 'Pedestal top above floor', group: 'Pedestal', meaning: 'Height of the pedestal or light table top the hardware stands on.' },
  { key: 'pedEdge', label: 'Pedestal side edge to hardware', group: 'Pedestal', meaning: 'Clear space from the pedestal’s left and right edges to the nearest hardware.' },
  { key: 'pedBack', label: 'Hardware to pedestal back edge', group: 'Pedestal', meaning: 'Clear space behind the deepest unit, at least.' },
  { key: 'pedGap', label: 'Gap between units on a pedestal', group: 'Pedestal', meaning: 'Clear space between neighbouring pieces of hardware on a pedestal.' },
  { key: 'pedToLabel', label: 'Hardware to label', group: 'Pedestal', meaning: 'From the front of the hardware to the top of its label. Units stand on one front line, so every label shares a top line.' },
  { key: 'pedLabelToEdge', label: 'Label to pedestal front edge', group: 'Pedestal', meaning: 'From the bottom of the label to the pedestal’s front edge.' },
  { key: 'rackLabelDrop', label: 'Rack top to label', group: 'Rack', meaning: 'From the top of the rack to the top of its label, on the front door.' },
];
export const RULE_DEF = new Map(RULE_DEFS.map((r) => [r.key, r]));

/** label behaviour that is a choice, not a measurement */
export interface LabelPolicy {
  /** labels start at the left edge of the hardware they name */
  alignLeft: true;
  /** shelf niches: label height is set on the shelf with the tallest unit, centred in the space above it, and reused on every shelf */
  shelfMode: 'centre-above-tallest';
  /** labels in one row share a line even where the hardware differs in height */
  rowAlign: 'shared';
  /** order of codes: top row first, left to right */
  order: 'rows-top-down';
  colour: string;
  /** server racks take a different vinyl, to read on the dark rack door */
  rackColour: string;
}

export interface NicheRuleSet {
  id: string;
  name: string;
  show: string;
  sources: RuleSource[];
  values: Record<RuleKey, RuleValue>;
  labels: LabelPolicy;
  /** rules stated in the sources that the generator does not apply, kept so nobody has to look them up again */
  notes: { text: string; sourceId: string; ref: string }[];
}

const FAB = 'berlin-fab-deck';
const ONSITE = 'berlin-onsite-deck';
const p = (value: number, ref: string, note?: string, sourceId = FAB): RuleValue => ({ value, status: 'project', sourceId, ref, note });
const est = (value: number, note: string): RuleValue => ({ value, status: 'estimated', note });

/**
 * GTC Berlin 2026, from Acronym's fabrication deck and pre-onsite deck. The label pages say they show GTC San Jose
 * examples of the intent; the pre-onsite deck repeats them as Berlin's own, and the deck's change log says Berlin's
 * niche paddings follow San Jose.
 */
export const BERLIN_2026: NicheRuleSet = {
  id: 'gtc-berlin-2026',
  name: 'GTC Berlin 2026',
  show: 'GTC Berlin 2026',
  sources: [
    { id: FAB, title: 'GTC Berlin 2026 fabrication deck', publisher: 'Acronym (project document)' },
    { id: ONSITE, title: 'GTC Berlin 2026 pre-onsite deck, 10.08.2026', publisher: 'Acronym (project document)' },
  ],
  values: {
    centreAff: p(1675, 'pp.55, 59, 73', 'Niche GA drawings: 1132 sill + 1085 opening; 1047 sill + 1255 opening.'),
    edge: p(7 * IN, 'p.184', '7" on the GTC San Jose DGX Spark niche, which Berlin follows (p.176).'),
    gap: p(4 * IN, 'p.184', '4" between units and from each shelf end on the GTC San Jose DGX Spark niche.'),
    depth: p(220, 'p.55', 'DGX Spark niche; the RTX PRO cards niche is 180 deep (p.59).'),
    void: p(75, 'pp.55, 59, 73'),
    shelfThickness: p(36, 'pp.55, 59, 169', '18 mm FR MDF double layer with 5 mm opal acrylic in a rebate.'),
    shelfDepth: p(200, 'p.55', 'DGX Spark niche; the RTX PRO cards niche uses 140 (p.59).'),
    bottomSpace: p(162, 'p.55', 'The RTX PRO cards niche has 177 (p.59).'),
    shelfClearMin: p(275, 'p.55', 'DGX Spark niche, between shelves.'),
    topClearMin: p(265, 'p.55', 'DGX Spark niche, above the top shelf.'),
    headroom: p(203, 'p.59', 'RTX PRO cards niche: 315 clear over a 112 mm card, 340 over a 137 mm card.'),
    labelBelow: p(2 * IN, 'p.119; pre-onsite p.66', '2" below hardware.', ONSITE),
    rowGap: est(4 * IN, 'Not stated. Taken as the 4" gap between units.'),
    capStandard: est(10, 'Not stated in the decks; scaled from the p.119 example. Confirm against the graphics files.'),
    capSmall: est(6, 'Not stated in the decks; scaled from the p.119 example. Confirm against the graphics files.'),
    pedHeight: p(900, 'pp.56, 70', 'Berlin’s light tables are 900 high with an opal acrylic top.'),
    pedEdge: est(200, 'Not dimensioned; scaled from the p.121 San Jose pedestal example. Berlin’s light tables are a fixed size (pp.56, 70), so fix the width to the table.'),
    pedBack: est(90, 'Not dimensioned; scaled from the p.121 San Jose pedestal example.'),
    pedGap: est(120, 'Not dimensioned; scaled from the p.121 San Jose pedestal example.'),
    pedToLabel: p(50, 'p.121', '50 mm from the hardware to the label; labels top-aligned and left-aligned per unit.'),
    pedLabelToEdge: p(90, 'p.121', '90 mm from the label to the pedestal edge.'),
    rackLabelDrop: est(150, 'Not dimensioned in the decks; the renders on pp.129–140 show the label centred on the door just under the rack’s top panel. Confirm against the graphics files.'),
  },
  labels: { alignLeft: true, shelfMode: 'centre-above-tallest', rowAlign: 'shared', order: 'rows-top-down', colour: 'black die-cut vinyl', rackColour: 'white die-cut vinyl' },
  notes: [
    { text: 'Lit niches: LED strip recessed 130 mm behind the cabinet lip, around the perimeter only; back and sides not backlit; matte white back panel.', sourceId: FAB, ref: 'pp.169–170' },
    { text: 'Trays thru-bolt to a custom bracket on the niche back with a 1.5" spacer block behind it.', sourceId: FAB, ref: 'pp.72, 75, 78, 83' },
    { text: 'Labels are black die-cut vinyl on niches and pedestals, white on server racks.', sourceId: ONSITE, ref: 'pp.69–87' },
  ],
};

export const RULE_SETS: NicheRuleSet[] = [BERLIN_2026];
export const RULE_SET_BY_ID = new Map(RULE_SETS.map((r) => [r.id, r]));

/** a rule set with the values someone has changed in this browser laid over it */
export function withOverrides(base: NicheRuleSet, over: Partial<Record<RuleKey, RuleValue>> | undefined): NicheRuleSet {
  if (!over || !Object.keys(over).length) return base;
  return { ...base, values: { ...base.values, ...over } };
}

/** a length in feet and inches to the nearest eighth, as drawings write it: 4'-11 1/8", 7 1/8" */
export function inches(mm: number): string {
  const eighths = Math.round((mm / IN) * 8);
  const neg = eighths < 0;
  const e = Math.abs(eighths);
  const ft = Math.floor(e / 96), rest = e % 96;
  const whole = Math.floor(rest / 8);
  let frac = rest % 8, den = 8;
  while (frac && frac % 2 === 0) { frac /= 2; den /= 2; }
  const inch = `${whole ? whole : frac ? '' : '0'}${frac ? `${whole ? ' ' : ''}${frac}/${den}` : ''}"`;
  return `${neg ? '−' : ''}${ft ? `${ft}'-` : ''}${inch}`;
}
