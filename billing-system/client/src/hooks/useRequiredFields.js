import { useCallback, useState } from 'react';

/**
 * The fields a form will not save without.
 *
 * Required-ness was previously said three different ways across twenty screens
 * — a react-hook-form rule, a `*` typed into the label, or nothing at all — and
 * the three disagreed about which fields they covered. Worse, only seven of
 * four hundred inputs passed MUI's `required` prop, so almost none of them drew
 * the asterisk or set `aria-required`: the form knew, and never said.
 *
 * This says it once, for the controlled forms. The react-hook-form screens use
 * `requiredRule` below, which produces the same message from the same place.
 *
 * The guard matters more than it looks. Most of these modals save from an
 * `onClick`, not a form submit, so the browser's own `required` blocks nothing
 * at all — the asterisk would be decoration and the first anybody would hear of
 * a missing field is a 400 from the server, phrased for a developer.
 */

/**
 * Whether a value counts as absent.
 *
 * `0` is present. It is a real quantity on an adjustment, a real opening float
 * on a till, and a real rate on a free-of-charge line, and treating it as blank
 * would refuse to save exactly the entries somebody thought hardest about.
 * `positive: true` is how a field says zero is not good enough for it.
 */
function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

function misses(values, field) {
  const value = values?.[field.name];
  if (isBlank(value)) return true;
  return Boolean(field.positive) && !(Number(value) > 0);
}

/** The message a field gets when it is empty. One phrasing, everywhere. */
const missingMessage = (field) => (
  field.positive && !isBlank(field.value)
    ? `${field.label} must be greater than zero`
    : `${field.label} is required`
);

/**
 * The rule object for a react-hook-form `register` call.
 *
 * Kept here rather than inline at each call site so a required field reads the
 * same whichever kind of form it is on.
 */
export const requiredRule = (label) => ({ required: `${label} is required` });

/**
 * Required-field handling for a form held in `useState`.
 *
 * Errors appear only after somebody has tried to save. A modal that opens
 * already shouting about six empty fields reads as broken rather than as
 * helpful, and people learn to ignore red before they have typed anything.
 */
export default function useRequiredFields(spec = []) {
  const [attempted, setAttempted] = useState(false);

  const missingIn = useCallback(
    (values) => spec.filter((field) => misses(values, field)),
    [spec],
  );

  /** Props to spread onto the input for `name`. */
  const fieldProps = useCallback((name, values) => {
    const field = spec.find((f) => f.name === name);
    if (!field) return {};
    const missing = attempted && misses(values, field);
    return {
      required: true,
      error: missing,
      helperText: missing ? missingMessage({ ...field, value: values?.[name] }) : undefined,
    };
  }, [spec, attempted]);

  /**
   * Call from the save handler. Returns true when the form may go.
   *
   * Names the first missing field rather than saying "fill in the form": on a
   * modal long enough to scroll, "required fields are missing" is a hunt.
   */
  const check = useCallback((values, showToast) => {
    setAttempted(true);
    const missing = missingIn(values);
    if (!missing.length) return true;

    const [first] = missing;
    const rest = missing.length - 1;
    showToast?.(
      `${missingMessage({ ...first, value: values?.[first.name] })}${rest > 0 ? ` (and ${rest} more)` : ''}`,
      'error',
    );
    return false;
  }, [missingIn]);

  /** True while anything is still missing — for disabling a save button. */
  const incomplete = useCallback((values) => missingIn(values).length > 0, [missingIn]);

  return {
    fieldProps,
    check,
    incomplete,
    /** Clear the red when a form is closed and reopened for a new record. */
    reset: useCallback(() => setAttempted(false), []),
  };
}
