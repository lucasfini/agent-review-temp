"use client";

export type LibraryMutationAction = 'created' | 'updated' | 'deleted' | 'shared' | 'unshared';

export type LibraryMutationDetail = {
  libraryId?: string | null;
  action: LibraryMutationAction;
};

export const LIBRARY_MUTATION_EVENT = 'library:mutated';

export function emitLibraryMutation(detail: LibraryMutationDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<LibraryMutationDetail>(LIBRARY_MUTATION_EVENT, { detail }));
}
