from flask import jsonify


def error_response(message: str, status: int, code: str | None = None):
    body = {"error": message}
    if code:
        body["code"] = code
    return jsonify(body), status
