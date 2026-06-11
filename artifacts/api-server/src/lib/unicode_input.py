"""
RuknAuto — Unicode SendInput Module
====================================
يرسل حروف Unicode مباشرة عبر Win32 SendInput
يتجاوز مشكلة Arabic/English keyboard layout بالكامل.

الاستخدام:
    from unicode_input import type_text, is_window_focused
    type_text("x66a", interval=0.10)
"""

import ctypes
import ctypes.wintypes
import time

user32 = ctypes.windll.user32

# ═══════════════════════════════════════════════════════════
#  Win32 SendInput Structures (Fixed alignment — sizeof=40)
# ═══════════════════════════════════════════════════════════
INPUT_KEYBOARD      = 1
KEYEVENTF_UNICODE   = 0x0004
KEYEVENTF_KEYUP     = 0x0002


class MOUSEINPUT(ctypes.Structure):
    """Required in union for correct struct sizing (32 bytes on x64)."""
    _fields_ = [
        ("dx",          ctypes.c_long),
        ("dy",          ctypes.c_long),
        ("mouseData",   ctypes.c_ulong),
        ("dwFlags",     ctypes.c_ulong),
        ("time",        ctypes.c_ulong),
        ("dwExtraInfo", ctypes.c_void_p),
    ]


class KEYBDINPUT(ctypes.Structure):
    _fields_ = [
        ("wVk",         ctypes.c_ushort),
        ("wScan",       ctypes.c_ushort),
        ("dwFlags",     ctypes.c_ulong),
        ("time",        ctypes.c_ulong),
        ("dwExtraInfo", ctypes.c_void_p),
    ]


class HARDWAREINPUT(ctypes.Structure):
    _fields_ = [
        ("uMsg",    ctypes.c_ulong),
        ("wParamL", ctypes.c_ushort),
        ("wParamH", ctypes.c_ushort),
    ]


class INPUT_UNION(ctypes.Union):
    _fields_ = [
        ("mi", MOUSEINPUT),
        ("ki", KEYBDINPUT),
        ("hi", HARDWAREINPUT),
    ]


class INPUT(ctypes.Structure):
    _fields_ = [
        ("type",  ctypes.c_ulong),
        ("union", INPUT_UNION),
    ]


# Verify struct size at import time
_INPUT_SIZE = ctypes.sizeof(INPUT)
assert _INPUT_SIZE >= 40, f"INPUT struct size is {_INPUT_SIZE}, expected >=40 on x64"


# ═══════════════════════════════════════════════════════════
#  Core Functions
# ═══════════════════════════════════════════════════════════

def send_unicode_char(char: str) -> bool:
    """Send a single Unicode character via SendInput (KEYEVENTF_UNICODE).
    Bypasses keyboard layout completely.

    Returns True if successful.
    """
    code = ord(char)

    # Key Down
    inp_down = INPUT()
    inp_down.type = INPUT_KEYBOARD
    inp_down.union.ki.wVk = 0
    inp_down.union.ki.wScan = code
    inp_down.union.ki.dwFlags = KEYEVENTF_UNICODE
    inp_down.union.ki.dwExtraInfo = 0

    # Key Up
    inp_up = INPUT()
    inp_up.type = INPUT_KEYBOARD
    inp_up.union.ki.wVk = 0
    inp_up.union.ki.wScan = code
    inp_up.union.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP
    inp_up.union.ki.dwExtraInfo = 0

    r1 = user32.SendInput(1, ctypes.byref(inp_down), _INPUT_SIZE)
    r2 = user32.SendInput(1, ctypes.byref(inp_up), _INPUT_SIZE)
    return r1 == 1 and r2 == 1


def type_text(text: str, interval: float = 0.08) -> int:
    """Type text character by character using Unicode SendInput.

    Args:
        text: The text to type.
        interval: Delay in seconds between characters.

    Returns:
        Number of characters successfully sent.
    """
    success = 0
    for ch in text:
        if send_unicode_char(ch):
            success += 1
        time.sleep(interval)
    return success


# ═══════════════════════════════════════════════════════════
#  Window & Layout Utilities
# ═══════════════════════════════════════════════════════════

def get_keyboard_lang() -> int:
    """Get the keyboard layout language ID of the foreground window.
    Returns: Language ID (e.g. 0x0409 = English US, 0x0401 = Arabic SA)
    """
    hwnd = user32.GetForegroundWindow()
    tid = user32.GetWindowThreadProcessId(hwnd, None)
    hkl = user32.GetKeyboardLayout(tid)
    return hkl & 0xFFFF


def get_active_window_title() -> str:
    """Get active window title using native Win32 API for 100% reliability."""
    try:
        hwnd = user32.GetForegroundWindow()
        if not hwnd:
            return ""
        length = user32.GetWindowTextLengthW(hwnd)
        if length > 0:
            buff = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(hwnd, buff, length + 1)
            return buff.value
        return ""
    except Exception:
        try:
            import pygetwindow as gw
            w = gw.getActiveWindow()
            return w.title if w else ""
        except Exception:
            return ""


def is_window_focused(keyword: str) -> bool:
    """Check if a window containing `keyword` in its title is currently focused."""
    return keyword.lower() in get_active_window_title().lower()


def get_active_has_keyword(keywords: list) -> str:
    """Check if any of the given keywords appear in the active window title.
    Returns the matched keyword or empty string.
    """
    title = get_active_window_title().lower()
    for kw in keywords:
        if kw.lower() in title:
            return kw
    return ""
