import type { CalendarEvent } from '../../domain/types';
import { eventsOn } from './schedule';

export const HOUR_HEIGHT = 60;
export function minutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}
export function clock(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}
export interface TimeBlock {
  event: CalendarEvent;
  start: number;
  end: number;
  lane: number;
  lanes: number;
}

// Partition each connected overlap group, so unrelated events regain full width.
export function timeBlocks(events: CalendarEvent[], date: string): TimeBlock[] {
  const blocks = eventsOn(events, date)
    .filter((event) => event.startTime !== null)
    .map((event) => ({
      event,
      start: event.startDate < date ? 0 : minutes(event.startTime!),
      end: event.endDate > date ? 1440 : minutes(event.endTime!),
      lane: 0,
      lanes: 1,
    }))
    .sort(
      (left, right) =>
        left.start - right.start ||
        right.end - left.end ||
        left.event.id.localeCompare(right.event.id),
    );
  let group: TimeBlock[] = [];
  let ends: number[] = [];
  function finish() {
    for (const block of group) block.lanes = ends.length;
    group = [];
    ends = [];
  }
  for (const block of blocks) {
    if (ends.length && block.start >= Math.max(...ends)) finish();
    let lane = ends.findIndex((end) => end <= block.start);
    if (lane === -1) lane = ends.length;
    ends[lane] = Math.max(block.end, block.start + 20);
    block.lane = lane;
    group.push(block);
  }
  finish();
  return blocks;
}

export function slotEvent(date: string, start: number): CalendarEvent {
  const end = Math.min(1440, start + 30);
  const nextDay = new Date(`${date}T12:00:00`);
  nextDay.setDate(nextDay.getDate() + 1);
  const next = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`;
  return {
    id: crypto.randomUUID(),
    title: '',
    startDate: date,
    endDate: end === 1440 ? next : date,
    startTime: clock(start),
    endTime: clock(end === 1440 ? 0 : end),
    caseId: null,
    location: '',
    notes: '',
  };
}
