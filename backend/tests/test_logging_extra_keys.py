"""
Сторож: ключи extra в вызовах логгера не должны совпадать с атрибутами LogRecord.

logging падает на таком вызове с KeyError «Attempt to overwrite 'created' in LogRecord»,
и падает только когда логгер включён — поэтому ошибка годами прячется и всплывает
вдруг, в середине рабочего запроса (так ручная загрузка из Firebird отдавала 500).
"""
import ast
import logging
import pathlib

APP_ROOT = pathlib.Path(__file__).resolve().parent.parent / "app"
RESERVED = set(vars(logging.LogRecord("x", 0, "x", 0, "x", None, None))) | {"message", "asctime"}
LOG_METHODS = {"debug", "info", "warning", "warn", "error", "exception", "critical", "log"}


def _reserved_extra_keys():
    for path in sorted(APP_ROOT.rglob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
                    and node.func.attr in LOG_METHODS):
                continue
            for keyword in node.keywords:
                if keyword.arg != "extra" or not isinstance(keyword.value, ast.Dict):
                    continue
                for key in keyword.value.keys:
                    if isinstance(key, ast.Constant) and key.value in RESERVED:
                        yield f"{path.relative_to(APP_ROOT.parent)}:{key.lineno} «{key.value}»"


def test_logger_extra_does_not_overwrite_log_record_fields():
    offenders = list(_reserved_extra_keys())
    assert offenders == [], "Переименуйте ключи extra: " + ", ".join(offenders)
