import type { HousingRouting } from '@/types';

export const EMERGENCY_TERMS =
  /lockout|broken lock|flood|fire|power outage|no water|overflow|gas|chemical smell|unlivable/i;

export const DEFAULT_ROUTING: HousingRouting = {
  category: 'Other',
  urgency: 'Routine',
  destination: 'Residence Life / Facilities',
  reason: 'BU staff can confirm the best route.',
};

const RULES: { pattern: RegExp; routing: HousingRouting }[] = [
  {
    pattern: /leak|drain|toilet|sink/,
    routing: { category: 'Plumbing', urgency: 'Routine', destination: 'Residence Life / Facilities', reason: 'Water or plumbing terms were detected.' },
  },
  {
    pattern: /heat|cold|radiator|hvac/,
    routing: { category: 'Heating & Cooling', urgency: 'Routine', destination: 'Residence Life / Facilities', reason: 'Heating or cooling terms were detected.' },
  },
  {
    pattern: /outlet|power|light/,
    routing: { category: 'Electrical', urgency: 'Routine', destination: 'Residence Life / Facilities', reason: 'Electrical terms were detected.' },
  },
  {
    pattern: /desk|chair|bed|refrigerator|appliance|key/,
    routing: { category: 'Furniture / Appliance / Key', urgency: 'Routine', destination: 'My Housing', reason: 'Furniture, appliance, or key terms were detected.' },
  },
  {
    pattern: /bug|mouse|pest/,
    routing: { category: 'Pest', urgency: 'Routine', destination: 'Residence Life / Facilities', reason: 'Pest-related terms were detected.' },
  },
  {
    pattern: /hallway|common bathroom|spill|trash/,
    routing: { category: 'Cleaning / Common Area', urgency: 'Routine', destination: 'Residence Life / Facilities', reason: 'A shared-space issue was detected.' },
  },
  {
    pattern: /roommate|noise|conflict/,
    routing: { category: 'Roommate / Community', urgency: 'Routine', destination: 'RA / Residence Life', reason: 'A roommate or community concern was detected.' },
  },
];

/** Suggests a route for a free-text housing issue. Students always confirm the result. */
export function classifyHousing(text: string): HousingRouting {
  const value = text.toLowerCase();
  if (EMERGENCY_TERMS.test(value)) {
    return {
      category: 'Safety / Security',
      urgency: 'Emergency',
      destination: 'Call-first emergency guidance',
      reason: 'The description may need immediate help.',
    };
  }
  return RULES.find((rule) => rule.pattern.test(value))?.routing ?? DEFAULT_ROUTING;
}
