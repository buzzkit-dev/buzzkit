import type { WorkspaceMember } from './types';

export function serializeMember(member: WorkspaceMember) {
  return { id: member.id, role: member.role, createdAt: member.createdAt, updatedAt: member.updatedAt };
}
