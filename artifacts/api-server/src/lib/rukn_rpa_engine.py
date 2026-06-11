"""
RuknAuto — RPA Engine v3 (Interactive Edition)
===============================================
يحقن بيانات الفاتورة في Grid برنامج NewPoint ERP بذكاء.

التحسينات عن v2:
  • عند رفض رقم القطعة: يضغط ESC فوراً ويطلب التصحيح من الواجهة عبر stdin
  • لا يكتب في أي مكان خاطئ — يتجمد تماماً حتى يستلم الرقم الصحيح
  • وضع خطوة بخطوة (step mode) — يتوقف بعد كل صف للتحقق
  • ملاحة صحيحة — Tab بعد السعر (ليس Enter) لتجاوز حقول الخصم والضريبة
  • حماية مزدوجة — يتحقق من النافذة النشطة قبل وبعد كل عملية
"""

import sys
import time
import json
import logging
import pyautogui
# تعطيل وقفة PyAutoGUI الافتراضية (0.1 ثانية) بعد كل أمر لتسريع الكتابة والانتقال
pyautogui.PAUSE = 0.0

from unicode_input import type_text, is_window_focused, get_active_window_title, send_unicode_char

pyautogui.FAILSAFE = True

logger = logging.getLogger("RuknAuto.RPA")


# ═══════════════════════════════════════════════════════════
#  Custom Exceptions
# ═══════════════════════════════════════════════════════════

class FocusLostError(RuntimeError):
    """NewPoint lost focus during injection."""
    pass


class PartNotFoundError(RuntimeError):
    """Part number was not found — search window appeared after Enter."""
    pass


class PartValidationError(RuntimeError):
    """Part accepted by ERP but field appeared to be written in wrong position."""
    pass


class UserAbortError(RuntimeError):
    """User manually aborted the process."""
    pass


class ErpErrorPopup(RuntimeError):
    """ERP showed a validation/error popup (e.g. duplicate part, invalid value)."""
    pass


# ═══════════════════════════════════════════════════════════
#  RPA Engine
# ═══════════════════════════════════════════════════════════

class RpaEngine:
    """محرك حقن البيانات في NewPoint ERP Grid — النسخة الذكية."""

    def __init__(self, config_path: str = "config.json"):
        with open(config_path, encoding="utf-8") as f:
            self.config = json.load(f)

        self.erp_keyword = self.config.get("erp_window_keyword", "New Point")

        timing = self.config.get("timing", {})
        self.char_interval     = timing.get("char_interval", 0.10)
        self.num_interval      = timing.get("num_interval", 0.06)
        self.search_wait       = timing.get("search_wait", 1.5)
        self.after_enter       = timing.get("after_enter", 0.8)
        self.tab_delay         = timing.get("tab_delay", 0.3)
        self.row_settle        = timing.get("row_settle", 1.0)
        self.validation_wait   = timing.get("validation_wait", 2.0)   # FIX: كان مفقوداً من __init__

        tab_cfg = self.config.get("tab_order", {})
        self.tabs_to_qty       = tab_cfg.get("tabs_to_quantity", 0)
        self.tabs_to_price     = tab_cfg.get("tabs_to_price", 1)
        self.tabs_after_price  = tab_cfg.get("tabs_after_price_to_next_row", 6)

        self.step_mode = self.config.get("step_mode", True)
        self.fast_mode = False  # يُفعَّل من inject_cli

        # State
        self._paused        = False
        self._stopped       = False
        self._step_waiting  = False  # Waiting for user to confirm step

    # ───────────────────────────────────────────────────────
    #  Control
    # ───────────────────────────────────────────────────────
    def pause(self):
        self._paused = True

    def resume(self):
        self._paused = False

    def stop(self):
        self._stopped = True
        self._step_waiting = False
        self._paused = False

    def step_continue(self):
        """User confirmed — proceed to next row."""
        self._step_waiting = False

    def reset(self):
        self._paused = False
        self._stopped = False
        self._step_waiting = False

    # ───────────────────────────────────────────────────────
    #  Speed Presets
    # ───────────────────────────────────────────────────────
    def apply_fast_mode(self):
        """تطبيق توقيتات وضع السرعة — أسرع بشكل ملحوظ بعد إصلاح أخطاء النوافذ.
        """
        self.fast_mode     = True
        self.char_interval = 0.02
        self.num_interval  = 0.01
        self.tab_delay     = 0.05
        self.after_enter   = 0.40   
        self.row_settle    = 0.40
        self.search_wait   = 0.60
        self.validation_wait = 0.80  
        logger.info("[SPEED] Fast mode activated — using accelerated timing")

    def apply_safe_mode(self):
        """إعادة ضبط توقيتات الوضع الآمن (الافتراضي)."""
        self.fast_mode     = False
        self.char_interval = 0.10
        self.num_interval  = 0.06
        self.tab_delay     = 0.30
        self.after_enter   = 0.80
        self.row_settle    = 1.00
        self.search_wait   = 1.50
        self.validation_wait = 2.00
        logger.info("[SPEED] Safe mode — standard timing")

    # ───────────────────────────────────────────────────────
    #  Helpers
    # ───────────────────────────────────────────────────────
    def _wait_for_erp_focus(self, timeout: float = 60, on_waiting=None):
        """انتظار NewPoint تصبح النافذة النشطة.
        بدل رمي خطأ فوري، ينتظر الموظف يرجع لـ NewPoint.
        """
        if not self._is_erp_focused():
            logger.info("  [WAIT] Waiting for NewPoint focus...")
            if on_waiting:
                on_waiting()

            start = time.time()
            while not self._is_erp_focused():
                if self._stopped:
                    raise UserAbortError("تم الإلغاء")
                if time.time() - start > timeout:
                    title = get_active_window_title()
                    raise FocusLostError(
                        f"NewPoint لم تصبح النافذة النشطة خلال {int(timeout)} ثانية.\nالحالية: '{title}'"
                    )
                time.sleep(0.3)

        logger.info("  [OK] NewPoint active -- continuing")
        
        # حفظ مُعرّف النافذة الرئيسية (HWND) ومعرّف العملية (PID)
        # هذا يمنع الخلط بين النافذة الرئيسية ونوافذ البحث الفرعية لاحقاً
        import ctypes
        import ctypes.wintypes
        hwnd = ctypes.windll.user32.GetForegroundWindow()
        self.main_erp_hwnd = hwnd
        pid = ctypes.wintypes.DWORD()
        ctypes.windll.user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        self.erp_pid = pid.value
        
        time.sleep(0.3)  # Let ERP settle
        return True

    def _is_erp_focused(self) -> bool:
        """تحقق سريع: هل NewPoint أو إحدى نوافذها الفرعية نشطة؟"""
        title = get_active_window_title().lower()
        if self.erp_keyword.lower() in title:
            return True
        # NewPoint sub-windows (search, item list, etc.)
        if "بحث" in title or "اصناف" in title:
            return True
        return False

    def _is_search_window_open(self) -> bool:
        """تحقق إذا كانت نافذة البحث مفتوحة بالبحث داخل النوافذ الفرعية التابعة للنافذة الرئيسية."""
        import ctypes
        import ctypes.wintypes

        user32 = ctypes.windll.user32
        WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.wintypes.HWND, ctypes.wintypes.LPARAM)
        found = [False]

        def _get_text(hwnd_: int) -> str:
            length = user32.GetWindowTextLengthW(hwnd_)
            if length <= 0:
                return ""
            buff = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(hwnd_, buff, length + 1)
            return buff.value.strip()

        def _get_class(hwnd_: int) -> str:
            buff = ctypes.create_unicode_buffer(256)
            user32.GetClassNameW(hwnd_, buff, 256)
            return buff.value

        def child_cb(hwnd: int, _: int) -> bool:
            if not user32.IsWindowVisible(hwnd):
                return True
            
            # Check class name to see if it's a dialog/form, ignoring basic controls
            cls_name = _get_class(hwnd)
            is_form = False
            if cls_name == "#32770" or "Window" in cls_name or "Form" in cls_name or "View" in cls_name or "Dialog" in cls_name:
                is_form = True

            if is_form:
                title = _get_text(hwnd)
                if title and ("بحث" in title or "اصناف" in title):
                    found[0] = True
                    return False  # Stop enumeration
            return True

        def top_level_cb(hwnd: int, _: int) -> bool:
            if not user32.IsWindowVisible(hwnd):
                return True
            
            # Focus only on ERP windows
            if hasattr(self, "erp_pid") and self.erp_pid:
                pid = ctypes.wintypes.DWORD()
                user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
                if pid.value != self.erp_pid:
                    return True
            
            # If this is the main ERP window, enumerate its children
            if hasattr(self, "main_erp_hwnd") and hwnd == self.main_erp_hwnd:
                child_proc = WNDENUMPROC(child_cb)
                user32.EnumChildWindows(hwnd, child_proc, 0)
                if found[0]:
                    return False
                return True

            # Also check if it's a top-level search window belonging to ERP
            title = _get_text(hwnd)
            if title and ("بحث" in title or "اصناف" in title):
                found[0] = True
                return False

            return True

        cb = WNDENUMPROC(top_level_cb)
        user32.EnumWindows(cb, 0)
        return found[0]

    def _find_erp_dialog(self) -> tuple[bool, str]:
        """البحث عن أي نافذة dialog (#32770) ظهرت من ERP باستخدام Windows API.

        هذا الأسلوب يكتشف نوافذ مثل "غير مسموح بتكرار رقم الصنف"
        حتى لو كان عنوانها نفس عنوان NewPoint، لأنه يبحث بالـ class name لا العنوان.
        
        يعيد (True, error_text) أو (False, '').
        """
        import ctypes
        import ctypes.wintypes

        user32    = ctypes.windll.user32
        WNDENUMPROC = ctypes.WINFUNCTYPE(
            ctypes.c_bool, ctypes.wintypes.HWND, ctypes.wintypes.LPARAM
        )

        # الأزرار الشائعة التي نتجاهل نصها
        _BTN_LABELS = {"موافق", "إلغاء", "ok", "cancel", "نعم", "لا", "yes", "no",
                       "&ok", "&cancel", "&yes", "&no", "close", "إغلاق"}

        found_dialogs: list[tuple[int, str]] = []

        def _get_text(hwnd_: int) -> str:
            l = user32.GetWindowTextLengthW(hwnd_)
            if l <= 0:
                return ""
            buf = ctypes.create_unicode_buffer(l + 1)
            user32.GetWindowTextW(hwnd_, buf, l + 1)
            return buf.value.strip()

        def _get_class(hwnd_: int) -> str:
            buf = ctypes.create_unicode_buffer(256)
            user32.GetClassNameW(hwnd_, buf, 256)
            return buf.value

        def _collect_children(hwnd_dialog: int) -> list[str]:
            """جمع نصوص كل Child controls داخل الـ dialog (Static + Button)."""
            texts: list[str] = []

            def child_cb(child: int, _: int) -> bool:
                cls = _get_class(child)
                if cls in ("Static", "Button", "STATIC", "BUTTON"):
                    t = _get_text(child)
                    if t and t.lower() not in _BTN_LABELS:
                        texts.append(t)
                return True

            child_proc = WNDENUMPROC(child_cb)
            user32.EnumChildWindows(hwnd_dialog, child_proc, 0)
            return texts

        def top_level_cb(hwnd: int, _: int) -> bool:
            if not user32.IsWindowVisible(hwnd):
                return True
                
            # تجاهل نوافذ التطبيقات الأخرى (مثل المتصفح أو برامج أخرى)
            if hasattr(self, "erp_pid") and self.erp_pid:
                pid = ctypes.wintypes.DWORD()
                user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
                if pid.value != self.erp_pid:
                    return True
                    
            cls = _get_class(hwnd)
            # #32770 هو class الـ MessageBox / Dialog القياسي في Windows
            if cls == "#32770":
                title_  = _get_text(hwnd)
                # تجاهل نوافذ التصحيح الخاصة بنا لتجنب التشخيص الخاطئ
                if "رقم القطعة" in title_ or "تعديل رقم" in title_ or "خطأ في NewPoint" in title_:
                    return True
                children = _collect_children(hwnd)
                # نص رسالة الخطأ هو نص الـ Static الأول (عادةً)
                msg = children[0] if children else title_
                found_dialogs.append((hwnd, msg or title_ or "خطأ ERP"))
            return True

        cb = WNDENUMPROC(top_level_cb)
        user32.EnumWindows(cb, 0)

        if found_dialogs:
            _, msg = found_dialogs[0]
            return True, msg
        return False, ""

    # alias للتوافق مع الكود القديم
    def _is_erp_error_popup(self) -> tuple[bool, str]:
        return self._find_erp_dialog()



    def _handle_erp_error_popup(self, row_index: int, part: str,
                                description: str, popup_title: str) -> str:
        """أغلق نافذة خطأ ERP ثم اسأل المستخدم ماذا يريد.
        
        Returns: 'skip' | 'retry:<new_part>' | 'abort'
        """
        import tkinter as tk

        # أغلق نافذة الخطأ أولاً
        import pyautogui as _pag
        if "تراجع" in popup_title or "التراجع" in popup_title:
            logger.info("  [RPA] Revert dialog detected. Pressing ESC to dismiss.")
            _pag.press("escape")
        else:
            _pag.press("enter")   # موافق
        time.sleep(0.3)
        if self._is_erp_error_popup()[0]:
            _pag.press("escape")
            time.sleep(0.3)

        logger.warning(f"  [ERR-POPUP] ERP error: '{popup_title}'")
        print(json.dumps(
            {"type": "erp_error", "row": row_index, "part": part,
             "description": description, "popup_title": popup_title},
            ensure_ascii=False,
        ), flush=True)

        result_holder = ["skip"]

        root = tk.Tk()
        root.title(f"⛔ خطأ في NewPoint ERP — الصف {row_index + 1}")
        root.geometry("520x320")
        root.resizable(False, False)
        root.configure(bg="#0f172a")
        root.attributes("-topmost", True)
        root.lift()
        root.update_idletasks()
        x = (root.winfo_screenwidth() - 520) // 2
        y = (root.winfo_screenheight() - 320) // 2
        root.geometry(f"520x320+{x}+{y}")
        root.focus_force()

        BG, BG2 = "#0f172a", "#1e293b"
        RED, AMBER = "#ef4444", "#f59e0b"
        GRAY, WHITE = "#64748b", "#f1f5f9"
        FONT = "Arial"

        # رأس
        hdr = tk.Frame(root, bg="#3b0000", pady=10)
        hdr.pack(fill="x")
        tk.Label(hdr, text="⛔  خطأ من NewPoint ERP",
                 font=(FONT, 12, "bold"), fg=RED, bg="#3b0000").pack()
        tk.Label(hdr, text=f"الصف {row_index + 1}  —  الروبوت متوقف",
                 font=(FONT, 8), fg=GRAY, bg="#3b0000").pack(pady=(2, 0))

        # رسالة الخطأ
        info = tk.Frame(root, bg=BG2, padx=16, pady=10)
        info.pack(fill="x", padx=16, pady=(10, 0))
        tk.Label(info, text="رسالة ERP:", font=(FONT, 9), fg=GRAY, bg=BG2,
                 anchor="e").grid(row=0, column=0, sticky="e", padx=(0,8))
        tk.Label(info, text=popup_title[:55] if popup_title else "خطأ غير معروف",
                 font=(FONT, 9, "bold"), fg=RED, bg=BG2, anchor="w").grid(
            row=0, column=1, sticky="w")
        tk.Label(info, text="الوصف:", font=(FONT, 9), fg=GRAY, bg=BG2,
                 anchor="e").grid(row=1, column=0, sticky="e", padx=(0,8), pady=(4,0))
        tk.Label(info, text=(description[:50]+"…") if len(description)>50 else description,
                 font=(FONT, 9), fg=WHITE, bg=BG2, anchor="w").grid(
            row=1, column=1, sticky="w", pady=(4,0))
        tk.Label(info, text="الرقم:", font=(FONT, 9), fg=GRAY, bg=BG2,
                 anchor="e").grid(row=2, column=0, sticky="e", padx=(0,8), pady=(4,0))
        tk.Label(info, text=part, font=("Courier New", 10, "bold"), fg=AMBER,
                 bg=BG2, anchor="w").grid(row=2, column=1, sticky="w", pady=(4,0))

        # حقل رقم بديل
        tk.Label(root, text="أدخل رقماً بديلاً (أو اتركه كما هو للتخطي):",
                 font=(FONT, 9, "bold"), fg=WHITE, bg=BG).pack(pady=(12, 4))
        entry_var = tk.StringVar(value=part)
        entry = tk.Entry(root, textvariable=entry_var,
                         font=("Courier New", 13, "bold"), justify="center", width=22,
                         bg="#1e293b", fg=AMBER, insertbackground=AMBER,
                         relief="solid", bd=1, highlightthickness=2,
                         highlightcolor=AMBER, highlightbackground="#334155")
        entry.pack(ipady=6)
        entry.select_range(0, tk.END)
        entry.focus_set()

        btn = tk.Frame(root, bg=BG)
        btn.pack(pady=10)

        def do_retry(event=None):
            val = entry_var.get().strip()
            result_holder[0] = f"retry:{val}" if val and val != part else "skip"
            root.destroy()

        def do_skip(event=None):
            result_holder[0] = "skip"
            root.destroy()

        def do_abort(event=None):
            result_holder[0] = "abort"
            root.destroy()

        entry.bind("<Return>", do_retry)
        entry.bind("<Escape>", do_skip)

        tk.Button(btn, text="🔁  جرب الرقم البديل", command=do_retry,
                  font=(FONT, 10, "bold"), bg=AMBER, fg="black",
                  activebackground="#d97706", relief="flat",
                  padx=14, pady=7, cursor="hand2", bd=0).pack(side="left", padx=6)
        tk.Button(btn, text="⏭  تخطي هذا الصف", command=do_skip,
                  font=(FONT, 9), bg=BG2, fg=GRAY,
                  activebackground="#334155", activeforeground=WHITE,
                  relief="flat", padx=12, pady=7, cursor="hand2", bd=0).pack(side="left", padx=6)
        tk.Button(btn, text="🛑  إيقاف الحقن", command=do_abort,
                  font=(FONT, 9), bg="#3b0000", fg=RED,
                  activebackground="#7f1d1d", activeforeground=RED,
                  relief="flat", padx=12, pady=7, cursor="hand2", bd=0).pack(side="left", padx=6)

        tk.Label(root, text="Enter = جرب  |  Esc = تخطي",
                 font=(FONT, 8), fg=GRAY, bg=BG).pack(pady=(0, 4))
        root.protocol("WM_DELETE_WINDOW", do_skip)
        root.mainloop()

        return result_holder[0]

    def _check_stopped(self):
        """فحص فوري — يرمي UserAbortError إذا تم طلب الإيقاف."""
        if self._stopped:
            raise UserAbortError("تم إيقاف الحقن")

    def _press_tab(self, count: int = 1):
        """Tab مع تأخير — يتوقف فوراً إذا طُلب الإيقاف."""
        for _ in range(count):
            self._check_stopped()
            pyautogui.press("tab")
            time.sleep(self.tab_delay)

    def _clear_active_field(self, is_numeric: bool = False):
        """تفريغ الحقل النشط قبل الكتابة بأمان دون استخدام Ctrl+A لتجنب تحديد الكل في الجدول."""
        self._check_stopped()
        # نتجنب Ctrl+A لأنها تحدد كافة صفوف الجدول في بعض الأنظمة وتسبب طلب التراجع عن العملية
        limit = 15 if is_numeric else 40
        # نرسل المفاتيح كقائمة واحدة لتجنب وقفة PyAutoGUI الافتراضية (0.1ث) بعد كل ضغطة مفتاح
        pyautogui.press(["backspace"] * limit)
        pyautogui.press(["delete"] * 5)
        time.sleep(0.06)

    def _type_text_safe(self, text: str, interval: float, field: str = ""):
        """كتابة مع إيقاف فوري إذا طُلب الإيقاف أو خرج التركيز عن NewPoint."""
        self._check_stopped()
        if not self._is_erp_focused():
            raise FocusLostError(
                f"فُقد التركيز على NewPoint قبل كتابة {field or 'الحقل'}"
            )
        for i, ch in enumerate(str(text)):
            self._check_stopped()
            if i > 0 and i % 2 == 0 and not self._is_erp_focused():
                raise FocusLostError(
                    f"فُقد التركيز أثناء كتابة {field or 'الحقل'} — توقفت الكتابة"
                )
            send_unicode_char(ch)
            time.sleep(interval)

    def _format_number(self, value: float) -> str:
        """تنسيق الرقم: إزالة .0 إذا صحيح."""
        if value == int(value):
            return str(int(value))
        return str(value)

    def _wait_for_user(self, timeout: float = 300):
        """انتظار تأكيد المستخدم (step mode)."""
        self._step_waiting = True
        start = time.time()
        while self._step_waiting:
            if self._stopped:
                raise UserAbortError("تم الإلغاء بواسطة المستخدم")
            if time.time() - start > timeout:
                raise TimeoutError("انتهت مهلة الانتظار (5 دقائق)")
            time.sleep(0.2)

    def _wait_for_search_close(self, timeout: float = 120):
        """انتظار إغلاق نافذة البحث (الموظف يختار أو يلغي)."""
        start = time.time()
        while self._is_search_window_open():
            if self._stopped:
                raise UserAbortError("تم الإلغاء")
            if time.time() - start > timeout:
                raise TimeoutError("نافذة البحث مفتوحة منذ دقيقتين — تم الإلغاء")
            time.sleep(0.3)

    def _add_copy_paste_support(self, entry):
        """إضافة دعم النسخ واللصق وتحديد الكل في بيئة Windows للـ Entry."""
        def select_all(event):
            entry.select_range(0, 'end')
            return "break"
        def copy(event):
            try:
                entry.clipboard_clear()
                entry.clipboard_append(entry.selection_get())
            except Exception:
                pass
            return "break"
        def paste(event):
            try:
                entry.insert('insert', entry.clipboard_get())
            except Exception:
                pass
            return "break"
        def cut(event):
            copy(event)
            try:
                entry.delete('sel.first', 'sel.last')
            except Exception:
                pass
            return "break"

        entry.bind("<Control-a>", select_all)
        entry.bind("<Control-A>", select_all)
        entry.bind("<Control-c>", copy)
        entry.bind("<Control-C>", copy)
        entry.bind("<Control-v>", paste)
        entry.bind("<Control-V>", paste)
        entry.bind("<Control-x>", cut)
        entry.bind("<Control-X>", cut)

    def _ask_user_for_corrected_part(self, row_index: int, part: str, description: str) -> str:
        """نافذة تصحيح احترافية بمظهر داكن راقٍ متناسق مع هوية RuknAuto."""
        import tkinter as tk

        result_holder = ["skip"]

        W, H = 500, 360
        root = tk.Tk()
        root.title(f"تعديل رقم الصنف — الصف {row_index + 1}")
        root.geometry(f"{W}x{H}")
        root.resizable(False, False)
        root.attributes("-topmost", True)
        root.lift()
        root.update_idletasks()
        x = (root.winfo_screenwidth()  - W) // 2
        y = (root.winfo_screenheight() - H) // 2
        root.geometry(f"{W}x{H}+{x}+{y}")
        root.focus_force()

        # ألوان داكنة راقية (Premium Dark Mode)
        BG      = "#0f172a"   # أزرق داكن (slate-900)
        BG_CARD = "#1e293b"   # أزرق داكن متوسط (slate-800)
        ACCENT  = "#10b981"   # أخضر زمردي مريح للعين
        TEXT_P  = "#f8fafc"   # نص رئيسي أبيض (slate-50)
        TEXT_S  = "#94a3b8"   # نص فرعي رمادي (slate-400)
        RED     = "#f87171"   # أحمر ناعم للخطأ
        RED_BG  = "#451a1a"   # خلفية حمراء داكنة لزر الإيقاف
        BORDER  = "#334155"   # حدود (slate-700)
        FONT    = "Segoe UI"

        root.configure(bg=BG)

        # رأس النافذة الأنيق
        hdr = tk.Frame(root, bg=BG_CARD, padx=24, pady=16)
        hdr.pack(fill="x")
        
        tk.Label(hdr,
                 text="رقم الصنف غير موجود",
                 font=(FONT, 14, "bold"), fg=RED, bg=BG_CARD,
                 anchor="e").pack(fill="x")
        tk.Label(hdr,
                 text=f"الصف {row_index + 1}  •  تم إيقاف الروبوت مؤقتاً للتصحيح البشري",
                 font=(FONT, 9), fg=TEXT_S, bg=BG_CARD,
                 anchor="e").pack(fill="x", pady=(4, 0))

        # فاصل ناعم جداً
        tk.Frame(root, bg=BORDER, height=1).pack(fill="x")

        # منطقة البيانات في بطاقة مخصصة
        card = tk.Frame(root, bg=BG_CARD, padx=20, pady=12, bd=0, relief="flat")
        card.pack(fill="x", padx=24, pady=14)

        # تفاصيل الصنف
        desc_text = (description[:45] + "...") if len(description) > 45 else description
        
        # سطر الوصف
        r1 = tk.Frame(card, bg=BG_CARD)
        r1.pack(fill="x", pady=4)
        tk.Label(r1, text="وصف القطعة", font=(FONT, 9), fg=TEXT_S, bg=BG_CARD, anchor="w").pack(side="left")
        tk.Label(r1, text=desc_text, font=(FONT, 10, "bold"), fg=TEXT_P, bg=BG_CARD, anchor="e").pack(side="right")

        # سطر الرقم المرفوض
        r2 = tk.Frame(card, bg=BG_CARD)
        r2.pack(fill="x", pady=4)
        tk.Label(r2, text="الرقم المرفوض", font=(FONT, 9), fg=TEXT_S, bg=BG_CARD, anchor="w").pack(side="left")
        tk.Label(r2, text=part, font=("Consolas", 11, "bold"), fg=RED, bg=BG_CARD, anchor="e").pack(side="right")

        # حقل الإدخال
        inp_frame = tk.Frame(root, bg=BG, padx=24)
        inp_frame.pack(fill="x")
        
        tk.Label(inp_frame, text="أدخل الرقم الصحيح المعتمد في النظام", font=(FONT, 9, "bold"), fg=ACCENT, bg=BG, anchor="e").pack(fill="x", pady=(0, 6))

        entry_var = tk.StringVar(value=part)
        entry = tk.Entry(inp_frame, textvariable=entry_var,
                         font=("Consolas", 13, "bold"),
                         justify="center",
                         bg=BG_CARD, fg=TEXT_P,
                         insertbackground=TEXT_P,
                         relief="flat", bd=0,
                         highlightthickness=1,
                         highlightcolor=ACCENT,
                         highlightbackground=BORDER)
        entry.pack(fill="x", ipady=8)
        entry.select_range(0, tk.END)
        entry.focus_set()
        self._add_copy_paste_support(entry)

        # دوال الأحداث
        def confirm(event=None):
            val = entry_var.get().strip()
            result_holder[0] = val if val else "skip"
            root.destroy()

        def skip_row(event=None):
            result_holder[0] = "skip"
            root.destroy()

        def abort_all(event=None):
            result_holder[0] = "abort"
            root.destroy()

        entry.bind("<Return>", confirm)
        entry.bind("<Escape>", skip_row)

        # منطقة الأزرار بتصميم متناسق ومسطح
        btns = tk.Frame(root, bg=BG, padx=24, pady=16)
        btns.pack(fill="x")

        # زر التأكيد
        tk.Button(btns, text="تأكيد وإدخال",
                  command=confirm,
                  font=(FONT, 9, "bold"),
                  bg=ACCENT, fg="#ffffff",
                  activebackground="#059669", activeforeground="#ffffff",
                  relief="flat", padx=18, pady=7,
                  cursor="hand2", bd=0).pack(side="right", padx=(8, 0))

        # زر التخطي
        tk.Button(btns, text="تخطي الصف",
                  command=skip_row,
                  font=(FONT, 9),
                  bg=BG_CARD, fg=TEXT_S,
                  activebackground=BORDER, activeforeground=TEXT_P,
                  relief="flat", padx=16, pady=7,
                  cursor="hand2", bd=0).pack(side="right")

        # زر الإيقاف
        tk.Button(btns, text="إيقاف نهائي",
                  command=abort_all,
                  font=(FONT, 9),
                  bg=RED_BG, fg=RED,
                  activebackground="#6b1d1d", activeforeground=RED,
                  relief="flat", padx=16, pady=7,
                  cursor="hand2", bd=0).pack(side="left")

        root.protocol("WM_DELETE_WINDOW", skip_row)
        root.mainloop()

        return result_holder[0]


    def _read_active_field_value(self) -> str:
        """قراءة قيمة الحقل النشط عبر Ctrl+A ثم Ctrl+C (clipboard).
        يُستخدم للتحقق أن رقم الصنف تم قبوله.
        """
        import subprocess, platform
        try:
            pyautogui.hotkey("ctrl", "a")
            time.sleep(0.05)
            pyautogui.hotkey("ctrl", "c")
            time.sleep(0.12)
            # Read clipboard
            if platform.system() == "Windows":
                import ctypes
                import ctypes.wintypes
                CF_UNICODETEXT = 13
                kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
                user32   = ctypes.WinDLL("user32",   use_last_error=True)
                if not user32.OpenClipboard(None):
                    return ""
                try:
                    h = user32.GetClipboardData(CF_UNICODETEXT)
                    if not h:
                        return ""
                    ptr = kernel32.GlobalLock(h)
                    if not ptr:
                        return ""
                    value = ctypes.wstring_at(ptr)
                    kernel32.GlobalUnlock(h)
                    return value.strip()
                finally:
                    user32.CloseClipboard()
        except Exception:
            return ""

    def _verify_part_accepted(self, expected_part: str) -> bool:
        """تحقق ذكي: هل ظهرت نافذة بحث بعد ضغطة Enter ؟
        إذا ظهرت = الرقم غير موجود في ERP.
        إذا لم تظهر = تم القبول.
        لا نستخدم عنوان النافذة كمؤشر لأنه غير موثوق.
        """
        time.sleep(0.3)  # دع ERP يستقر
        # الإشارة الوحيدة الموثوقة: هل ظهرت نافذة بحث / بحث عن صنف؟
        return not self._is_search_window_open()

    # ───────────────────────────────────────────────────────
    #  Core: حقن صف واحد
    # ───────────────────────────────────────────────────────
    def inject_row(
        self, item: dict, row_index: int = 0,
        on_search_window=None,
        on_step_pause=None,
        on_request_part=None,
        on_resolve_quantity=None,
    ) -> dict:
        """Inject one row into the NewPoint Grid.

        Args:
            item: dict with part_number, quantity, unit_cost, optional _part_confirmed
            row_index: row number (for logging)
            on_search_window: Callback(index, part) — called when search window appears
            on_step_pause: Callback(index, part) — called when pausing for user verification
            on_request_part: Callback(index, description, suggested) -> str — user must
                confirm part number BEFORE any ERP keystrokes (blocks until returned)

        Returns:
            dict with status and details
        """
        # ── Step 0: تأكيد الرقم (يُتخطى إذا موثوق في الذاكرة) ──
        suggested = (
            str(item.get("part_number", "")).strip()
            or str(item.get("suggested_part_number", "")).strip()
        )
        manual_review = bool(item.get("_manual_review"))
        if item.get("_part_trusted") and suggested and not manual_review:
            part = suggested
            logger.info(f"Row {row_index+1}: trusted part '{part}' — no prompt")
        elif not on_request_part:
            if not suggested:
                raise ValueError("لا يوجد رقم صنف ولا معالج تأكيد من الواجهة")
            part = suggested
        else:
            logger.info(
                f"Row {row_index+1}: confirm part for "
                f"'{item.get('description', '')}' (default={suggested or '—'})"
            )
            part = on_request_part(
                row_index,
                item.get("description", ""),
                suggested,
            )
            part = str(part).strip()
            if not part:
                raise ValueError("لم يتم تأكيد رقم الصنف للقطعة")
        item["part_number"] = part

        # ── Step 0b: كمية ERP = إجمالي القطع (كراتين × قطع/كرتون — وليس عدد الكراتين) ──
        from unit_logic import erp_quantity_for_injection, erp_unit_cost_for_injection

        qty_val, need_resolve = erp_quantity_for_injection(item)
        if need_resolve:
            if not on_resolve_quantity:
                inv = item.get("_invoice_quantity", "?")
                raise ValueError(
                    f"صنف بالكرتون ({inv}) — يجب تحديد عدد القطع داخل الكرتون أولاً"
                )
            qty_val = float(on_resolve_quantity(row_index, item))
        item["_erp_quantity"] = qty_val
        item["quantity"] = qty_val
        item["_needs_pack_factor"] = False

        inv_log = item.get("_invoice_quantity", "")
        if item.get("_unit_kind") == "pack" and item.get("_pack_factor"):
            logger.info(
                f"  Pack qty: {inv_log} carton(s) × {item['_pack_factor']} "
                f"= {qty_val} piece(s) → ERP"
            )

        price_val = erp_unit_cost_for_injection(item)
        item["unit_cost"] = price_val
        item["_erp_unit_cost"] = price_val
        inv_price = item.get("_invoice_unit_cost")
        factor = item.get("_pack_factor")
        if inv_price and factor and int(factor) > 1 and float(inv_price) != price_val:
            logger.info(
                f"  Pack price: {inv_price} / {factor} = {price_val} per piece → ERP"
            )

        qty   = self._format_number(qty_val)
        price = self._format_number(price_val)

        logger.info(f"Row {row_index+1}: part={part} (confirmed), qty={qty}, price={price}")

        # ── Step 1: انتظار Focus على NewPoint ──
        self._wait_for_erp_focus(timeout=60)

        # ── Step 2: كتابة رقم الصنف ──
        logger.debug(f"  Typing part number: {part}")
        self._clear_active_field()
        self._type_text_safe(part, interval=self.char_interval, field="رقم الصنف")

        # ── Step 3: انتظار popup الإكمال التلقائي ──
        time.sleep(self.search_wait)

        # ── Step 4: Enter لتأكيد رقم الصنف ──
        self._check_stopped()
        pyautogui.press("enter")
        time.sleep(self.after_enter)

        # ── Step 5: تحقق من أي نافذة غير متوقعة بعد Enter ──
        # إذا كان ERP بطيئاً (مثلاً يجلب بيانات من سيرفر بعيد)، قد تتأخر نافذة البحث بالظهور.
        # سنراقب النوافذ لمدة `validation_wait` ثانية لضمان التقاطها فور ظهورها.
        search_opened = False
        err_popup = False
        err_title = ""
        
        check_start = time.time()
        while time.time() - check_start < self.validation_wait:
            search_opened = self._is_search_window_open()
            err_popup, err_title = self._is_erp_error_popup()
            if search_opened or err_popup:
                break
            time.sleep(0.15)
            self._check_stopped()

        # ── معالجة نوافذ الخطأ (تكرار رقم، قيمة غير صالحة، إلخ) ──
        if err_popup and not search_opened:
            desc = item.get("description", "")
            original_part = part  # الرقم الأصلي قبل أي تصحيح
            while True:
                resolution = self._handle_erp_error_popup(
                    row_index, part, desc, err_title
                )
                if resolution == "abort":
                    raise UserAbortError(
                        f"المستخدم اختار إيقاف الحقن عند الصف {row_index+1} بسبب خطأ ERP"
                    )
                elif resolution == "skip":
                    print(json.dumps(
                        {"type": "part_skipped", "row": row_index,
                         "part": part, "description": desc,
                         "reason": f"ERP error: {err_title}"},
                        ensure_ascii=False,
                    ), flush=True)
                    self._clear_active_field()
                    raise PartNotFoundError(
                        f"تم تخطي الصف {row_index+1} بسبب خطأ ERP: {err_title}"
                    )
                elif resolution.startswith("retry:"):
                    new_part = resolution[6:].strip()
                    if not new_part:
                        # حقل فارغ = تخطي
                        self._clear_active_field()
                        raise PartNotFoundError(
                            f"تم تخطي الصف {row_index+1} (رقم فارغ بعد خطأ ERP)"
                        )
                    logger.info(f"  [RETRY] Trying alternative part '{new_part}'...")
                    part = new_part
                    item["part_number"] = part
                    self._wait_for_erp_focus(timeout=30)
                    self._clear_active_field()
                    self._type_text_safe(part, interval=self.char_interval,
                                         field="رقم الصنف (بديل)")
                    time.sleep(self.search_wait)
                    pyautogui.press("enter")
                    time.sleep(self.after_enter)
                    # تحقق مجدداً بانتظار متكرر
                    search_opened = False
                    err_popup = False
                    err_title = ""
                    check_start = time.time()
                    while time.time() - check_start < self.validation_wait:
                        search_opened = self._is_search_window_open()
                        err_popup, err_title = self._is_erp_error_popup()
                        if search_opened or err_popup:
                            break
                        time.sleep(0.15)
                        self._check_stopped()

                    if not err_popup and not search_opened:
                        # ✅ قُبل
                        print(json.dumps(
                            {"type": "part_corrected", "row": row_index,
                             "corrected": part, "original": original_part,
                             "description": desc},
                            ensure_ascii=False,
                        ), flush=True)
                        break
                    elif search_opened:
                        # تحوّل لحالة "غير موجود" — اكسر الحلقة لمتابعة المعالجة العادية
                        break
                    # وإلا: خطأ جديد → الحلقة تكرر

        if search_opened:
            logger.warning(f"  [!] Search window opened for '{part}' -- part not found in ERP!")

            desc = item.get("description", "")

            # ══════════════════════════════════════════════════════════
            #  FIX v4: حلقة لا تنتهي حتى يقبل ERP الرقم أو يضغط المستخدم تخطي
            #  كل مرة يُرفض الرقم → النافذة تعود فوراً مع الرقم الجديد
            # ══════════════════════════════════════════════════════════
            rejected_part = part  # الرقم المرفوض الحالي (يتحدث في كل دورة)
            original_part = part  # الرقم الأصلي قبل أي تصحيح
            attempt = 0

            while True:
                attempt += 1
                logger.info(f"  [ESC] Attempt {attempt}: closing search window...")
                pyautogui.press("escape")
                time.sleep(0.5)
                # تأكيد الإغلاق
                if self._is_search_window_open():
                    pyautogui.press("escape")
                    time.sleep(0.5)

                # أبلغ الـ frontend (للـ log فقط)
                print(json.dumps(
                    {"type": "input_required", "row": row_index,
                     "part": rejected_part, "description": desc, "attempt": attempt},
                    ensure_ascii=False,
                ), flush=True)

                logger.info(f"  [DIALOG] Showing correction dialog (attempt {attempt})...")
                corrected = self._ask_user_for_corrected_part(row_index, rejected_part, desc)

                if corrected == "abort":
                    logger.info(f"  [ABORT] User chose to abort all injection at row {row_index+1}")
                    print(json.dumps(
                        {"type": "aborted", "row": row_index,
                         "reason": "user_abort_from_dialog"},
                        ensure_ascii=False,
                    ), flush=True)
                    raise UserAbortError(
                        f"المستخدم اختار إيقاف الحقن نهائياً عند الصف {row_index+1}"
                    )

                if corrected == "skip" or not corrected:
                    logger.info(f"  [SKIP] Row {row_index+1} skipped after {attempt} attempt(s)")
                    self._clear_active_field()
                    print(json.dumps(
                        {"type": "part_skipped", "row": row_index,
                         "part": rejected_part, "description": desc},
                        ensure_ascii=False,
                    ), flush=True)
                    raise PartNotFoundError(
                        f"تم تخطي الصنف '{desc}' بعد {attempt} محاولة/محاولات"
                    )

                logger.info(f"  [RETYPE] Writing corrected part '{corrected}'...")
                part = corrected
                item["part_number"] = part

                # انتظر التركيز على NewPoint
                self._wait_for_erp_focus(timeout=60)

                # اكتب الرقم في الحقل الحالي
                self._clear_active_field()
                self._type_text_safe(part, interval=self.char_interval, field=f"رقم الصنف (محاولة {attempt})")
                time.sleep(self.search_wait)
                pyautogui.press("enter")
                time.sleep(self.after_enter)

                # هل فُتحت نافذة البحث أو ظهر خطأ مجدداً؟ (فحص متكرر للبطء)
                search_again = False
                err_popup_again = False
                err_title_again = ""
                check_start = time.time()
                while time.time() - check_start < self.validation_wait:
                    search_again = self._is_search_window_open()
                    err_popup_again, err_title_again = self._is_erp_error_popup()
                    if search_again or err_popup_again:
                        break
                    time.sleep(0.15)
                    self._check_stopped()

                if err_popup_again and not search_again:
                    resolution = self._handle_erp_error_popup(
                        row_index, part, desc, err_title_again
                    )
                    if resolution == "abort":
                        raise UserAbortError(f"المستخدم اختار إيقاف الحقن")
                    elif resolution == "skip":
                        self._clear_active_field()
                        raise PartNotFoundError(f"تم تخطي الصف بسبب خطأ ERP: {err_title_again}")
                    elif resolution.startswith("retry:"):
                        part = resolution[6:].strip()
                        rejected_part = part
                        continue

                if not search_again and not err_popup_again:
                    # ✅ ERP قبل الرقم — اخرج من الحلقة
                    logger.info(f"  [OK] Part '{part}' accepted by ERP after {attempt} attempt(s)")
                    print(json.dumps(
                        {"type": "part_corrected", "row": row_index,
                         "corrected": part, "original": original_part,
                         "description": desc, "attempt": attempt},
                        ensure_ascii=False,
                    ), flush=True)
                    break
                else:
                    # ❌ رُفض مجدداً — أعد الحلقة مع الرقم الجديد كـ "مرفوض"
                    logger.warning(f"  [!] Corrected part '{part}' also rejected — showing dialog again...")
                    rejected_part = part  # حدّث الرقم المرفوض للدورة القادمة
                    time.sleep(0.2)

            # تحديث qty/price بعد نجاح القبول
            qty = self._format_number(item["quantity"])
            price = self._format_number(item["unit_cost"])
        else:
            logger.debug(f"  [OK] Part '{part}' accepted by ERP (no search window)")


        # ── Step 6: Tab للوصول للكمية ──
        if self.tabs_to_qty > 0:
            logger.debug(f"  Tab ×{self.tabs_to_qty} to quantity")
            self._press_tab(self.tabs_to_qty)

        # ── Step 7: كتابة الكمية ──
        logger.debug(f"  Typing quantity: {qty}")
        self._clear_active_field(is_numeric=True)
        self._type_text_safe(qty, interval=self.num_interval, field="الكمية")
        time.sleep(0.2)

        # ── Step 8: Tab للسعر ──
        if self.tabs_to_price > 0:
            logger.debug(f"  Tab ×{self.tabs_to_price} to price")
            self._press_tab(self.tabs_to_price)

        # ── Step 9: كتابة السعر ──
        logger.debug(f"  Typing price: {price}")
        self._clear_active_field(is_numeric=True)
        self._type_text_safe(price, interval=self.num_interval, field="السعر")
        time.sleep(0.2)

        # ══════════════════════════════════════════════════
        #  FIX CRITICAL: Tab بعد السعر (وليس Enter!)
        #  Enter كان يذهب لحقل خصم% → يكتب بيانات الصف التالي فيه!
        #  الحل: Tab عبر الحقول المتبقية للوصول لرقم الصنف في الصف التالي
        # ══════════════════════════════════════════════════
        if self.tabs_after_price > 0:
            logger.debug(f"  Tab ×{self.tabs_after_price} to next row (skipping خصم/ضريبة/إجمالي)")
            self._press_tab(self.tabs_after_price)

        time.sleep(self.row_settle)

        result = {
            "index": row_index,
            "status": "success",
            "part_number": part,
            "quantity": qty,
            "price": price,
        }

        # ── Step 10: Step Mode — وقفة للتحقق ──
        if self.step_mode and on_step_pause:
            logger.info(f"  [PAUSE] Step mode: waiting for employee verification...")
            on_step_pause(row_index, part)
            self._wait_for_user(timeout=300)
            logger.info(f"  [PLAY] Employee confirmed -- waiting for NewPoint focus...")
            # بعد التأكيد، الـ Focus على RuknAuto GUI
            # ننتظر الموظف يرجع لـ NewPoint قبل المتابعة
            self._wait_for_erp_focus(timeout=60)

        return result

    # ───────────────────────────────────────────────────────
    #  Core: حقن فاتورة كاملة
    # ───────────────────────────────────────────────────────
    def inject_invoice(
        self,
        items: list,
        start_from: int = 0,
        end_at: int = None,
        on_progress=None,
        on_row_done=None,
        on_error=None,
        on_search_window=None,
        on_step_pause=None,
        on_request_part=None,
        on_resolve_quantity=None,
        checkpoint_path: str = None,
    ) -> list:
        """Inject all invoice items into the Grid.

        Args:
            items:            List of item dicts
            start_from:       Resume from this row index (0-based)
            on_progress:      Callback(index, total, status_str)
            on_row_done:      Callback(result_dict)
            on_error:         Callback(index, part, error) → "skip"|"stop"|"retry"
            on_search_window: Callback(index, part) — search window appeared
            on_step_pause:    Callback(index, part) — pausing for verification
            on_request_part:  Callback(index, description, suggested) -> str
            checkpoint_path:  Path to JSON file to save last successful row index for resume
            end_at:           Row index to stop at (exclusive, 0-based)

        Returns:
            List of result dicts for each row.
        """
        self.reset()
        results = []
        total = len(items)

        # Load checkpoint if provided and start_from not explicitly given
        if checkpoint_path and start_from == 0:
            try:
                import os
                if os.path.exists(checkpoint_path):
                    with open(checkpoint_path, "r", encoding="utf-8") as f:
                        ck = json.load(f)
                    start_from = ck.get("last_successful_row", 0)
                    if start_from >= total:
                        # Stale/completed checkpoint — reset and delete
                        logger.info(f"[CHECKPOINT] Stale checkpoint (row {start_from} >= total {total}) — starting from row 1")
                        start_from = 0
                        try:
                            os.remove(checkpoint_path)
                        except Exception:
                            pass
                    elif start_from > 0:
                        logger.info(f"[RESUME] Resuming from checkpoint: row {start_from + 1}")
            except Exception as e:
                logger.warning(f"Could not read checkpoint: {e}")

        end_limit = total
        if end_at is not None and end_at < total:
            end_limit = end_at

        for i in range(start_from, end_limit):
            if self._stopped:
                logger.info("Injection stopped by user")
                break

            # Pause loop
            while self._paused and not self._stopped:
                time.sleep(0.3)
            if self._stopped:
                break

            item = items[i]
            if on_progress:
                on_progress(i, total, "running")

            retry_count = 0
            max_retries = 1

            while retry_count <= max_retries:
                try:
                    result = self.inject_row(
                        item, i,
                        on_search_window=on_search_window,
                        on_step_pause=on_step_pause,
                        on_request_part=on_request_part,
                        on_resolve_quantity=on_resolve_quantity,
                    )
                    results.append(result)
                    if on_row_done:
                        on_row_done(result)
                    if on_progress:
                        on_progress(i, total, "success")

                    # ── حفظ نقطة الاستئناف بعد كل صف ناجح ──
                    if checkpoint_path:
                        try:
                            with open(checkpoint_path, "w", encoding="utf-8") as f:
                                json.dump({
                                    "last_successful_row": i + 1,
                                    "total": total,
                                    "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                                }, f, ensure_ascii=False)
                        except Exception as ck_err:
                            logger.warning(f"Could not write checkpoint: {ck_err}")
                    break

                except (FocusLostError, PartNotFoundError, PartValidationError) as e:
                    error_str = str(e)
                    logger.error(f"Row {i+1} error: {error_str}")

                    # ── تحذير سرعة: إذا وضع السرعة مفعّل، أبلغ الواجهة ──
                    if getattr(self, 'fast_mode', False):
                        print(json.dumps({
                            "status": "speed_warning",
                            "row": i,
                            "part": item.get("part_number", "?"),
                            "message": f"⚡ خطأ في وضع السرعة بالصف {i+1} — قد يكون التسريع السبب. الصنف تجاوز تلقائياً.",
                        }), flush=True)
                        time.sleep(0.5)  # فترة تهدئة قصيرة بعد الخطأ

                    action = "skip"
                    if on_error:
                        action = on_error(i, item.get("part_number", "?"), error_str)

                    if action == "retry" and retry_count < max_retries:
                        retry_count += 1
                        time.sleep(1.0)
                        continue
                    elif action == "stop":
                        self._stopped = True
                    # skip
                    results.append({
                        "index": i, "status": "skipped",
                        "part_number": item.get("part_number", "?"),
                        "error": error_str,
                    })
                    if on_progress:
                        on_progress(i, total, "skipped")
                    break

                except UserAbortError:
                    logger.info("User aborted")
                    self._stopped = True
                    results.append({
                        "index": i, "status": "aborted",
                        "part_number": item.get("part_number", "?"),
                        "error": "تم الإلغاء بواسطة المستخدم",
                    })
                    break

                except Exception as e:
                    logger.exception(f"Unexpected error on row {i+1}")
                    results.append({
                        "index": i, "status": "error",
                        "part_number": item.get("part_number", "?"),
                        "error": str(e),
                    })
                    if on_progress:
                        on_progress(i, total, "error")
                    break

        # ── حذف نقطة الاستئناف عند الاكتمال الناجح ──
        if checkpoint_path:
            ok_count = sum(1 for r in results if r.get("status") == "success")
            if ok_count == total:
                try:
                    import os
                    if os.path.exists(checkpoint_path):
                        os.remove(checkpoint_path)
                        logger.info("[OK] Checkpoint deleted -- injection complete")
                except Exception:
                    pass

        # Summary
        ok = sum(1 for r in results if r.get("status") == "success")
        fail = len(results) - ok
        logger.info(f"Complete: {ok} OK, {fail} errors/skipped out of {total}")

        return results


# ═══════════════════════════════════════════════════════════
#  Standalone CLI Test
# ═══════════════════════════════════════════════════════════

if __name__ == "__main__":
    import sys

    logging.basicConfig(
        level=logging.DEBUG,
        format="%(asctime)s %(levelname)s %(message)s",
    )

    test_items = [
        {"part_number": "x66a", "quantity": 30, "unit_cost": 13.5},
    ]

    config_path = sys.argv[1] if len(sys.argv) > 1 else "config.json"
    engine = RpaEngine(config_path)
    engine.step_mode = False  # CLI = no step mode

    print("=" * 55)
    print("  RuknAuto — RPA Engine v2 (Smart)")
    print("=" * 55)
    for i, item in enumerate(test_items, 1):
        print(f"  {i}. {item['part_number']:20s}  qty={item['quantity']}  price={item['unit_cost']}")
    print()
    print("  Click on the first empty row in NewPoint ERP...")

    for i in range(7, 0, -1):
        print(f"  [{i}]...", flush=True)
        time.sleep(1)

    def on_progress(idx, total, status):
        icons = {"running": "[..]", "success": "[OK]", "error": "[ERR]", "skipped": "[SKIP]"}
        print(f"  {icons.get(status, '?')} Row {idx+1}/{total}: {status}")

    def on_search(idx, part):
        print(f"  [!] Search window open for '{part}' -- select item or close window...")

    def on_error(idx, part, error):
        print(f"  [ERR] Error: {part}: {error}")
        return "skip"

    results = engine.inject_invoice(
        test_items,
        on_progress=on_progress,
        on_search_window=on_search,
        on_error=on_error,
    )

    ok = sum(1 for r in results if r.get("status") == "success")
    print(f"\n[OK] Results: {ok}/{len(test_items)} successful")
