export const DEFAULT_THEME_COLOR = 'linear-gradient(135deg, #0f172a 0%, #38bdf8 100%)';

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
