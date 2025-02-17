from flask import Flask, jsonify, request
from itertools import cycle
import argparse

from crypto import generate_or_read_cert

app = Flask(__name__)


@app.route("/app/ccf-cert", methods=["GET"])
def get_user_cert():
    print("Requested user cert")
    return "deadbeef", 200


@app.route("/app/processor", methods=["PUT"])
def register_processor():
    print("Registered processor")
    print(request.get_json())
    return "", 200


incidents = cycle(
    [
        {
            "caseId": 1,
            "incident": "The policyholder hit a car",
            "policy": "This policy covers all claims",
        },
        {
            "caseId": 2,
            "incident": "The policyholder hit a car",
            "policy": "This policy denies all claims",
        },
        {"caseId": 1, "policy": "This policy covers all claims"},
        {"caseId": 1, "incident": "The policyholder hit a car"},
        {
            "incident": "The policyholder hit a car",
            "policy": "This policy covers all claims",
        },
        {
            "caseId": "asdf",
            "incident": "The policyholder hit a car",
            "policy": "This policy covers all claims",
        },
        None,
    ]
)


@app.route("/app/cases/next", methods=["GET"])
def get_next_incident():
    response = next(incidents)
    if response is not None:
        print(f"Getting next incident as: {response}")
        return jsonify(response), 200
    else:
        print("Getting next incident as asdf")
        return "asdf", 200


@app.route("/app/cases/indexed/<caseId>/decision", methods=["PUT"])
def put_incident_decision(caseId):
    print(f"Setting decision for {caseId}")
    print(request.get_json())
    return "", 200


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    keypath, certpath = generate_or_read_cert()

    app.run(debug=True, port=args.port, ssl_context=(certpath, keypath))
