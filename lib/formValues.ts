// Echo only this action's known string fields, never files or arbitrary submitted keys.
export function formValues(formData: FormData, fields: readonly string[]): Record<string, string> {
  return Object.fromEntries(fields.flatMap((field) => {
    const value = formData.get(field);
    return typeof value === "string" ? [[field, value]] : [];
  }));
}
