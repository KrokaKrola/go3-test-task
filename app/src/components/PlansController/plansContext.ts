'use client';

import { createContext, useContext } from 'react';

export type PlansContextValue = {
  trialHidden: boolean;
  select: (planId: string) => void;
};

// Default lets server-rendered cards work with no controller (static HTML, tests).
export const PlansContext = createContext<PlansContextValue>({
  trialHidden: false,
  select: () => {},
});

export const usePlans = () => useContext(PlansContext);
