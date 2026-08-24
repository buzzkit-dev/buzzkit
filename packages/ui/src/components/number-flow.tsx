'use client';

import NumberFlowPrimitive, { NumberFlowGroup } from '@number-flow/react';
import type * as React from 'react';

const TIMING = { duration: 400, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' } as const;

function NumberFlow({
  transformTiming = TIMING,
  spinTiming = TIMING,
  opacityTiming = TIMING,
  ...props
}: React.ComponentProps<typeof NumberFlowPrimitive>) {
  return (
    <NumberFlowPrimitive
      transformTiming={transformTiming}
      spinTiming={spinTiming}
      opacityTiming={opacityTiming}
      {...props}
    />
  );
}

export { NumberFlow, NumberFlowGroup };
