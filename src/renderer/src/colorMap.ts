export const colorMap: Record<string, [number, number, number]> = {
  sy: [255, 220, 100],
  y: [255, 255, 0],
  bla: [0, 0, 0],
  blu: [0, 0, 255],
  w: [255, 255, 255],
  g: [0, 255, 0],
  pu: [128, 0, 128],
  pi: [255, 105, 180],
  bg: [50, 180, 50],
  wbr: [139, 90, 43],
  dblu: [0, 0, 139],
  r: [255, 0, 0],
  bs: [70, 70, 200],
  lblu: [100, 149, 237],
  torq: [0, 206, 209]
}

export type ColorAbbreviation = keyof typeof colorMap
