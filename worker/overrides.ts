/**
 * Merge semantics for the manual-edit layer.
 *
 * A PATCH carries only the fields the user actually touched. Writing the whole
 * override row instead would do two silent kinds of damage:
 *
 *  - a title-only save would pin the CATEGORY as a manual override too, so the
 *    pipeline could never reclassify that row again;
 *  - it would re-snapshot `base_*` for a field nobody looked at, quietly
 *    dismissing a pending drift the user never reviewed.
 *
 * So each field is merged independently, and `base_*` is only re-taken for the
 * field being saved. Sending an explicit `null` clears that one field.
 */

export interface FieldSpec {
  /** Column on the override table. */
  readonly column: string;
  /** Column holding the snapshot of the pipeline value at edit time. */
  readonly baseColumn: string;
  /** Column on the base table this mirrors. */
  readonly sourceColumn: string;
}

export type OverrideRow = Record<string, unknown>;

/**
 * Builds the row to upsert.
 *
 * @param patch      only the keys present are touched
 * @param existing   current override row, or undefined on first edit
 * @param base       the pipeline's current values
 */
export function mergeOverride(
  key: Record<string, string>,
  fields: Record<string, FieldSpec>,
  patch: Record<string, unknown>,
  existing: OverrideRow | undefined,
  base: OverrideRow,
  editor: string,
  now: string,
): OverrideRow {
  const row: OverrideRow = { ...key };

  for (const [name, spec] of Object.entries(fields)) {
    if (Object.prototype.hasOwnProperty.call(patch, name)) {
      // Touched: take the new value and re-snapshot this field's base, which is
      // also what marks any pending drift on it as reviewed.
      row[spec.column] = patch[name] ?? null;
      row[spec.baseColumn] = base[spec.sourceColumn] ?? null;
    } else {
      // Untouched: carry the stored values through unchanged.
      row[spec.column] = existing?.[spec.column] ?? null;
      row[spec.baseColumn] = existing?.[spec.baseColumn] ?? null;
    }
  }

  row['edited_by'] = editor;
  row['edited_at'] = now;
  return row;
}

/** True when no field carries a value any more, so the row should be deleted. */
export function isEmptyOverride(row: OverrideRow, fields: Record<string, FieldSpec>): boolean {
  return Object.values(fields).every((spec) => row[spec.column] === null);
}
