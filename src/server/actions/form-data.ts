/** A form's text fields by name, as strings; a missing field (or a file) is ''. */
export function formFields<K extends string>(formData: FormData, names: readonly K[]): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const name of names) {
    const value = formData.get(name);
    out[name] = typeof value === 'string' ? value : '';
  }
  return out;
}
