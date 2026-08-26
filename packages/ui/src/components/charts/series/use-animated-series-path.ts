'use client';

import { animate, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LINE_LOADING_PULSE_EASE } from '../loading/line-loading-timing';
import {
  computeSeriesPathPoints,
  interpolateSeriesPathPoints,
  type SeriesPathPoint,
  seriesPathFromPoints,
  seriesPathTransitionSignature,
} from './series-path-utils';

// biome-ignore lint/suspicious/noExplicitAny: d3 curve factory type
type CurveFactory = any;

export interface UseAnimatedSeriesPathOptions {
  renderData: Record<string, unknown>[];
  xAccessor: (datum: Record<string, unknown>) => Date;
  xScale: (value: Date) => number | undefined;
  yScale: (value: number) => number | undefined;
  dataKey: string;
  curve: CurveFactory;
  chartPhase: string;
  durationMs: number;
  innerWidth: number;
  enabled: boolean;
}

/**
 * Tweens a series between data sets in pixel space: when the data changes
 * the displayed points glide from where they were to where the new data
 * lands (the old shape resampled at the new x positions, so only heights move).
 * The target is re-read every frame, so a y-domain that snaps or tweens
 * underneath the animation is followed instead of restarting it, and the
 * old points stay on screen until the tween has started, so a data set
 * that outgrows the previous domain never paints outside the plot.
 */
export function useAnimatedSeriesPath({
  renderData,
  xAccessor,
  xScale,
  yScale,
  dataKey,
  curve,
  chartPhase,
  durationMs,
  innerWidth,
  enabled,
}: UseAnimatedSeriesPathOptions) {
  const reducedMotion = useReducedMotion();
  const [animatedPoints, setAnimatedPoints] = useState<SeriesPathPoint[] | null>(null);
  const displayedPointsRef = useRef<SeriesPathPoint[] | null>(null);
  const latestRef = useRef({ renderData, xAccessor, xScale, yScale, dataKey });
  latestRef.current = { renderData, xAccessor, xScale, yScale, dataKey };

  const xScaleDomain = useMemo(() => {
    const scaleWithDomain = xScale as { domain?: () => [Date, Date] };
    return scaleWithDomain.domain?.() ?? [new Date(0), new Date(0)];
  }, [xScale]);

  const transitionSignature = useMemo(
    () =>
      seriesPathTransitionSignature({
        renderData,
        xAccessor,
        dataKey,
        innerWidth,
        xDomainMin: xScaleDomain[0]?.getTime?.() ?? 0,
        xDomainMax: xScaleDomain[1]?.getTime?.() ?? 0,
      }),
    [renderData, xAccessor, dataKey, innerWidth, xScaleDomain]
  );

  const targetPoints = useMemo(
    () => computeSeriesPathPoints(renderData, xAccessor, xScale, yScale, dataKey),
    [renderData, xAccessor, xScale, yScale, dataKey]
  );

  const shouldAnimate =
    enabled && !reducedMotion && chartPhase === 'ready' && durationMs > 0 && renderData.length > 0;
  const prevTransitionSignatureRef = useRef(transitionSignature);

  useEffect(() => {
    if (!shouldAnimate || prevTransitionSignatureRef.current === transitionSignature) {
      prevTransitionSignatureRef.current = transitionSignature;
      return;
    }
    prevTransitionSignatureRef.current = transitionSignature;

    const fromSnapshot = displayedPointsRef.current;
    if (!fromSnapshot || fromSnapshot.length === 0) {
      return;
    }

    const control = animate(0, 1, {
      duration: durationMs / 1000,
      ease: [...LINE_LOADING_PULSE_EASE],
      onUpdate: (progress) => {
        const latest = latestRef.current;
        const target = computeSeriesPathPoints(
          latest.renderData,
          latest.xAccessor,
          latest.xScale,
          latest.yScale,
          latest.dataKey
        );
        const next = interpolateSeriesPathPoints(fromSnapshot, target, progress);
        displayedPointsRef.current = next;
        setAnimatedPoints(next);
      },
      onComplete: () => {
        setAnimatedPoints(null);
      },
    });

    return () => {
      control.stop();
      setAnimatedPoints(null);
    };
  }, [transitionSignature, shouldAnimate, durationMs]);

  useEffect(() => {
    if (animatedPoints == null && prevTransitionSignatureRef.current === transitionSignature) {
      displayedPointsRef.current = targetPoints;
    }
  }, [targetPoints, animatedPoints, transitionSignature]);

  const pending = shouldAnimate && prevTransitionSignatureRef.current !== transitionSignature;
  const activePoints = animatedPoints ?? ((pending && displayedPointsRef.current) || targetPoints);
  const pathD = useMemo(() => seriesPathFromPoints(activePoints, curve), [activePoints, curve]);

  return {
    points: activePoints,
    pathD,
    isPathAnimating: animatedPoints != null,
  };
}
