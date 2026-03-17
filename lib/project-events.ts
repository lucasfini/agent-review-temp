"use client";

export type ProjectMutationAction = 'deleted' | 'cancelled' | 'updated';

export type ProjectMutationDetail = {
  projectId: string;
  action: ProjectMutationAction;
};

export const PROJECT_MUTATION_EVENT = 'project:mutated';

export function emitProjectMutation(detail: ProjectMutationDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ProjectMutationDetail>(PROJECT_MUTATION_EVENT, { detail }));
}
