import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@buzzkit/ui/components/card';
import type * as React from 'react';
import { BrandPage } from '@/app/components/layout/brand-page';

export function ErrorFrame({
  code,
  title,
  description,
  content,
  children,
}: {
  code?: string;
  title: string;
  description?: string;
  content?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <BrandPage>
      <Card>
        <CardHeader>
          <CardTitle>
            <h1>{title}</h1>
            {code ? <span className='ml-auto text-fg-1 text-xs tabular-nums'>{code}</span> : null}
          </CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
        {content}
        {children ? <CardFooter className='justify-start gap-2'>{children}</CardFooter> : null}
      </Card>
    </BrandPage>
  );
}
