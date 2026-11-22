#!/usr/bin/env python3
"""Sends real key presses through XTest, standard library only.

Usage: xkey.py --token FILE COMBO [COMBO ...]   for example Control_L+c

It refuses to send unless the focus check has just confirmed, in the token file,
that the isolated test window holds focus.
"""
import ctypes
import ctypes.util
import json
import os
import sys
import time

TOKEN_MAX_AGE_MS = 1000


def refuse(reason):
    print(f"xkey: refused: {reason}", file=sys.stderr)
    sys.exit(2)


def main():
    args = sys.argv[1:]
    if len(args) < 3 or args[0] != "--token":
        refuse("usage: xkey.py --token FILE COMBO [COMBO ...]")
    try:
        with open(args[1], encoding="utf-8") as handle:
            token = json.load(handle)
        age = time.time() * 1000 - token["at"]
    except (OSError, ValueError, KeyError, TypeError) as error:
        refuse(f"no valid focus token ({error})")
    if age < 0 or age > TOKEN_MAX_AGE_MS:
        refuse(f"the focus token is {age:.0f} ms old")

    x11 = ctypes.CDLL(ctypes.util.find_library("X11"))
    xtst = ctypes.CDLL(ctypes.util.find_library("Xtst"))
    x11.XOpenDisplay.restype = ctypes.c_void_p
    x11.XOpenDisplay.argtypes = [ctypes.c_char_p]
    x11.XStringToKeysym.restype = ctypes.c_ulong
    x11.XStringToKeysym.argtypes = [ctypes.c_char_p]
    x11.XKeysymToKeycode.restype = ctypes.c_ubyte
    x11.XKeysymToKeycode.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
    xtst.XTestFakeKeyEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]
    x11.XFlush.argtypes = [ctypes.c_void_p]

    display = x11.XOpenDisplay(os.environ.get("DISPLAY", ":0").encode())
    if not display:
        refuse("cannot open the X display")

    def keycode(name):
        code = x11.XKeysymToKeycode(display, x11.XStringToKeysym(name.encode()))
        if not code:
            refuse(f"no keycode for {name}")
        return code

    combos = [[keycode(name) for name in combo.split("+")] for combo in args[2:]]
    for keys in combos:
        for key in keys:
            xtst.XTestFakeKeyEvent(display, key, 1, 0)
        x11.XFlush(display)
        time.sleep(0.05)
        for key in reversed(keys):
            xtst.XTestFakeKeyEvent(display, key, 0, 0)
        x11.XFlush(display)
        time.sleep(0.2)


if __name__ == "__main__":
    main()
