import os
from app import create_app
from app.config import FLASK_DEBUG, FLASK_PORT

app = create_app()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", FLASK_PORT))
    app.run(host="0.0.0.0", port=port, debug=FLASK_DEBUG)
