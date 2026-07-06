export type LogImage = {
  id: string;
  name: string;
  type: string;
  blob: Blob;
  createdAt: string;
};

export type LogEntry = {
  id: string;
  date: string;
  createdAt: string;
  text: string;
  images: LogImage[];
};

