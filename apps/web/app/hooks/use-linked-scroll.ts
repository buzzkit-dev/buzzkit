import { type RefObject, useEffect } from 'react';

export function useLinkedScroll(...refs: RefObject<HTMLElement | null>[]) {
  useEffect(() => {
    const columns = refs.map((ref) => ref.current).filter((el) => el !== null);
    const forward = (event: WheelEvent) => {
      if (event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) return;
      const source = columns.find((column) => column.contains(event.target as Node));
      for (const column of columns) {
        if (column !== source) column.scrollTop += event.deltaY;
      }
    };
    for (const column of columns) column.addEventListener('wheel', forward, { passive: true });
    return () => {
      for (const column of columns) column.removeEventListener('wheel', forward);
    };
  }, refs);
}
