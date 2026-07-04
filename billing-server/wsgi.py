import importlib
import threading

config = importlib.import_module("config")
app_module = importlib.import_module("app")
database = importlib.import_module("database")


config.validate_config()
database.init_db()

if not config.DISABLE_SETTLEMENT_LOOP:
    threading.Thread(target=app_module._settlement_loop, daemon=True).start()

app = app_module.create_app()
