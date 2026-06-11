import sys
import json
import logging
import time
import os
import io
import subprocess
import tkinter as tk
import pyautogui

# Force UTF-8 stdout on Windows to avoid charmap encoding errors with Arabic/emoji
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# Adjust import path
script_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(script_dir)
sys.path.append(os.path.join(script_dir, "src", "lib"))

from src.lib.rukn_rpa_engine import RpaEngine

# Configure logging to stdout so Express backend can read it in real time
logging.basicConfig(
    level=logging.INFO,
    format="[RPA] %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)

logger = logging.getLogger("RuknAuto.CLI")

def _prompt_start_row(max_row: int) -> int:
    """تظهر نافذة تسمح للمستخدم بإدخال رقم الصف (1‑{max_row}).
    تُعيد 0 إذا اختار البدء من البداية، أو -1 إذا ألغى العملية.
    """
    result = [-1]
    root = tk.Tk()
    root.title("اختيار نقطة البدء")
    root.geometry("420x200")
    root.resizable(False, False)
    root.configure(bg="#0f172a")
    root.attributes("-topmost", True)
    try:
        root.attributes("-toolwindow", True)
    except Exception:
        pass
    root.lift()
    root.update_idletasks()
    x = (root.winfo_screenwidth() - 420) // 2
    y = (root.winfo_screenheight() - 200) // 2
    root.geometry(f"420x200+{x}+{y}")
    root.focus_force()

    BG, BG2 = "#0f172a", "#1e293b"
    GRAY, WHITE = "#94a3b8", "#f8fafc"
    BLUE = "#3b82f6"
    FONT = "Segoe UI"

    tk.Label(root, text="استئناف من صف معين", font=(FONT, 12, "bold"), fg=BLUE, bg=BG).pack(pady=(12, 4))
    tk.Label(root, text=f"عدد الصفوف المتاحة: 1 – {max_row}", font=(FONT, 9), fg=GRAY, bg=BG).pack()

    entry_var = tk.StringVar(value="")
    entry = tk.Entry(root, textvariable=entry_var, font=("Courier New", 12, "bold"), width=8,
                     justify="center",
                     bg=BG2, fg=WHITE, insertbackground=WHITE,
                     relief="solid", bd=1)
    entry.pack(pady=12)
    entry.focus_set()

    def ok(event=None):
        val = entry_var.get().strip()
        if not val:
            result[0] = 0
        else:
            try:
                num = int(val)
                if 1 <= num <= max_row:
                    result[0] = num - 1  # صفر‑مبني
                else:
                    result[0] = -1
            except Exception:
                result[0] = -1
        root.destroy()

    def cancel(event=None):
        result[0] = -1
        root.destroy()

    entry.bind("<Return>", ok)
    entry.bind("<Escape>", cancel)

    btn = tk.Frame(root, bg=BG)
    btn.pack(pady=8)
    tk.Button(btn, text="بدء من هذا الصف ▶", command=ok,
              font=(FONT, 10, "bold"), bg=BLUE, fg="white",
              activebackground="#2563eb", activeforeground="white", relief="flat",
              padx=12, pady=6, cursor="hand2").pack(side="right", padx=6)
    tk.Button(btn, text="إلغاء ✕", command=cancel,
              font=(FONT, 9), bg="#451a1a", fg="#f87171",
              activebackground="#6b1d1d", activeforeground="#f87171", relief="flat",
              padx=12, pady=6, cursor="hand2").pack(side="right", padx=6)

    root.protocol("WM_DELETE_WINDOW", cancel)
    root.mainloop()
    return result[0]

def _ask_resume_or_restart(resumed_from: int, total: int) -> str:
    """تظهر نافذة تسمح للمستخدم باختيار:
    • الاستمرار من الصف المحفوظ
    • البدء من البداية
    • اختيار صف مخصص
    • إلغاء العملية
    """
    result = ["cancel"]
    root = tk.Tk()
    root.title("استئناف حقن الفاتورة")
    root.geometry("500x260")
    root.resizable(False, False)
    root.configure(bg="#0f172a")
    root.attributes("-topmost", True)
    try:
        root.attributes("-toolwindow", True)
    except Exception:
        pass
    root.lift()
    root.update_idletasks()
    x = (root.winfo_screenwidth() - 500) // 2
    y = (root.winfo_screenheight() - 260) // 2
    root.geometry(f"500x260+{x}+{y}")
    root.focus_force()

    BG, BG2 = "#0f172a", "#1e293b"
    BLUE = "#3b82f6"
    GRAY, WHITE = "#94a3b8", "#f8fafc"
    FONT = "Segoe UI"

    # رأس
    hdr = tk.Frame(root, bg="#1e293b", pady=16)
    hdr.pack(fill="x")
    tk.Label(hdr, text="استئناف حقن الفاتورة", font=(FONT, 13, "bold"), fg=BLUE, bg="#1e293b").pack()
    tk.Label(hdr, text=f"الصف المحفوظ: {resumed_from + 1} من {total}",
             font=(FONT, 10), fg=GRAY, bg="#1e293b").pack(pady=(4, 0))

    # فاصل
    tk.Frame(root, bg="#334155", height=1).pack(fill="x")

    # محتوى
    body = tk.Frame(root, bg=BG, padx=20, pady=24)
    body.pack(fill="both", expand=True)
    tk.Label(body, text="كيف تود المتابعة؟", font=(FONT, 11, "bold"), fg=WHITE, bg=BG).pack()

    def do_resume(e=None):
        result[0] = "resume"
        root.destroy()

    def do_restart(e=None):
        result[0] = "restart"
        root.destroy()

    def do_choose(e=None):
        root.destroy()
        row = _prompt_start_row(total)
        if row >= 0:
            result[0] = f"row:{row}"
        else:
            result[0] = "cancel"

    def do_cancel(e=None):
        result[0] = "cancel"
        root.destroy()

    btn = tk.Frame(body, bg=BG)
    btn.pack(pady=20)
    
    tk.Button(btn, text="استكمال من الصف المحفوظ ▶", command=do_resume,
              font=(FONT, 10, "bold"), bg=BLUE, fg="white",
              activebackground="#2563eb", activeforeground="white", relief="flat",
              padx=14, pady=8, cursor="hand2").pack(side="right", padx=6)
    tk.Button(btn, text="من البداية 🔄", command=do_restart,
              font=(FONT, 9), bg=BG2, fg=WHITE,
              activebackground="#334155", activeforeground="white", relief="flat",
              padx=12, pady=8, cursor="hand2").pack(side="right", padx=6)
    tk.Button(btn, text="اختيار صف 📍", command=do_choose,
              font=(FONT, 9), bg=BG2, fg=WHITE,
              activebackground="#334155", activeforeground="white", relief="flat",
              padx=12, pady=8, cursor="hand2").pack(side="right", padx=6)
    tk.Button(btn, text="إلغاء ✕", command=do_cancel,
              font=(FONT, 9), bg="#451a1a", fg="#f87171",
              activebackground="#6b1d1d", activeforeground="#f87171", relief="flat",
              padx=12, pady=8, cursor="hand2").pack(side="right", padx=6)

    tk.Label(body, text="Enter = استكمال  |  Esc = إلغاء", font=(FONT, 8), fg=GRAY, bg=BG).pack(side="bottom", pady=(0, 0))
    
    root.bind("<Return>", do_resume)
    root.bind("<Escape>", do_cancel)
    root.protocol("WM_DELETE_WINDOW", do_cancel)
    root.mainloop()
    return result[0]


def main():
    # Usage: python inject_cli.py '<json_items>' [invoice_id] [start_from]
    if len(sys.argv) < 2:
        print(json.dumps({"status": "error", "message": "Usage: python inject_cli.py '<json_items>' [invoice_id] [start_from]"}))
        sys.exit(1)

    try:
        items = json.loads(sys.argv[1])
    except Exception as e:
        print(json.dumps({"status": "error", "message": f"Invalid JSON input: {str(e)}"}))
        sys.exit(1)

    # Optional invoice_id for checkpoint naming
    invoice_id = sys.argv[2] if len(sys.argv) > 2 else "default"

    # Optional start_from for explicit resume override
    explicit_start = 0
    if len(sys.argv) > 3:
        try:
            explicit_start = int(sys.argv[3])
        except ValueError:
            pass

    # Optional end_at for explicit limit override
    explicit_end = None
    if len(sys.argv) > 4:
        try:
            val = int(sys.argv[4])
            if val > 0:
                explicit_end = val
        except ValueError:
            pass

    # Optional speed mode: argv[5] = "fast" | "safe"
    speed_mode = "safe"
    if len(sys.argv) > 5 and sys.argv[5].strip().lower() == "fast":
        speed_mode = "fast"

    # Checkpoint file — stored next to inject_cli.py
    checkpoint_path = os.path.join(script_dir, f"checkpoint_{invoice_id}.json")

    # Determine effective start_from (checkpoint wins unless explicit override)
    start_from = explicit_start
    checkpoint_handled = False  # هل عالج CLI ملف checkpoint بنفسه؟
    if explicit_start == 0 and os.path.exists(checkpoint_path):
        try:
            with open(checkpoint_path, "r", encoding="utf-8") as f:
                checkpoint = json.load(f)
                resumed_from = checkpoint.get("last_successful_row", 0)
                total_items = len(items)
                if resumed_from > 0 and resumed_from < total_items:
                    # اطلب من المستخدم ما إذا يرغب بالاستمرار أو البدء من جديد أو اختيار صف
                    choice = _ask_resume_or_restart(resumed_from, total_items)
                    if choice.startswith("row:"):
                        start_from = int(choice.split(":")[1])
                        print(json.dumps({"status": "info", "message": f"بدء من الصف {start_from+1}"}), flush=True)
                    elif choice == "restart":
                        start_from = 0
                        print(json.dumps({"status": "info", "message": "بدء من الصف الأول"}), flush=True)
                    elif choice == "resume":
                        start_from = resumed_from
                        print(json.dumps({"status": "info", "message": f"استئناف من الصف {start_from+1}"}), flush=True)
                    else:
                        # cancel
                        print(json.dumps({"status": "error", "message": "تم إلغاء الحقن من قبل المستخدم"}), flush=True)
                        sys.exit(0)
                else:
                    # Stale/completed checkpoint (row >= total) — بدء من الصف الأول
                    start_from = 0
                    print(json.dumps({"status": "info", "message": "فاتورة مكتملة سابقاً — بدء من الصف الأول"}), flush=True)
            checkpoint_handled = True
        except Exception as e:
            logger.error(f"[RPA] ERROR - فشل قراءة checkpoint: {e}")
            checkpoint_handled = True  # منع المحرك من إعادة القراءة
            start_from = 0

    # ── احذف checkpoint القديم حتى لا يقرأه المحرك مرة ثانية ──
    # المحرك سيكتب checkpoints جديدة أثناء الحقن
    if checkpoint_handled and os.path.exists(checkpoint_path):
        try:
            os.remove(checkpoint_path)
        except Exception:
            pass  # لو مقفل — المحرك سيتجاوزه لأن start_from مُحدد
    # إذا صُبّ explicit_start غير صفر، فهذا يعني أن المستخدم طلب بدء من تلك النقطة مباشرةً
    if explicit_start > 0:
        start_from = explicit_start - 1

    end_msg = f" إلى الصف {explicit_end}" if explicit_end else " حتى النهاية"
    print(json.dumps({"status": "info", "message": f"بدء حقن {len(items)} بندًا من الصف {start_from+1}{end_msg}"}), flush=True)

    # ═══════════════════════════════════════════════════════════
    #  نافذة إيقاف الطوارئ العائمة (عملية منفصلة)
    # ═══════════════════════════════════════════════════════════
    signal_file   = os.path.join(script_dir, f"stop_{invoice_id}.signal")
    progress_file = os.path.join(script_dir, f"progress_{invoice_id}.txt")
    watcher_proc  = None

    # تنظيف ملفات قديمة
    for f in (signal_file, progress_file):
        try:
            if os.path.exists(f):
                os.remove(f)
        except Exception:
            pass

    # تشغيل النافذة العائمة
    try:
        watcher_script = os.path.join(script_dir, "stop_watcher.py")
        if os.path.exists(watcher_script):
            watcher_proc = subprocess.Popen(
                [sys.executable, watcher_script,
                 str(os.getpid()), str(len(items)), signal_file, progress_file],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                stdin=subprocess.DEVNULL,
            )
            print(json.dumps({"status": "info", "message": "🛑 نافذة إيقاف الطوارئ جاهزة — Ctrl+F12 للإيقاف الفوري"}), flush=True)
    except Exception as watcher_err:
        logger.warning(f"Failed to start stop watcher: {watcher_err}")

    # Countdown
    countdown = 5
    for i in range(countdown, 0, -1):
        print(f"[RPA] INFO - Countdown: {i} seconds... click on NewPoint ERP first empty row now!", flush=True)
        time.sleep(1)

    try:
        engine = RpaEngine("config.json")
        engine.step_mode = False

        # تطبيق وضع السرعة بعد تهيئة المحرك
        # FIX: استدعاء apply_safe_mode() صراحةً بدلاً من الاعتماد على القيم الافتراضية
        if speed_mode == "fast":
            engine.apply_fast_mode()
            print(json.dumps({"status": "info", "message": "⚡ وضع السرعة مفعّل — تأكد من متابعة الحقن بعناية"}), flush=True)
        else:
            engine.apply_safe_mode()
            print(json.dumps({"status": "info", "message": "🐢 وضع الأمان — توقيت قياسي"}), flush=True)

        def on_progress(idx, total, status):
            # ── فحص ملف إشارة الإيقاف ──
            if os.path.exists(signal_file):
                engine.stop()
                raise Exception("تم الإيقاف من نافذة الطوارئ")

            # ── كتابة ملف التقدم للنافذة العائمة ──
            try:
                with open(progress_file, "w") as f:
                    f.write(str(idx + 1))
            except Exception:
                pass

            icons = {"running": "[..]", "success": "[OK]", "skipped": "[SKIP]", "error": "[ERR]"}
            icon = icons.get(status, "[??]")
            print(f"[RPA] PROGRESS: {icon} {idx+1}/{total} - {status}", flush=True)

        def on_search(idx, part):
            print(
                f"[RPA] SEARCH: [!] Row {idx+1} - part '{part}' not found in NewPoint."
                f" Please select manually or close the search window to skip.",
                flush=True
            )

        def on_error(idx, part, error):
            print(f"[RPA] ERROR: [X] Row {idx+1} failed for '{part}': {error}", flush=True)
            # Auto-skip bad part numbers
            return "skip"

        results = engine.inject_invoice(
            items,
            start_from=start_from,
            end_at=explicit_end,
            on_progress=on_progress,
            on_search_window=on_search,
            on_error=on_error,
            checkpoint_path=checkpoint_path,
        )

        ok = sum(1 for r in results if r.get("status") == "success")
        skipped = sum(1 for r in results if r.get("status") == "skipped")
        print(
            f"[RPA] INFO - COMPLETE: {ok}/{len(items)} injected successfully."
            f" {skipped} skipped.",
            flush=True
        )

        # Print skipped items summary for the user to fix later
        skipped_items = [r for r in results if r.get("status") in ("skipped", "error")]
        if skipped_items:
            print(f"[RPA] INFO - Skipped items ({len(skipped_items)}):", flush=True)
            for r in skipped_items:
                print(f"[RPA] INFO -   Row {r['index']+1}: '{r['part_number']}' - {r.get('error', '')}", flush=True)

        print(json.dumps({"status": "success", "results": results}))

    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}))
        sys.exit(1)

    finally:
        # ═══════════════════════════════════════════════════════
        #  تنظيف: إغلاق النافذة العائمة وحذف الملفات المؤقتة
        # ═══════════════════════════════════════════════════════
        if watcher_proc:
            try:
                watcher_proc.kill()
                watcher_proc.wait(timeout=3)
            except Exception:
                pass
        for f in (signal_file, progress_file):
            try:
                if os.path.exists(f):
                    os.remove(f)
            except Exception:
                pass


if __name__ == "__main__":
    main()
