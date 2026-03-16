import { ValueTransformer } from 'typeorm';

export const DecimalTransformer: ValueTransformer = {
  to: (value?: number | null): number | null => (typeof value === 'number' ? value : null),
  from: (value: string | null): number | null => (value === null ? null : Number(value))
};
