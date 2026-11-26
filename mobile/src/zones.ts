/** Beacon instance id -> zone. 01 and 02 match ../zones.json; 03 and 04 are app-only demo zones. */
export type Zone = { name: string; symbol: string; instruction: string };

export const ZONES: Record<string, Zone> = {
  '000000000001': {
    name: 'Стълби',
    symbol: '↓',
    instruction: 'Стълби надолу, три метра пред вас. Перонът е вдясно.',
  },
  '000000000002': {
    name: 'Перон',
    symbol: '🚇',
    instruction: 'Перон, посока Младост. Влакът спира пред вас.',
  },
  '000000000003': {
    name: 'Ескалатор',
    symbol: '⇣',
    instruction: 'Ескалатор надолу, пред вас. Застанете вдясно и хванете парапета.',
  },
  '000000000004': {
    name: 'Изход',
    symbol: '↗',
    instruction: 'Изход към улицата, вляво от вас. Стълбите нагоре са след пет метра.',
  },
};
