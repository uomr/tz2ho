import ctypes
import ctypes.wintypes
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

user32 = ctypes.windll.user32

def get_window_title(hwnd):
    length = user32.GetWindowTextLengthW(hwnd)
    if length > 0:
        buff = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, buff, length + 1)
        return buff.value
    return ""

def get_class_name(hwnd):
    buff = ctypes.create_unicode_buffer(256)
    user32.GetClassNameW(hwnd, buff, 256)
    return buff.value

def inspect_erp_children(parent_hwnd):
    print(f"--- Child Windows of HWND {parent_hwnd} ---")
    WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.wintypes.HWND, ctypes.wintypes.LPARAM)
    
    children = []
    
    def cb(hwnd, _):
        title = get_window_title(hwnd)
        cls = get_class_name(hwnd)
        visible = user32.IsWindowVisible(hwnd)
        style = user32.GetWindowLongW(hwnd, -16)
        ex_style = user32.GetWindowLongW(hwnd, -20)
        
        children.append({
            "hwnd": hwnd,
            "title": title,
            "class": cls,
            "visible": visible,
            "style": hex(style) if style else "0x0",
            "ex_style": hex(ex_style) if ex_style else "0x0"
        })
        return True
        
    user32.EnumChildWindows(parent_hwnd, WNDENUMPROC(cb), 0)
    
    # Sort children to show those that are visible first, and those that have titles
    for w in children:
        if w["visible"] or w["title"]:
            print(f"HWND: {w['hwnd']}, Visible: {w['visible']}, Class: {w['class']}, Title: {repr(w['title'])}, Style: {w['style']}, ExStyle: {w['ex_style']}")

if __name__ == "__main__":
    inspect_erp_children(66382)
