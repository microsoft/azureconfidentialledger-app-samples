FROM mcr.microsoft.com/mirror/docker/library/ubuntu:20.04

ENV TZ=Europe

RUN apt update && apt install -y openssh-server
RUN apt update && apt install -y python3 python3-pip

ADD src/requirements.txt src/requirements.txt

RUN pip install -r src/requirements.txt

ADD src src

WORKDIR /src


CMD tail -f /dev/null
