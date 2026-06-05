export type ShowMode = 'rehearsal' | 'show';

export interface Show {
  id: string;
  title: string;
  mode: ShowMode;
  createdAt: number;
  updatedAt: number;
  departments: string[];
}
