import { confirmYesNo } from './confirm-yes-no';

/**
 * In glob mode, ask whether to keep the workspace's default excludes or skip
 * them so the user-supplied glob is the sole filter. Cancel throws.
 */
export async function useDefaultExcludes(): Promise<boolean> {
  return confirmYesNo({
    placeHolder: 'Apply default workspace excludes (excludedFolders, excludePattern, files.exclude)?',
    abortReason: 'Default-excludes prompt cancelled.',
    nonAbortingNo: true,
  });
}
