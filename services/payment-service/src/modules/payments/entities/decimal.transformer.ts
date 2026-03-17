import { ValueTransformer } from 'typeorm';

export const DecimalTransformer: ValueTransformer = {
  to: (value: number): string => value.toFixed(2),
  from: (value: string): number => Number.parseFloat(value)
};
