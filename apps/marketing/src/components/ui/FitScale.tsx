export function FitScale({
  width,
  allowance = 0,
  className,
  children,
}: {
  width: number;
  allowance?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className} style={{ containerType: 'inline-size' }}>
      <div
        style={{
          width,
          transform: `scale(min(1, tan(atan2(100cqw + ${allowance}px, ${width}px))))`,
          transformOrigin: 'top left',
        }}
      >
        {children}
      </div>
    </div>
  );
}
