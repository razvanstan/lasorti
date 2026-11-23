import type { DrawState, GiveawayInfo, Person, Prize, Result } from './types';

export interface Prepared {
  list: Person[];
  prizes: Prize[];
  dupCount: number;
  error?: string;
  summary: string;
  reportHtml: string;
  droppedHtml: string;
  gw?: GiveawayInfo;
}

export type Row = Result & { n: number };
export type Column = [header: string, value: (row: Row) => unknown];

/** Everything that differs between the draw types. */
export interface DrawKind {
  id: 'tombola' | 'giveaway';
  /** Part of the localStorage keys. */
  storagePrefix: string;
  filePrefix: string;
  defaultTitle: string;
  defaultSubtitle: string;
  nextLabel: string;
  drawnUnit: string;

  prepare(): Prepared;
  positionText(state: DrawState): string;
  remainingText(count: number): string;
  winnerNote(state: DrawState, winner: Person): string;
  finalView(state: DrawState): { subtitle: string; html: string };

  /** On screen and in the report. */
  columns(state: DrawState): Column[];
  /** Copied to the clipboard, for the organiser's own spreadsheet. */
  sheetColumns(state: DrawState): Column[];
  csvColumns(state: DrawState): Column[];

  report: {
    title: string;
    winnersHeading: string;
    factsHtml(state: DrawState): string;
    redrawColumns: [header: string, value: (redraw: DrawState['redraws'][number], state: DrawState) => unknown][];
    toolScope: string;
    organizerDuties: string;
  };
}
