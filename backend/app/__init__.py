from flask import Flask
from .routes import bp
import os

def create_app():
    # Point Flask at the frontend folder (one level up from backend/)
    frontend_dir = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "frontend")
    )

    app = Flask(
        __name__,
        template_folder=os.path.join(frontend_dir, "templates"),
        static_folder=os.path.join(frontend_dir, "static"),
        static_url_path="/static",
    )

    app.register_blueprint(bp)
    return app
