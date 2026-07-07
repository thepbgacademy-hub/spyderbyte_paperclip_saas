import type { Workspace } from "../domain/types.js";

export function createWorkspace(input: {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}): Workspace {
  return {
    id: input.id,
    name: input.name,
    slug: input.slug,
    status: "active",
    createdAt: input.createdAt
  };
}
