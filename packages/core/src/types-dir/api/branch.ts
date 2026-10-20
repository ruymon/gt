import type {
  Branch,
  GetBranchInfoResponse,
} from '@generaltranslation/api/legacy';

// Compatibility response: the published type preserves a nullable default
// branch while the generated intersection currently loses that nullability.
export type BranchDataResult = Pick<GetBranchInfoResponse, 'branches'> & {
  defaultBranch: Branch | null;
};
