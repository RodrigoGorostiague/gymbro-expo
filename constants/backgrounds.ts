import { ShopThemeRarity } from '../types';

export type BackgroundRendererKind = 'layered-image';

export interface ShopBackground {
  id: string;
  name: string;
  description: string;
  price: number;
  rarity: ShopThemeRarity;
  renderer: BackgroundRendererKind;
  fallback: [string, string, string];
  layerCount: 4;
}

export const SHOP_BACKGROUNDS: readonly ShopBackground[] = [
  {
    id: 'banzai',
    name: 'Banzai',
    description: 'Capas japonesas en movimiento.',
    price: 1,
    rarity: 'exclusive',
    renderer: 'layered-image',
    fallback: ['#260712', '#7D1839', '#C64B68'],
    layerCount: 4,
  },
  {
    id: 'sakura',
    name: 'Sakura',
    description: 'Pétalos suaves sobre el amanecer.',
    price: 1,
    rarity: 'exclusive',
    renderer: 'layered-image',
    fallback: ['#FFF5FA', '#F6BDD3', '#B2386F'],
    layerCount: 4,
  },
];

export function getShopBackground(id: string | null | undefined): ShopBackground | undefined {
  return SHOP_BACKGROUNDS.find((background) => background.id === id);
}
