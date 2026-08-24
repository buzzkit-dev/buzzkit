import { Button } from '@buzzkit/ui/components/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@buzzkit/ui/components/field';
import { Input } from '@buzzkit/ui/components/input';
import { useState } from 'react';
import type { FormErrors } from '@/app/hooks/use-focus-first-error';
import { useFocusFirstError } from '@/app/hooks/use-focus-first-error';

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function WorkspaceFields({
  errors,
  pending,
  submitLabel = 'Create workspace',
}: {
  errors?: FormErrors;
  pending?: boolean;
  submitLabel?: string;
}) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);

  const nameError = errors?.fields?.name;
  const slugError = errors?.fields?.slug;
  const slugValue = slugTouched ? slug : slugify(name);

  useFocusFirstError(errors);

  return (
    <FieldGroup>
      <Field data-invalid={nameError ? true : undefined}>
        <FieldLabel htmlFor='name'>Name</FieldLabel>
        <Input
          id='name'
          name='name'
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder='Acme'
          required
          maxLength={100}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? 'name-error' : undefined}
        />
        {nameError && <FieldError id='name-error'>{nameError}</FieldError>}
      </Field>
      <Field data-invalid={slugError ? true : undefined}>
        <FieldLabel htmlFor='slug'>Slug</FieldLabel>
        <Input
          id='slug'
          name='slug'
          value={slugValue}
          onChange={(event) => {
            setSlugTouched(true);
            setSlug(event.target.value);
          }}
          placeholder='acme'
          required
          minLength={3}
          maxLength={48}
          pattern='^[a-z0-9]+(?:-[a-z0-9]+)*$'
          aria-invalid={slugError ? true : undefined}
          aria-describedby={slugError ? 'slug-error' : 'slug-description'}
        />
        {slugError ? (
          <FieldError id='slug-error'>{slugError}</FieldError>
        ) : (
          <FieldDescription id='slug-description'>
            Lowercase letters, numbers and hyphens. This becomes your workspace URL.
          </FieldDescription>
        )}
      </Field>
      {errors?.form && <FieldError>{errors.form}</FieldError>}
      <Button type='submit' className='w-full' loading={pending}>
        {submitLabel}
      </Button>
    </FieldGroup>
  );
}
