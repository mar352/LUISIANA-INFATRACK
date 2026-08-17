/**
 * Municipality of Luisiana (Laguna) map extent — shared by Cesium clip, grids, etc.
 */

export const LUISIANA_BOUNDS = {
  west: 121.44,
  south: 14.12,
  east: 121.58,
  north: 14.27,
} as const;

export type LuisianaBounds = typeof LUISIANA_BOUNDS;

/** Degrees of padding so the municipal edge is not cut harshly. */
export const LUISIANA_BOUNDS_PAD_DEG = 0.03;

/** Padded rectangle for globe clip / camera clamp. */
export function luisianaPaddedBounds(padDeg = LUISIANA_BOUNDS_PAD_DEG) {
  return {
    west: LUISIANA_BOUNDS.west - padDeg,
    south: LUISIANA_BOUNDS.south - padDeg,
    east: LUISIANA_BOUNDS.east + padDeg,
    north: LUISIANA_BOUNDS.north + padDeg,
  };
}
