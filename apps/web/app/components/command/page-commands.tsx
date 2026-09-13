import { type Command, useRegisterCommands } from '@/app/hooks/use-commands';

export function PageCommands({ commands }: { commands: Command[] }) {
  useRegisterCommands(commands);
  return null;
}
