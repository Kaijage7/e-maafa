import { Module } from './modules';
import { MODULE_PERMISSION } from './access';

/**
 * Which top-level MODULES appear on the hub/menu — driven by the user's PERMISSIONS so the menu matches
 * the backend ModuleGuardFilter (a card shows only if the user holds that module's view permission). A
 * module slug with no mapped permission is always shown. A session with no permissions array fails CLOSED
 * (VAPT hardening); such legacy sessions are discarded at AuthService.restore() so the user re-authenticates
 * and receives the real permission set.
 */
export function visibleModules(
  all: Module[],
  user: { roles?: string[]; permissions?: string[] } | null | undefined,
): Module[] {
  const perms = user?.permissions;
  if (perms == null) {
    return []; // no permissions array -> fail CLOSED
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
