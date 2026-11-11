import { create } from 'zustand';
import { initialState, reduce } from '../machine/machine';
import type { FlowContext, FlowEffect, FlowEvent, FlowState } from '../machine/machine';

export type FlowStore = {
  state: FlowState;
  // Effects from the last dispatch only; a runner executes them.
  effects: FlowEffect[];
  dispatch: (event: FlowEvent) => void;
};

export const createFlowStore = (ctx: FlowContext, state: FlowState = initialState(ctx)) =>
  create<FlowStore>()((set) => ({
    state,
    effects: [],
    dispatch: (event) => set((current) => reduce(current.state, event)),
  }));
