import type { FeatureModule } from "../core/modules";
import { contextMenuModule } from "./context-menu";
import { editorShortcutsModule } from "./editor-shortcuts";

/**
 * Every built-in feature, in load order. Later modules win key conflicts, and
 * user scripts load after all of them.
 *
 * Adding a feature means adding a file in this folder and one line here.
 */
export const MODULES: readonly FeatureModule[] = [contextMenuModule, editorShortcutsModule];
