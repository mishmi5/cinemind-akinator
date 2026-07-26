'use client';

import { motion } from 'framer-motion';
import React, { ReactNode } from 'react';

interface MotionWrapperProps {
  children: ReactNode;
  delay?: number;
  className?: string;
  // React 19 removed the global JSX namespace — it now lives under React.JSX.
  as?: keyof React.JSX.IntrinsicElements;
}

export function MotionWrapper({ children, delay = 0, className = '', as = 'div' }: MotionWrapperProps) {
  const Component = motion[as as keyof typeof motion] as any;

  return (
    <Component
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.6, delay, ease: [0.21, 0.47, 0.32, 0.98] }}
      className={className}
    >
      {children}
    </Component>
  );
}
