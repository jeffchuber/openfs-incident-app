export type { Entry, SearchResult } from "@open-fs/core";

export interface TreeNode {
  name: string;
  path: string;
  is_dir: boolean;
  size: number | null;
  modified: string | null;
  backend: string | null;
  children?: TreeNode[];
}

export interface ExecResult {
  stdout: string;
  stderr: string;
}
