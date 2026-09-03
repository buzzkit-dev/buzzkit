import { Card } from '@buzzkit/ui/components/card';
import { Skeleton } from '@buzzkit/ui/components/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@buzzkit/ui/components/table';

export interface TableColumn {
  key?: string;
  label: string;
  className?: string;
  fill?: string;
  hidden?: boolean;
  content?: React.ReactNode;
}

const PLACEHOLDER_ROWS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

export function TableColumns({ columns }: { columns: TableColumn[] }) {
  return (
    <TableHeader>
      <TableRow>
        {columns.map((column) => (
          <TableHead key={column.key ?? column.label} className={column.className}>
            {column.hidden ? <span className='sr-only'>{column.label}</span> : column.label}
          </TableHead>
        ))}
      </TableRow>
    </TableHeader>
  );
}

export function TableSkeleton({
  columns,
  rows = 6,
  className = 'min-h-0 shrink',
  fixed = true,
}: {
  columns: TableColumn[];
  rows?: number;
  className?: string;
  fixed?: boolean;
}) {
  return (
    <Card className={className}>
      <Table className={fixed ? 'table-fixed' : undefined}>
        <TableColumns columns={columns} />
        <TableBody>
          {PLACEHOLDER_ROWS.slice(0, rows).map((row) => (
            <TableRow key={row}>
              {columns.map((column) => (
                <TableCell key={column.key ?? column.label} className={column.className}>
                  {column.content ?? <Skeleton className={column.fill ?? 'h-4 w-24'} />}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
