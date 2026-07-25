FROM python:3.12-slim

WORKDIR /usr/src/app

COPY requirements.txt ./
RUN python -m pip install --upgrade pip \
  && pip install -r requirements.txt

COPY . .
RUN chmod +x ./build.sh \
  && ls -la ./build.sh \
  && ./build.sh

ENV PYTHONUNBUFFERED=1
EXPOSE 80

CMD ["gunicorn", "outlaws.wsgi:application", "--bind", "0.0.0.0:80"]
