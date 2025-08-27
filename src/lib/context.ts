export function requireGuildId(gid?: string | null): string {
  if (!gid) throw new Error("This command must be used in a guild.");
  return gid;
}
