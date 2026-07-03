export type ClipType = "text" | "image";

export interface ClipItem {
  id: string;
  type: ClipType;
  text?: string;
  imageThumb?: string; // data URL for preview
  source?: string; // app the copy came from
  time: number; // epoch ms
}

export type Pane = "clipboard" | "phrases";
export type View = "stack" | "search" | "grid";
