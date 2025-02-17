FROM mcr.microsoft.com/mirror/docker/library/ubuntu:24.04 AS builder

ARG HUGGINGFACE_TOKEN

WORKDIR /src 

RUN apt update && apt install -y python3 python3-pip

RUN pip install --break-system-packages huggingface-hub

ENV HUGGINGFACE_HUB_ADD_TOKEN_AS_GIT_CREDENTIAL=false
RUN huggingface-cli login --token $HUGGINGFACE_TOKEN
RUN huggingface-cli download microsoft/Phi-3-mini-4k-instruct-gguf Phi-3-mini-4k-instruct-q4.gguf --local-dir . --local-dir-use-symlinks False

FROM mcr.microsoft.com/mirror/docker/library/ubuntu:24.04

ENV TZ=Europe

RUN apt update && apt install -y openssh-server git bash
RUN apt update && apt install -y python3 python3-pip python3-venv


# This must be run on the same CPU as the target deployment, so defer until startup.
#ADD src/requirements.txt /src/requirements.txt
#RUN pip install --break-system-packages -r /src/requirements.txt

WORKDIR /src

COPY --from=builder /src .

ADD src .

CMD pip install --break-system-packages -r /src/requirements.txt && tail -f /dev/null
