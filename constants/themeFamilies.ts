import type { AppTheme } from '../types';
import { THEMES } from './theme';
export type ThemeFamilyId = 'essential' | 'forge' | 'aurora' | 'prism' | 'forest' | 'summit' | 'orbit' | 'podium';
export type ThemeFamily = {
    id: ThemeFamilyId;
    name: string;
    description: string;
    representative: string;
    variants: readonly string[];
    radius: number;
    border: number;
    texture: ThemeFamilyId;
};
/** Discovery metadata only: legacy IDs, prices, ownership and rendering lookup stay intact. */
export const THEME_FAMILIES: readonly ThemeFamily[] = [
    {
        id: 'essential', name: 'Esencial', description: 'Superficies limpias, líneas precisas y espacio para concentrarte.', representative: 'white', radius: 12, border: 1, texture: 'essential', variants: ['white', 'black', 'arena', 'cafe', 'pizarra']
    },
    {
        id: 'forge', name: 'Forja', description: 'Acero biselado, cortes diagonales y luz de calor.', representative: 'cobre', radius: 6, border: 2, texture: 'forge', variants: ['red', 'cobre', 'volcan', 'nucleo', 'fenix', 'frame-heavy-duty', 'frame-hierro-fe-disciplina', 'frame-yo-soy-el-huno', 'frame-fuerza-rinoceronte', 'frame-fuerza-gorila', 'frame-this-is-sparta', 'frame-fuerza-tigre', 'profile-rodaja']
    },
    {
        id: 'aurora', name: 'Aurora', description: 'Cristal suave y ondas de luz sobre formas envolventes.', representative: 'aurora-boreal', radius: 32, border: 1, texture: 'aurora', variants: ['lila-suave', 'lavanda', 'sakura', 'cielo', 'aurora', 'aurora-boreal', 'frame-holy-fit', 'frame-banzai', 'profile-brisas']
    },
    {
        id: 'prism', name: 'Prisma', description: 'Facetas geométricas, retícula y reflejos de neón.', representative: 'prisma', radius: 16, border: 2, texture: 'prism', variants: ['lila-neon', 'violeta', 'cyberpunk', 'prisma', 'caramelo-acido', 'holograma', 'frame-neon-gym', 'frame-ruby-fit']
    },
    {
        id: 'forest', name: 'Bosque', description: 'Curvas orgánicas, vetas y profundidad natural.', representative: 'bosque', radius: 26, border: 1, texture: 'forest', variants: ['green', 'leaf', 'menta', 'bosque', 'jade-imperial', 'frame-celtic-spirit', 'frame-fuerza-cocodrilo', 'frame-medjay-core']
    },
    {
        id: 'summit', name: 'Cumbre', description: 'Aristas minerales y relieve topográfico de gran contraste.', representative: 'snowflake', radius: 4, border: 1, texture: 'summit', variants: ['blue', 'oceano', 'snowflake', 'tormenta', 'frame-valhalla-training', 'frame-fuerza-elefante', 'seleccion-argentina']
    },
    {
        id: 'orbit', name: 'Órbita', description: 'Anillos orbitales y silencio espacial en superficies redondas.', representative: 'eclipse', radius: 40, border: 1, texture: 'orbit', variants: ['moon', 'star', 'medusa', 'eclipse', 'frame-fuerza-pantera']
    },
    {
        id: 'podium', name: 'Podio', description: 'Marcos dobles, franjas de competición y luz de estadio.', representative: 'frame-campeon-indiscutible', radius: 20, border: 3, texture: 'podium', variants: ['yellow', 'sun', 'coral', 'boca', 'river', 'atardecer', 'frame-campeon-indiscutible', 'frame-alfa', 'frame-spqr', 'frame-elegante-sport']
    },
];
export const familyForThemeId = (id: string | null | undefined) => THEME_FAMILIES.find((family) => family.variants.includes(id ?? ''));
export function familyForTheme(theme: AppTheme): ThemeFamily {
    return familyForThemeId((theme as AppTheme & {
        id?: string;
    }).id)
        ?? THEME_FAMILIES[theme === THEMES.brisas ? 2 : theme === THEMES.rodaja ? 1 : 0];
}
