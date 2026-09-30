export const DEFAULT_THEME_COLOR = 'linear-gradient(135deg, #0f172a 0%, #38bdf8 100%)';

// The accent (second colour) becomes the app's primary colour and carries white button text,
// so every added theme keeps at least 4.5:1 contrast for white on the accent and 7:1 on the header start colour.
export const BEST_THEMES = [
  {
    name: 'Blura Deep Space & Electric (Default)',
    tag: 'BEST DEFAULT',
    value: 'linear-gradient(135deg, #0f172a 0%, #38bdf8 100%)',
    description: 'Deep Space Navy with Electric Sky Blue Accent',
    bg: 'linear-gradient(135deg, #0f172a 0%, #38bdf8 100%)',
    isGradient: true
  },
  {
    name: 'Blura Cyber Electric Cyan',
    tag: 'BEST ELECTRIC',
    value: 'linear-gradient(135deg, #06b6d4 0%, #38bdf8 100%)',
    description: 'High-Tech Cyan to Electric Sky Blue',
    bg: 'linear-gradient(135deg, #06b6d4 0%, #38bdf8 100%)',
    isGradient: true
  },
  {
    name: 'Blura Royal Neon Violet',
    tag: 'BEST NEON',
    value: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
    description: 'Royal Navy Blue to Deep Neon Violet',
    bg: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
    isGradient: true
  },
  {
    name: 'Blura Emerald Electric Glow',
    tag: 'BEST EMERALD',
    value: 'linear-gradient(135deg, #0f766e 0%, #06b6d4 100%)',
    description: 'Deep Tech Emerald to Cyber Cyan',
    bg: 'linear-gradient(135deg, #0f766e 0%, #06b6d4 100%)',
    isGradient: true
  },
  {
    name: 'Official Navy & Royal Blue',
    tag: 'BEST OFFICIAL',
    value: 'linear-gradient(135deg, #0b1f3a 0%, #1d4ed8 100%)',
    description: 'Classic navy to royal blue. Formal and calm',
    bg: 'linear-gradient(135deg, #0b1f3a 0%, #1d4ed8 100%)',
    isGradient: true
  },
  {
    name: 'Forest & Emerald',
    tag: 'BEST GREEN',
    value: 'linear-gradient(135deg, #052e16 0%, #15803d 100%)',
    description: 'Deep forest green to emerald. Steady and trusted',
    bg: 'linear-gradient(135deg, #052e16 0%, #15803d 100%)',
    isGradient: true
  },
  {
    name: 'Crimson Authority',
    tag: 'BEST BOLD',
    value: 'linear-gradient(135deg, #450a0a 0%, #b91c1c 100%)',
    description: 'Dark maroon to crimson. Strong and urgent',
    bg: 'linear-gradient(135deg, #450a0a 0%, #b91c1c 100%)',
    isGradient: true
  },
  {
    name: 'Deep Indigo',
    tag: 'BEST INDIGO',
    value: 'linear-gradient(135deg, #1e1b4b 0%, #4f46e5 100%)',
    description: 'Midnight indigo to vivid indigo. Modern and focused',
    bg: 'linear-gradient(135deg, #1e1b4b 0%, #4f46e5 100%)',
    isGradient: true
  },
  {
    name: 'Ocean Deep & Teal',
    tag: 'BEST OCEAN',
    value: 'linear-gradient(135deg, #083344 0%, #0e7490 100%)',
    description: 'Deep sea blue to teal. Clean and technical',
    bg: 'linear-gradient(135deg, #083344 0%, #0e7490 100%)',
    isGradient: true
  },
  {
    name: 'Graphite & Slate',
    tag: 'BEST NEUTRAL',
    value: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)',
    description: 'Near-black to slate grey. Quiet and professional',
    bg: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)',
    isGradient: true
  },
  {
    name: 'Ember Orange',
    tag: 'BEST WARM',
    value: 'linear-gradient(135deg, #431407 0%, #c2410c 100%)',
    description: 'Dark umber to burnt orange. Warm and energetic',
    bg: 'linear-gradient(135deg, #431407 0%, #c2410c 100%)',
    isGradient: true
  },
  {
    name: 'Gold & Bronze',
    tag: 'BEST GOLD',
    value: 'linear-gradient(135deg, #422006 0%, #a16207 100%)',
    description: 'Dark bronze to antique gold. Premium and traditional',
    bg: 'linear-gradient(135deg, #422006 0%, #a16207 100%)',
    isGradient: true
  },
];

export const THEME_PRESETS = [
  { name: 'Electric Sky Blue', hex: '#38bdf8', isBest: true },
  { name: 'Blura Cyber Cyan', hex: '#06b6d4' },
  { name: 'Royal Navy', hex: '#1e3a8a' },
  { name: 'Emerald Tech', hex: '#0f766e' },
  { name: 'Cosmic Purple', hex: '#7c3aed' },
  { name: 'Obsidian Night', hex: '#0f172a' },
  { name: 'Sunset Amber', hex: '#d97706' },
  { name: 'Crimson Red', hex: '#dc2626' },
];

export const GRADIENT_PRESETS = [
  { name: 'Deep Space & Electric', from: '#0f172a', to: '#38bdf8', value: 'linear-gradient(135deg, #0f172a 0%, #38bdf8 100%)', primaryHex: '#38bdf8' },
  { name: 'Cyber Cyan & Electric', from: '#06b6d4', to: '#38bdf8', value: 'linear-gradient(135deg, #06b6d4 0%, #38bdf8 100%)', primaryHex: '#38bdf8' },
  { name: 'Royal Navy & Neon Indigo', from: '#1e1b4b', to: '#6366f1', value: 'linear-gradient(135deg, #1e1b4b 0%, #6366f1 100%)', primaryHex: '#6366f1' },
  { name: 'Royal & Neon Violet', from: '#2563eb', to: '#7c3aed', value: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)', primaryHex: '#7c3aed' },
  { name: 'Emerald & Cyber Teal', from: '#0f766e', to: '#06b6d4', value: 'linear-gradient(135deg, #0f766e 0%, #06b6d4 100%)', primaryHex: '#06b6d4' },
  { name: 'Matrix Green & Cyber Glow', from: '#064e3b', to: '#10b981', value: 'linear-gradient(135deg, #064e3b 0%, #10b981 100%)', primaryHex: '#10b981' },
  { name: 'Obsidian Cobalt & Sky Spark', from: '#0284c7', to: '#38bdf8', value: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)', primaryHex: '#38bdf8' },
  { name: 'Midnight Blue & Ultramarine', from: '#0f172a', to: '#2563eb', value: 'linear-gradient(135deg, #0f172a 0%, #2563eb 100%)', primaryHex: '#2563eb' },
  { name: 'Police Blue & Steel', from: '#0f2a4a', to: '#2563eb', value: 'linear-gradient(135deg, #0f2a4a 0%, #2563eb 100%)', primaryHex: '#2563eb' },
  { name: 'Sky Steel', from: '#0c4a6e', to: '#0369a1', value: 'linear-gradient(135deg, #0c4a6e 0%, #0369a1 100%)', primaryHex: '#0369a1' },
  { name: 'Deep Teal', from: '#134e4a', to: '#0f766e', value: 'linear-gradient(135deg, #134e4a 0%, #0f766e 100%)', primaryHex: '#0f766e' },
  { name: 'Olive Ranger', from: '#1a2e05', to: '#4d7c0f', value: 'linear-gradient(135deg, #1a2e05 0%, #4d7c0f 100%)', primaryHex: '#4d7c0f' },
  { name: 'Royal Purple', from: '#2e1065', to: '#7c3aed', value: 'linear-gradient(135deg, #2e1065 0%, #7c3aed 100%)', primaryHex: '#7c3aed' },
  { name: 'Plum & Magenta', from: '#3b0764', to: '#a21caf', value: 'linear-gradient(135deg, #3b0764 0%, #a21caf 100%)', primaryHex: '#a21caf' },
  { name: 'Rose Garnet', from: '#4c0519', to: '#be123c', value: 'linear-gradient(135deg, #4c0519 0%, #be123c 100%)', primaryHex: '#be123c' },
  { name: 'Charcoal & Amber', from: '#1c1917', to: '#b45309', value: 'linear-gradient(135deg, #1c1917 0%, #b45309 100%)', primaryHex: '#b45309' },
  { name: 'Maroon & Gold', from: '#450a0a', to: '#b45309', value: 'linear-gradient(135deg, #450a0a 0%, #b45309 100%)', primaryHex: '#b45309' },
  { name: 'Midnight & Violet', from: '#0f0a2e', to: '#6d28d9', value: 'linear-gradient(135deg, #0f0a2e 0%, #6d28d9 100%)', primaryHex: '#6d28d9' },
  { name: 'Ink & Emerald', from: '#022c22', to: '#047857', value: 'linear-gradient(135deg, #022c22 0%, #047857 100%)', primaryHex: '#047857' },
];

export const hexToHSL = (hex) => {
  if (!hex || typeof hex !== 'string') return '';
  let cleanHex = hex.trim();
  if (cleanHex.startsWith('linear-gradient') || cleanHex.startsWith('radial-gradient')) return '';
  if (cleanHex.length === 4) {
    cleanHex = `#${cleanHex[1]}${cleanHex[1]}${cleanHex[2]}${cleanHex[2]}${cleanHex[3]}${cleanHex[3]}`;
  }
  if (cleanHex.length !== 7) return '';

  const r = parseInt(cleanHex.slice(1, 3), 16) / 255;
  const g = parseInt(cleanHex.slice(3, 5), 16) / 255;
  const b = parseInt(cleanHex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
      default: break;
    }
    h /= 6;
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
};

export const extractAccentHex = (colorValue) => {
  if (!colorValue || typeof colorValue !== 'string') return '#38bdf8';
  if (colorValue.startsWith('#')) return colorValue;
  const matches = colorValue.match(/#([0-9a-fA-F]{6})/g);
  if (matches && matches.length > 1) {
    return matches[matches.length - 1]; // Pick vibrant second color in gradient
  }
  if (matches && matches.length === 1) {
    return matches[0];
  }
  return '#38bdf8';
};

export const applyThemeColor = (colorValue) => {
  if (!colorValue) return;
  const isGradient = String(colorValue).startsWith('linear-gradient') || String(colorValue).startsWith('radial-gradient');

  if (isGradient) {
    document.documentElement.style.setProperty('--primary-gradient', colorValue);
    const accentHex = extractAccentHex(colorValue);
    const hslValue = hexToHSL(accentHex);
    if (hslValue) {
      document.documentElement.style.setProperty('--primary', hslValue);
      document.documentElement.style.setProperty('--ring', hslValue);
    }
  } else {
    document.documentElement.style.setProperty('--primary-gradient', colorValue);
    const hslValue = hexToHSL(colorValue);
    if (hslValue) {
      document.documentElement.style.setProperty('--primary', hslValue);
      document.documentElement.style.setProperty('--ring', hslValue);
    }
  }
};
