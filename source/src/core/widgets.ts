// The widget contract. Built-in widgets and, later, your own widgets all register through
// defineWidget(), so the page never needs to know about a specific widget.
import type { ComponentType, ReactNode } from 'react';

export interface WidgetProps<C> {
  /** Stable instance id (several copies of one widget type can live on the page). */
  id: string;
  config: C;
  setConfig: (patch: Partial<C>) => void;
  /** True while the page is in layout-edit mode. */
  editing: boolean;
}

export interface WidgetDef<C = Record<string, unknown>> {
  type: string;
  name: string;
  description: string;
  icon: ReactNode;
  /** Size in grid units (24 columns, 32px rows). */
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  defaultConfig: C;
  /** false = draw straight on the background with no glass card (e.g. a big clock). */
  card?: boolean;
  /** Allow several instances on one page. */
  multiple?: boolean;
  Component: ComponentType<WidgetProps<C>>;
}

const registry = new Map<string, WidgetDef<any>>();

export function defineWidget<C>(def: WidgetDef<C>): WidgetDef<C> {
  registry.set(def.type, def as WidgetDef<any>);
  return def;
}

export const getWidget = (type: string) => registry.get(type);
export const allWidgets = () => [...registry.values()];
