import type { CreateBranchData } from '@generaltranslation/api';
import type { CreateBranchResponse } from '@generaltranslation/api/legacy';

export type LegacyCreateBranchQuery = {
  /** @deprecated Use `name` instead. */
  branchName: string;
  /** @deprecated Use `isDefault` instead. */
  defaultBranch?: boolean;
};

export type CreateBranchQuery =
  | CreateBranchData['body']
  | LegacyCreateBranchQuery;

/** The result for the deprecated `{ branchName }` input; `{ name }` returns `CreateBranchResponse`. */
export type CreateBranchResult = CreateBranchResponse;
