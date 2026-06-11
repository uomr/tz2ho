"""
RuknAuto — نافذة إيقاف طوارئ عائمة
=====================================
تعمل كعملية Python منفصلة بجانب inject_cli.py.

الاستخدام:
    python stop_watcher.py <parent_pid> <total_rows> <signal_file> [progress_file]

توفر:
  • نافذة عائمة صغيرة فوق كل التطبيقات مع زر إيقاف 🛑
  • مفتاح اختصار عام Ctrl+F12 (يعمل حتى لو النافذة غير نشطة)
  • تقتل عملية RPA الأم بالكامل عند التفعيل عبر taskkill /F /T
  • تغلق نفسها تلقائياً عندما تنتهي العملية الأم
"""

import sys
import os
import subprocess
import tkinter as tk
import ctypes
import ctypes.wintypes
import threading


def main():
    if len(sys.argv) < 4:
        print("Usage: python stop_watcher.py <pid> <total> <signal_file> [progress_file]")
        sys.exit(1)

    parent_pid    = int(sys.argv[1])
    total_rows    = int(sys.argv[2])
    signal_file   = sys.argv[3]
    progress_file = sys.argv[4] if len(sys.argv) > 4 else None

    # ── بناء النافذة ──
    root = tk.Tk()
    root.overrideredirect(True)           # بدون شريط عنوان
    root.attributes("-topmost", True)     # فوق كل النوافذ دائماً
    root.attributes("-alpha", 0.92)       # شبه شفافة
    root.configure(bg="#0f172a")

    WIDTH, HEIGHT = 230, 52
    sw = root.winfo_screenwidth()
    root.geometry(f"{WIDTH}x{HEIGHT}+{sw - WIDTH - 20}+20")

    # ── الإطار الرئيسي مع حدود ──
    frame = tk.Frame(root, bg="#0f172a",
                     highlightbackground="#334155", highlightthickness=1)
    frame.pack(fill="both", expand=True)

    # ── مؤشر التقدم ──
    progress_var = tk.StringVar(value=f"⏳ 0/{total_rows}")
    lbl = tk.Label(frame, textvariable=progress_var,
                   font=("Consolas", 10, "bold"), fg="#64ffda", bg="#0f172a")
    lbl.pack(side="left", padx=(12, 6))

    # ── تلميح المفتاح ──
    hint = tk.Label(frame, text="Ctrl+F12",
                    font=("Consolas", 7), fg="#475569", bg="#0f172a")
    hint.pack(side="left", padx=(0, 4))

    # ═══════════════════════════════════════════════════
    #  إيقاف الطوارئ
    # ═══════════════════════════════════════════════════
    _stopped = [False]

    def do_stop():
        if _stopped[0]:
            return
        _stopped[0] = True

        # 1) اكتب ملف إشارة الإيقاف
        try:
            with open(signal_file, "w") as f:
                f.write("STOP")
        except Exception:
            pass

        # 2) اقتل شجرة العملية الأم بالكامل
        try:
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(parent_pid)],
                capture_output=True, timeout=5,
                creationflags=0x08000000,  # CREATE_NO_WINDOW
            )
        except Exception:
            # fallback: os.kill
            try:
                import signal as sig
                os.kill(parent_pid, sig.SIGTERM)
            except Exception:
                pass

        # 3) أغلق هذه النافذة
        try:
            root.destroy()
        except Exception:
            pass
        os._exit(0)

    # ── زر الإيقاف ──
    stop_btn = tk.Button(frame, text="🛑 إيقاف",
                         command=do_stop,
                         font=("Arial", 9, "bold"),
                         bg="#dc2626", fg="white",
                         activebackground="#b91c1c", activeforeground="white",
                         relief="flat", padx=10, pady=3,
                         cursor="hand2", bd=0)
    stop_btn.pack(side="right", padx=(4, 10), pady=8)

    # ═══════════════════════════════════════════════════
    #  سحب النافذة بالماوس
    # ═══════════════════════════════════════════════════
    drag_data = {"x": 0, "y": 0}

    def start_drag(e):
        drag_data["x"], drag_data["y"] = e.x, e.y

    def on_drag(e):
        x = root.winfo_x() + e.x - drag_data["x"]
        y = root.winfo_y() + e.y - drag_data["y"]
        root.geometry(f"+{x}+{y}")

    for widget in (frame, lbl, hint):
        widget.bind("<Button-1>", start_drag)
        widget.bind("<B1-Motion>", on_drag)

    # ═══════════════════════════════════════════════════
    #  تحديث التقدم + فحص حياة العملية الأم
    # ═══════════════════════════════════════════════════
    def _is_parent_alive():
        """فحص حياة العملية الأم باستخدام Windows API."""
        try:
            PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
            handle = ctypes.windll.kernel32.OpenProcess(
                PROCESS_QUERY_LIMITED_INFORMATION, False, parent_pid
            )
            if handle:
                ctypes.windll.kernel32.CloseHandle(handle)
                return True
            return False
        except Exception:
            return False

    def tick():
        if _stopped[0]:
            return

        # قراءة ملف التقدم
        if progress_file:
            try:
                with open(progress_file, "r") as f:
                    val = f.read().strip()
                if val:
                    progress_var.set(f"⏳ {val}/{total_rows}")
            except Exception:
                pass

        # هل العملية الأم لا زالت حية؟
        if not _is_parent_alive():
            try:
                root.destroy()
            except Exception:
                pass
            os._exit(0)

        root.after(500, tick)

    # تأخير بداية الفحص لإعطاء العملية الأم وقتاً للبدء
    root.after(2000, tick)

    # ═══════════════════════════════════════════════════
    #  مفتاح اختصار عام: Ctrl+F12
    #  يعمل حتى لو هذه النافذة غير نشطة
    # ═══════════════════════════════════════════════════
    def hotkey_listener():
        try:
            user32 = ctypes.windll.user32
            MOD_CONTROL = 0x0002
            VK_F12      = 0x7B
            HK_ID       = 37421

            if not user32.RegisterHotKey(None, HK_ID, MOD_CONTROL, VK_F12):
                return  # المفتاح مأخوذ — تخطي بصمت

            msg = ctypes.wintypes.MSG()
            while True:
                ret = user32.GetMessageW(ctypes.byref(msg), None, 0, 0)
                if ret <= 0:
                    break
                if msg.message == 0x0312:  # WM_HOTKEY
                    # جدول الإيقاف في الخيط الرئيسي
                    root.after(0, do_stop)
                    break

            user32.UnregisterHotKey(None, HK_ID)
        except Exception:
            pass

    hk_thread = threading.Thread(target=hotkey_listener, daemon=True)
    hk_thread.start()

    # ── Escape داخل النافذة نفسها ──
    root.bind("<Escape>", lambda e: do_stop())

    # ── إغلاق النافذة = إيقاف ──
    root.protocol("WM_DELETE_WINDOW", do_stop)

    root.mainloop()


if __name__ == "__main__":
    main()
