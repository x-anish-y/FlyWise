"use client";

import { useEffect } from "react";
import { useMotionValue, useTransform, animate, motion } from "framer-motion";

interface MetricCounterProps {
  value: number;
  decimals?: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

export default function MetricCounter({
  value,
  decimals = 2,
  duration = 1.2,
  prefix = "",
  suffix = "",
  className = "",
}: MetricCounterProps) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (latest) =>
    `${prefix}${latest.toFixed(decimals)}${suffix}`
  );

  useEffect(() => {
    const controls = animate(count, value, {
      duration,
      ease: [0.16, 1, 0.3, 1], // snappy smooth exponential curve
    });
    return controls.stop;
  }, [value, count, duration]);

  return <motion.span className={className}>{rounded}</motion.span>;
}
