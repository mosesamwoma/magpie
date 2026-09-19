import os
from app import create_app
from app.config import FLASK_DEBUG

app = create_app()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=FLASK_DEBUG)