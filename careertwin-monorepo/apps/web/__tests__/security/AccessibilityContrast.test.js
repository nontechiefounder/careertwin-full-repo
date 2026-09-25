import { describe, it, expect } from 'vitest';

// WCAG Relative Luminance Calculation
function getLuminance(hex) {
  const color = hex.replace('#', '');
  const r = parseInt(color.substring(0, 2), 16) / 255;
  const g = parseInt(color.substring(2, 4), 16) / 255;
  const b = parseInt(color.substring(4, 6), 16) / 255;

  const a = [r, g, b].map((v) => {
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });

  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function getContrastRatio(hex1, hex2) {
  const lum1 = getLuminance(hex1);
  const lum2 = getLuminance(hex2);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

describe('Visual Accessibility Contrast Ratios (WCAG AA Compliance)', () => {
  const backgroundSurfaces = {
    pageBg: '#0E0E0E',
    panelBg: '#111111',
    cardBg: '#1A1A1A',
  };

  const textTokens = {
    primaryText: '#F2F2F2',
    accentGreen: '#10D97A',
    mutedText: '#A3A3A3',
    amberText: '#FBBF24',
    blueText: '#60A5FA',
  };

  // WCAG AA Minimum Contrast Ratio for Normal Text is 4.5:1
  Object.entries(backgroundSurfaces).forEach(([bgName, bgHex]) => {
    it(`verifies primary text (${textTokens.primaryText}) meets WCAG AA 4.5:1 on ${bgName} (${bgHex})`, () => {
      const ratio = getContrastRatio(textTokens.primaryText, bgHex);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it(`verifies muted text (${textTokens.mutedText}) meets WCAG AA 4.5:1 on ${bgName} (${bgHex})`, () => {
      const ratio = getContrastRatio(textTokens.mutedText, bgHex);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it(`verifies accent green text (${textTokens.accentGreen}) meets WCAG AA 4.5:1 on ${bgName} (${bgHex})`, () => {
      const ratio = getContrastRatio(textTokens.accentGreen, bgHex);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  });
});
