import { rgb, type RGB } from 'pdf-lib';

export const PAGE_W = 595.276;   // A4 portrait in pt
export const PAGE_H = 841.89;
export const MARGIN = 28.35;     // 1 cm

export const FONT_SIZE_BODY = 11;
export const FONT_SIZE_SMALL = 9;
export const FONT_SIZE_TINY = 7;
export const FONT_SIZE_COVER_TITLE = 36;
export const FONT_SIZE_COVER_VENUE = 14;
export const FONT_SIZE_COVER_DEPT = 24;

export const ROW_HEIGHT = 30;
export const ROW_SECONDARY_OFFSET = 12;

export const COLOR_BLACK: RGB = rgb(0, 0, 0);
export const COLOR_GREY: RGB = rgb(0.5, 0.5, 0.5);   // watched-only cues

// Column X positions — SM master
export const SM_COL_NUM = MARGIN;
export const SM_COL_LABEL = MARGIN + 40;
export const SM_COL_DEPT = SM_COL_LABEL + 200;
export const SM_COL_TRIGGER = SM_COL_DEPT + 80;
export const SM_COL_STANDBY = SM_COL_TRIGGER + 60;

// Column X positions — operator
export const OP_COL_NUM = MARGIN;
export const OP_COL_LABEL = MARGIN + 40;
export const OP_COL_PAYLOAD = OP_COL_LABEL + 140;
export const OP_COL_STANDBY = OP_COL_PAYLOAD + 220;

export const DEPT_CHIP_WIDTH = 6;
export const DEPT_CHIP_HEIGHT = 18;
export const DEPT_CHIP_COLORS: Record<string, RGB> = {
  LX: rgb(0.9, 0.8, 0.1),
  SX: rgb(0.2, 0.6, 0.9),
  VIDEO: rgb(0.5, 0.2, 0.8),
  AUTO: rgb(0.2, 0.7, 0.3),
  PYRO: rgb(0.9, 0.3, 0.1),
  FS: rgb(0.6, 0.4, 0.1),
  SM: rgb(0.3, 0.3, 0.3),
  OTHER: rgb(0.5, 0.5, 0.5),
};
