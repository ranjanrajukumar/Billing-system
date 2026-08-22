import { useEffect, useRef, useState } from 'react';

/**
 * Keeps a text box responsive while the value it drives updates on a delay.
 *
 * Typing "cauliflower" into a search box re-filters eleven times if every
 * keystroke is applied, and on a few thousand rows that is felt as lag in the
 * input itself — the character appears after the filter has run. Holding the
 * typed text locally and pushing it outward on a pause keeps the box instant
 * and the work to once per word.
 *
 * The value is also accepted from outside, so a "clear filters" button
 * elsewhere still empties the box.
 */
export function useDebouncedInput(value, onChange, delay = 300) {
  const [text, setText] = useState(value ?? '');
  const timer = useRef(null);
  const latest = useRef(onChange);
  latest.current = onChange;

  // An outside change (clear filters, a reset) wins over what is being typed.
  useEffect(() => {
    setText((current) => (current === (value ?? '') ? current : (value ?? '')));
  }, [value]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const update = (next) => {
    setText(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => latest.current?.(next), delay);
  };

  return [text, update];
}

export default useDebouncedInput;
