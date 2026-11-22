import type { Check } from "../harness";

export default {
	name: "emulate-mobile",
	covers: ["V15"],
	mobileOnly: true,
	async run(t) {
		t.expect(await t.eval(`localStorage.getItem("EmulateMobile")`), "the flag").toBe("1");
		t.expect(await t.eval(`document.body.classList.contains("is-mobile")`), "the window reloaded as mobile").toBe(true);
	},
} satisfies Check;
