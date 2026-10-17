import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import type { CaseStatus } from '../../domain/types';
export const trashTarget = '__case_trash__';

export interface BoardDrag {
  id: string;
  over: string | null;
  x: number;
  y: number;
  width: number;
  keyboard: boolean;
}
interface Gesture {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  width: number;
  started: boolean;
}

export function useBoardDrag(
  board: RefObject<HTMLDivElement | null>,
  statuses: CaseStatus[],
  disabled: boolean,
  onDrop: (id: string, statusId: string) => void,
) {
  const [drag, setDrag] = useState<BoardDrag | null>(null);
  const current = useRef<BoardDrag | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const suppressClickUntil = useRef(0);
  const options = useRef({ statuses, disabled, onDrop });
  options.current = { statuses, disabled, onDrop };
  const update = (value: BoardDrag | null) => {
    current.current = value;
    setDrag(value);
  };

  useEffect(() => {
    let animation = 0;
    let pointer = { x: 0, y: 0 };
    function target(x: number, y: number) {
      if (document.elementFromPoint(x, y)?.closest('[data-case-trash-target]')) return trashTarget;
      const root = board.current;
      if (!root) return null;
      const bounds = root.getBoundingClientRect();
      if (
        x < bounds.left ||
        x > bounds.right ||
        y < bounds.top ||
        y > Math.max(bounds.bottom, bounds.top + 160) + 24
      )
        return null;
      for (const column of root.querySelectorAll<HTMLElement>('[data-status-id]')) {
        const rect = column.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right) return column.dataset.statusId ?? null;
      }
      return null;
    }
    function autoScroll() {
      const root = board.current;
      if (!root || !gesture.current?.started || !current.current) return;
      const bounds = root.getBoundingClientRect();
      if (pointer.y >= bounds.top && pointer.y <= Math.max(bounds.bottom, bounds.top + 160) + 24) {
        const edge = 44;
        const delta =
          pointer.x < bounds.left + edge ? -10 : pointer.x > bounds.right - edge ? 10 : 0;
        if (delta) {
          root.scrollLeft += delta;
          const over = target(pointer.x, pointer.y);
          if (over !== current.current.over) update({ ...current.current, over });
        }
      }
      animation = requestAnimationFrame(autoScroll);
    }
    function reset() {
      cancelAnimationFrame(animation);
      if (current.current) suppressClickUntil.current = Date.now() + 300;
      gesture.current = null;
      update(null);
      document.body.classList.remove('dragging-case');
    }
    function move(event: PointerEvent) {
      const value = gesture.current;
      if (!value || value.pointerId !== event.pointerId) return;
      pointer = { x: event.clientX, y: event.clientY };
      if (!value.started && Math.hypot(pointer.x - value.startX, pointer.y - value.startY) < 7)
        return;
      event.preventDefault();
      if (!value.started) {
        value.started = true;
        document.body.classList.add('dragging-case');
        animation = requestAnimationFrame(autoScroll);
      }
      update({
        id: value.id,
        over: target(pointer.x, pointer.y),
        x: pointer.x - value.offsetX,
        y: pointer.y - value.offsetY,
        width: value.width,
        keyboard: false,
      });
    }
    function end(event: PointerEvent) {
      if (gesture.current?.pointerId !== event.pointerId) return;
      const value = current.current;
      const over = target(event.clientX, event.clientY);
      reset();
      if (value && over) options.current.onDrop(value.id, over);
    }
    function key(event: KeyboardEvent) {
      const value = current.current;
      if (!value) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        reset();
        return;
      }
      if (!value.keyboard) return;
      if (event.key === 'Tab') event.preventDefault();
      if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'Enter', ' '].includes(event.key))
        event.preventDefault();
      if (event.key === 'Enter' || event.key === ' ') {
        reset();
        if (value.over) options.current.onDrop(value.id, value.over);
      } else if (event.key === 'ArrowDown') {
        update({ ...value, over: trashTarget });
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const values = options.current.statuses;
        const index = values.findIndex((status) => status.id === value.over);
        const next =
          values[
            Math.max(0, Math.min(values.length - 1, index + (event.key === 'ArrowLeft' ? -1 : 1)))
          ];
        if (next) {
          update({ ...value, over: next.id });
          Array.from(board.current?.querySelectorAll<HTMLElement>('[data-status-id]') ?? [])
            .find((column) => column.dataset.statusId === next.id)
            ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
      }
    }
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', reset);
    window.addEventListener('blur', reset);
    window.addEventListener('keydown', key);
    return () => {
      cancelAnimationFrame(animation);
      document.body.classList.remove('dragging-case');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', reset);
      window.removeEventListener('blur', reset);
      window.removeEventListener('keydown', key);
    };
  }, [board]);

  return {
    drag,
    pointerDown(event: ReactPointerEvent<HTMLButtonElement>, id: string) {
      if (event.button !== 0 || options.current.disabled || current.current) return;
      const rect = event.currentTarget.getBoundingClientRect();
      gesture.current = {
        id,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        width: rect.width,
        started: false,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    lift(id: string, statusId: string) {
      if (!options.current.disabled && !current.current)
        update({ id, over: statusId, x: 0, y: 0, width: 0, keyboard: true });
    },
    canOpen() {
      return !current.current && Date.now() >= suppressClickUntil.current;
    },
  };
}
