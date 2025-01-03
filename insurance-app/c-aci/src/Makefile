.PHONY: build-grpc
build-grpc:
	python -m grpc_tools.protoc -I. --python_out=. --grpc_python_out=. ./attestation-service.proto
