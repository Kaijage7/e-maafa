import { Module } from './modules';
import { MODULE_PERMISSION } from './access';

/**
 * Which top-level MODULES appear on the hub/menu — driven by the user's PERMISSIONS so the menu matches
 * the backend ModuleGuardFilter (a card shows only if the user holds that module's view permission). A
 * module slug with no mapped permission (e.g. stakeholder-portal) is always shown. Legacy sessions with
 * no permission set fail OPEN (see all) so a stale login is never blanked out; they refresh on next login.
 */
export function visibleModules(
  all: Module[],
  user: { roles?: string[]; permissions?: string[] } | null | undefined,
): Module[] {
  const perms = user?.permissions;
  if (perms == null) {
    return all; // legacy / pre-permission session -> fail open
  }
  return all.filter(m => {
    const required = MODULE_PERMISSION[m.slug];
    if (!required) {
      return true;
    }
    // string = that permission; array = ANY of them (card shows if a user holds at least one sub-area perm).
    return Array.isArray(required) ? required.some(p => perms.includes(p)) : perms.includes(required);
  });
}
