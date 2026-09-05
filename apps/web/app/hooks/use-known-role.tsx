import { createContext, useContext } from 'react';

export type WorkspaceRole = 'member' | 'admin' | 'owner';

const KnownRoleContext = createContext<WorkspaceRole | null>(null);

export function KnownRoleProvider({
  role,
  children,
}: {
  role: WorkspaceRole | null;
  children: React.ReactNode;
}) {
  return <KnownRoleContext.Provider value={role}>{children}</KnownRoleContext.Provider>;
}

export function useKnownRole(): WorkspaceRole | null {
  return useContext(KnownRoleContext);
}

export function useCanManage(canManage: boolean | null): boolean | null {
  const role = useKnownRole();
  if (canManage !== null) return canManage;
  return role === null ? null : role !== 'member';
}
