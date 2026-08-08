export type LogImage = {
  id: string;
  name: string;
  type: string;
  blob: Blob;
  createdAt: string;
};

export type LogTag = "打撃" | "守備" | "走塁" | "投球" | "体調" | "フィジカル";

export type AiAnalysisTag = "すべて" | LogTag | "その他";

export type LogEntry = {
  id: string;
  date: string;
  createdAt: string;
  text: string;
  images: LogImage[];
  tags: LogTag[];
};

export type AiAnalysis = {
  id: string;
  startDate: string;
  endDate: string;
  tag: AiAnalysisTag;
  text: string;
  createdAt: string;
};
