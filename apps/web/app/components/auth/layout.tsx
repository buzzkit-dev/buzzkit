import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@buzzkit/ui/components/card';

export function AuthLayout({
  title,
  description,
  footer,
  children,
}: {
  title: string;
  description: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className='flex min-h-svh items-center justify-center p-6'>
      <Card className='max-w-md'>
        <CardHeader>
          <CardTitle>
            <h1>{title}</h1>
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className='pt-1'>{children}</CardContent>
        {footer && <CardFooter className='justify-start gap-1 text-fg-2 text-sm'>{footer}</CardFooter>}
      </Card>
    </main>
  );
}
