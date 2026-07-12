type CommandHost = {
  commands?: {
    executeCommandById?: (id: string) => boolean;
  };
};

export function executeObsidianCommand(app: unknown, id: string): boolean {
  const commands = (app as CommandHost).commands;
  if (typeof commands?.executeCommandById !== "function") return false;
  return Boolean(commands.executeCommandById(id));
}
