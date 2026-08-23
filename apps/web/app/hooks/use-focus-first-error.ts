export type FormErrors = { form?: string; fields?: Record<string, string> };

import { useEffect } from 'react';

export function useFocusFirstError(errors: FormErrors | undefined) {
  useEffect(() => {
    if (!errors?.fields) return;
    document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errors]);
}
