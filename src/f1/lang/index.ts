// The languages the game has besides English (src/engine/i18n.ts): one file each, a dictionary from the English text.
import type { Language } from '../../engine/i18n';
import { es } from './es';
import { fr } from './fr';
import { de } from './de';
import { pt } from './pt';
import { it } from './it';
import { tr } from './tr';
import { ja } from './ja';

export const LANGUAGES: Language[] = [es, fr, de, pt, it, tr, ja];
