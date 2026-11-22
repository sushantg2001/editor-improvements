// Every live check. A new check is one file here and one line in this list.
import type { Check } from "../harness";
import commandsChanged from "./commands-changed";
import emptyPlugin from "./empty-plugin";
import emulateMobile from "./emulate-mobile";
import hotkeyCatchAll from "./hotkey-catch-all";
import ime from "./ime";
import keyRepeat from "./key-repeat";
import modalScope from "./modal-scope";
import nativeClipboard from "./native-clipboard";
import nestedEditors from "./nested-editors";
import popoutRouter from "./popout-router";
import popoutStacks from "./popout-stacks";
import realKeysMenu from "./real-keys-menu";
import routerCost from "./router-cost";
import scopeResults from "./scope-results";
import searchBar from "./search-bar";
import takeover from "./takeover";
import topOverPalette from "./top-over-palette";
import vimCtrlC from "./vim-ctrl-c";

export const checks: Check[] = [
	commandsChanged,
	emptyPlugin,
	emulateMobile,
	hotkeyCatchAll,
	ime,
	keyRepeat,
	modalScope,
	nativeClipboard,
	nestedEditors,
	popoutRouter,
	popoutStacks,
	realKeysMenu,
	routerCost,
	scopeResults,
	searchBar,
	takeover,
	topOverPalette,
	vimCtrlC,
];
