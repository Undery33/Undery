"use client";

import { useEffect, useState } from "react";

/** A discrete, inspectable sequence. No packets leave the browser. */
export function useNetworkPlayback(stepCount: number) {
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [motionPaused, setMotionPaused] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      if (stepIndex >= stepCount - 1) {
        setPlaying(false);
      } else {
        setStepIndex((current) => current + 1);
      }
    }, 2400);
    return () => window.clearTimeout(timer);
  }, [playing, stepCount, stepIndex]);

  function reset() {
    setPlaying(false);
    setMotionPaused(false);
    setStepIndex(0);
  }

  function goTo(index: number) {
    setPlaying(false);
    setMotionPaused(false);
    setStepIndex(Math.max(0, Math.min(stepCount - 1, index)));
  }

  function togglePlay() {
    if (playing) {
      setPlaying(false);
      setMotionPaused(true);
      return;
    }
    setMotionPaused(false);
    if (stepIndex === stepCount - 1) setStepIndex(0);
    setPlaying(true);
  }

  return { stepIndex, playing, motionPaused, reset, goTo, togglePlay };
}
