// Primary color detection from colorway text
// Matches first color found in the text against filter colors

export const FILTER_COLORS = [
  'Black',
  'White',
  'Red',
  'Blue',
  'Green',
  'Gray',
  'Brown',
  'Yellow',
  'Orange',
  'Pink',
  'Purple'
] as const;

export type FilterColor = typeof FILTER_COLORS[number] | 'Other';

/**
 * Detects the primary color from a colorway text string.
 * Searches for the first match with any basic filter color (case-insensitive).
 * If no match is found, returns 'Other'.
 * 
 * @param colorway - The colorway text to analyze (e.g., "Black/White/Red", "Navy Blue Suede")
 * @returns The detected primary color or 'Other'
 */
export function detectPrimaryColor(colorway: string | null | undefined): FilterColor {
  if (!colorway || typeof colorway !== 'string') {
    return 'Other';
  }

  const lowerColorway = colorway.toLowerCase();

  // Check each filter color in order (first match wins)
  for (const color of FILTER_COLORS) {
    if (lowerColorway.includes(color.toLowerCase())) {
      return color;
    }
  }

  // Also check for common color aliases
  const colorAliases: Record<string, FilterColor> = {
    'grey': 'Gray',
    'navy': 'Blue',
    'maroon': 'Red',
    'burgundy': 'Red',
    'crimson': 'Red',
    'scarlet': 'Red',
    'coral': 'Orange',
    'peach': 'Orange',
    'tan': 'Brown',
    'beige': 'Brown',
    'khaki': 'Brown',
    'chocolate': 'Brown',
    'ivory': 'White',
    'cream': 'White',
    'silver': 'Gray',
    'charcoal': 'Gray',
    'violet': 'Purple',
    'lavender': 'Purple',
    'magenta': 'Pink',
    'rose': 'Pink',
    'gold': 'Yellow',
    'mustard': 'Yellow',
    'olive': 'Green',
    'teal': 'Green',
    'mint': 'Green',
    'lime': 'Green',
    'cyan': 'Blue',
    'turquoise': 'Blue',
    'aqua': 'Blue',
    'azure': 'Blue',
    'cobalt': 'Blue',
    'indigo': 'Blue',
    'noir': 'Black',
    'ebony': 'Black',
    'jet': 'Black',
    'onyx': 'Black',
  };

  for (const [alias, mappedColor] of Object.entries(colorAliases)) {
    if (lowerColorway.includes(alias)) {
      return mappedColor;
    }
  }

  return 'Other';
}
